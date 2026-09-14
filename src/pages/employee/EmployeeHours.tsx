import { useState, useEffect, useMemo } from 'react';
import { Clock, CalendarDays, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useLang } from '../../hooks/useLang';
import { formatTime } from '../../lib/utils';
import type { Assignment, Property } from '../../lib/types';

interface AssignmentWithProperty extends Assignment {
  property: Property;
}

// Stunden-Tab der Mitarbeiter-App: Uebersicht der bereits gearbeiteten
// Stunden. Nutzt dieselbe "Ist-Zeit vor Soll-Zeit"-Logik wie die Abrechnung
// des Inhabers (Payroll.tsx) — tatsaechliche Check-in/-out-Zeit hat Vorrang
// vor der geplanten Zeit — nur auf den eigenen Mitarbeiter beschraenkt und
// ohne Lohn-/Export-Funktionen, die dem Mitarbeiter nichts angehen.
export function EmployeeHours() {
  const { user } = useAuth();
  const { t, rtl } = useLang();
  const [assignments, setAssignments] = useState<AssignmentWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (!user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedMonth]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await supabase
        .from('assignments')
        .select('*, property:properties(*)')
        .eq('employee_id', emp.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: false });

      setAssignments((data as unknown as AssignmentWithProperty[]) || []);
    } finally {
      setLoading(false);
    }
  }

  // Minuten pro Einsatz: tatsaechliche Check-in/-out-Dauer hat Vorrang,
  // sonst die geplante Zeit (nur fuer abgeschlossene/laufende Einsaetze).
  const minutesFor = (a: AssignmentWithProperty): number => {
    if (a.status === 'completed' && a.checked_in_at && a.completed_at) {
      return Math.max(0, Math.round((new Date(a.completed_at).getTime() - new Date(a.checked_in_at).getTime()) / 60000));
    }
    if (a.status !== 'completed' && a.status !== 'checked_in') return 0;
    const tf = a.time_from ?? a.property?.time_from;
    const tt = a.time_to ?? a.property?.time_to;
    if (!tf || !tt) return 0;
    const [fromH, fromM] = tf.split(':').map(Number);
    const [toH, toM] = tt.split(':').map(Number);
    return Math.max(0, (toH * 60 + toM) - (fromH * 60 + fromM));
  };

  const countedAssignments = useMemo(
    () => assignments.filter(a => a.status === 'completed' || a.status === 'checked_in'),
    [assignments]
  );
  const totalMinutes = useMemo(
    () => countedAssignments.reduce((sum, a) => sum + minutesFor(a), 0),
    [countedAssignments]
  );

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      options.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
  }, []);

  return (
    <div className={`min-h-screen bg-surface-50 px-5 sm:px-6 pt-12 pb-24 max-w-md mx-auto ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-ink-900 tracking-tight">{t('tabHours')}</h1>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="input-field !w-auto !py-2 !text-sm"
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="card p-5 mb-4 flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-brand-50 flex items-center justify-center shrink-0">
          <Clock size={20} className="text-brand-600" />
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-ink-900 leading-none">
            {(totalMinutes / 60).toFixed(1)} <span className="text-sm font-medium text-ink-300">Std.</span>
          </p>
          <p className="text-xs text-ink-500 mt-1.5">
            {countedAssignments.length} {countedAssignments.length === 1 ? 'Einsatz' : 'Einsätze'}
          </p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-10 text-center">
          <div className="w-6 h-6 border-2 border-surface-200 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarDays size={28} className="text-ink-300 mx-auto mb-3" />
          <p className="text-sm text-ink-500">{t('noAssignmentsThisMonth')}</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-200">
          {assignments.map(a => {
            const tf = a.time_from ?? a.property?.time_from;
            const tt = a.time_to ?? a.property?.time_to;
            const minutes = minutesFor(a);
            const isCounted = a.status === 'completed' || a.status === 'checked_in';
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 text-center shrink-0">
                  <p className="text-sm font-semibold text-ink-900">{new Date(a.date).getDate()}</p>
                  <p className="text-[10px] text-ink-300 uppercase">{new Date(a.date).toLocaleDateString('de-DE', { weekday: 'short' })}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{a.property?.name}</p>
                  {tf && tt && (
                    <p className="text-xs text-ink-500 flex items-center gap-1.5 mt-0.5">
                      <Clock size={11} className="text-ink-300" /> {formatTime(tf)} – {formatTime(tt)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {a.status === 'completed' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 bg-brand-50 px-2 py-1 rounded-full"><Check size={10} /> Fertig</span>
                  )}
                  {a.status === 'checked_in' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full"><Clock size={10} /> Aktiv</span>
                  )}
                  {a.status === 'cancelled' && (
                    <span className="text-[10px] font-semibold text-danger-500 bg-danger-50 px-2 py-1 rounded-full">Storniert</span>
                  )}
                  {a.status === 'assigned' && (
                    <span className="text-[10px] font-semibold text-ink-500 bg-surface-100 px-2 py-1 rounded-full">Geplant</span>
                  )}
                  {isCounted && minutes > 0 && (
                    <p className="text-[11px] text-ink-500 mt-1">{(minutes / 60).toFixed(1)} Std.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
