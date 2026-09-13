import { useState, useEffect, useMemo } from 'react';
import type { DragEvent, Dispatch, SetStateAction } from 'react';
import { Plus, Calendar, MapPin, Clock, Check, X, AlertTriangle, ChevronLeft, ChevronRight, Trash2, Repeat, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../../components/shared/Modal';
import { Avatar } from '../../components/shared/Avatar';
import { useToast } from '../../components/shared/Toast';
import { RemoveAssignmentModal } from '../../components/owner/RemoveAssignmentModal';
import { formatTime, getDayAbbrev, toLocalDateStr } from '../../lib/utils';
import { sendPushToEmployee } from '../../hooks/usePushNotifications';
import type { Employee, Property, Assignment, Company, SickReport } from '../../lib/types';

const weekdayOptions = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const durationOptions = [
  { weeks: 4, label: '4 Wochen' },
  { weeks: 8, label: '8 Wochen' },
  { weeks: 12, label: '12 Wochen' },
  { weeks: 26, label: '26 Wochen' },
];

interface AssignmentsProps {
  company: Company;
  refreshKey: number;
  onRefresh: () => void;
}

interface AssignmentWithDetails extends Assignment {
  employee: Employee;
  property: Property;
}

export function Assignments({ company, refreshKey, onRefresh }: AssignmentsProps) {
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sickReports, setSickReports] = useState<SickReport[]>([]);
  const [replacementRequests, setReplacementRequests] = useState<{ id: string; sick_report_id: string; property_id: string; status: string; replacement_employee_id: string; replacement_employee?: Employee }[]>([]);
  const [addModal, setAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));
  // War vorher useState(false) — beim allerersten Laden blitzte dadurch kurz
  // "Keine Einsätze für diesen Tag" auf, bevor die echten Daten da waren,
  // anders als bei Dashboard/Controlling, die mit true starten.
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  // Wochenansicht
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [weekAssignments, setWeekAssignments] = useState<AssignmentWithDetails[]>([]);
  const [weekSickReports, setWeekSickReports] = useState<{ employee_id: string; date: string; date_to: string | null }[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  const [newPropertyId, setNewPropertyId] = useState('');
  const [newDate, setNewDate] = useState(toLocalDateStr(new Date()));
  const [newEmployeeIds, setNewEmployeeIds] = useState<string[]>([]);
  const [newTimeFrom, setNewTimeFrom] = useState('');
  const [newTimeTo, setNewTimeTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<AssignmentWithDetails | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<AssignmentWithDetails[] | null>(null);
  const [deleteSeriesConfirm, setDeleteSeriesConfirm] = useState<{ recurringOrderId: string; propertyName: string } | null>(null);

  // Wiederkehrender Auftrag
  const [orderType, setOrderType] = useState<'single' | 'recurring'>('single');
  const [recPropertyId, setRecPropertyId] = useState('');
  const [recWeekdays, setRecWeekdays] = useState<string[]>([]);
  const [recEmployeeIds, setRecEmployeeIds] = useState<string[]>([]);
  const [recTimeFrom, setRecTimeFrom] = useState('');
  const [recTimeTo, setRecTimeTo] = useState('');
  const [recStartDate, setRecStartDate] = useState(toLocalDateStr(new Date()));
  const [recDurationWeeks, setRecDurationWeeks] = useState(8);
  const [recSaving, setRecSaving] = useState(false);

  useEffect(() => { loadData(); }, [company.id, refreshKey, selectedDate]);

  useEffect(() => {
    // Reagierte vorher nur auf die Tagesansicht (loadData) — in der
    // Wochenansicht blieb das Raster bei einer Aenderung (z.B. Check-in eines
    // Mitarbeiters, Einsatz von anderswo geaendert) unveraendert, bis man die
    // Woche wechselte oder in die Tagesansicht und zurueck sprang. viewMode
    // steht in den deps, damit der Handler beim Umschalten nicht die alte
    // Ansicht "einfriert".
    const channel = supabase
      .channel(`assignments-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
        loadData();
        if (viewMode === 'week') loadWeekData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sick_reports' }, () => {
        loadData();
        if (viewMode === 'week') loadWeekData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company.id, selectedDate, viewMode]);

  async function loadData() {
    setLoading(true);
    try {
      const [assignRes, propRes, empRes, sickRes, rrRes] = await Promise.all([
        supabase.from('assignments').select('*, employee:employees(*), property:properties(*)').eq('date', selectedDate).order('created_at'),
        supabase.from('properties').select('*').eq('company_id', company.id).order('name'),
        supabase.from('employees').select('*').eq('company_id', company.id),
        supabase.from('sick_reports').select('*')
          .lte('date', selectedDate)
          .or(`date_to.gte.${selectedDate},date_to.is.null`),
        supabase.from('replacement_requests').select('id, sick_report_id, property_id, status, replacement_employee_id, replacement_employee:employees!replacement_employee_id(*)').eq('status', 'accepted'),
      ]);
      setAssignments((assignRes.data as unknown as AssignmentWithDetails[]) || []);
      setProperties(propRes.data || []);
      setEmployees(empRes.data || []);
      const filtered = (sickRes.data || []).filter((sr: { date: string; date_to: string | null }) => {
        const end = sr.date_to ?? sr.date;
        return sr.date <= selectedDate && selectedDate <= end;
      });
      setSickReports(filtered);
      setReplacementRequests((rrRes.data || []) as unknown as typeof replacementRequests);
    } catch {
      // Component renders with existing state
    }
    setLoading(false);
  }

  function weekBounds(dateStr: string): { start: string; dates: string[] } {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0 = Sonntag
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      dates.push(toLocalDateStr(cur));
    }
    return { start: dates[0], dates };
  }

  const currentWeek = useMemo(() => weekBounds(selectedDate), [selectedDate]);

  async function loadWeekData() {
    setWeekLoading(true);
    try {
      const weekStart = currentWeek.dates[0];
      const weekEnd = currentWeek.dates[6];
      const [assignRes, sickRes] = await Promise.all([
        supabase.from('assignments').select('*, employee:employees(*), property:properties(*)').gte('date', weekStart).lte('date', weekEnd).order('time_from'),
        supabase.from('sick_reports').select('employee_id, date, date_to').lte('date', weekEnd).or(`date_to.gte.${weekStart},date_to.is.null`),
      ]);
      setWeekAssignments(((assignRes.data as unknown as AssignmentWithDetails[]) || []).filter(a => a.property?.company_id === company.id));
      setWeekSickReports((sickRes.data as { employee_id: string; date: string; date_to: string | null }[]) || []);
    } catch {
      // Component renders with existing state
    }
    setWeekLoading(false);
  }

  useEffect(() => {
    if (viewMode === 'week') loadWeekData();
  }, [viewMode, currentWeek.start, company.id, refreshKey]);

  const isEmployeeSickOnDate = (employeeId: string, date: string) => {
    return weekSickReports.some(sr => sr.employee_id === employeeId && sr.date <= date && (sr.date_to == null || date <= sr.date_to));
  };

  const handleWeekDrop = async (assignmentId: string, newEmployeeId: string, newDate: string) => {
    const a = weekAssignments.find(wa => wa.id === assignmentId);
    if (!a || (a.employee_id === newEmployeeId && a.date === newDate)) return;
    // Bereits erledigte/eingecheckte Einsätze oder Einsätze in der Vergangenheit
    // dürfen nicht mehr verschoben werden — sonst werden Zeitstempel, Nachweise
    // und die Abrechnung nachträglich verfälscht. Die Karte ist in der UI schon
    // nicht mehr greifbar, das hier ist nur die zusätzliche Absicherung.
    const todayStr = toLocalDateStr(new Date());
    if (a.status === 'completed' || a.status === 'checked_in' || a.date < todayStr) {
      addToast('Bereits erledigte oder vergangene Einsätze können nicht mehr verschoben werden', 'error');
      return;
    }
    const { error } = await supabase.from('assignments').update({ employee_id: newEmployeeId, date: newDate }).eq('id', assignmentId);
    if (error) { addToast('Fehler beim Verschieben', 'error'); return; }
    const emp = activeEmployees.find(e => e.id === newEmployeeId);
    if (emp) {
      const dateLabel = new Date(newDate + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
      sendPushToEmployee(newEmployeeId, `Einsatz: ${a.property?.name ?? ''}`, `Neu für dich eingeplant: ${dateLabel}`, { type: 'new_assignment' });
    }
    addToast('Einsatz verschoben');
    loadWeekData();
  };

  const companyAssignments = useMemo(() => assignments.filter(a => a.property?.company_id === company.id), [assignments, company.id]);
  const activeEmployees = useMemo(() => employees.filter(e => e.status === 'active'), [employees]);
  const sickEmployeeIds = useMemo(() => new Set(sickReports.map(sr => sr.employee_id)), [sickReports]);

  const handleAddAssignment = async () => {
    if (!newPropertyId || !newDate || newEmployeeIds.length === 0) {
      addToast('Bitte alle Felder ausfüllen', 'error');
      return;
    }

    const prop = properties.find(p => p.id === newPropertyId);
    const timeFrom = newTimeFrom || null;
    const timeTo = newTimeTo || null;

    const resolvedFrom = timeFrom ?? prop?.time_from ?? null;
    const resolvedTo = timeTo ?? prop?.time_to ?? null;

    setSaving(true);

    // Vorher wurde nur gegen die bereits geladenen Einsaetze des aktuell
    // angezeigten Tages (selectedDate) geprueft. Waehlte man im Formular ein
    // abweichendes Datum (newDate != selectedDate), griff die Pruefung nie,
    // weil fuer dieses Datum gar keine Einsaetze geladen waren — es konnten
    // echte Doppel-Einsaetze inkl. doppelter Push-Benachrichtigung entstehen.
    // Jetzt wird gezielt fuer newDate nachgefragt, direkt vor dem Speichern.
    const { data: existingForDate, error: dupCheckErr } = await supabase
      .from('assignments')
      .select('employee_id, time_from, time_to')
      .eq('property_id', newPropertyId)
      .eq('date', newDate)
      .in('employee_id', newEmployeeIds);
    if (dupCheckErr) {
      addToast('Fehler beim Prüfen auf Doppel-Einsätze', 'error');
      setSaving(false);
      return;
    }
    const duplicate = (existingForDate || []).some(a =>
      (a.time_from ?? prop?.time_from ?? null) === resolvedFrom &&
      (a.time_to ?? prop?.time_to ?? null) === resolvedTo
    );
    if (duplicate) {
      addToast('Für diesen Mitarbeiter existiert bereits ein Einsatz zu dieser Zeit', 'error');
      setSaving(false);
      return;
    }

    const inserts = newEmployeeIds.map(eid => ({
      property_id: newPropertyId,
      employee_id: eid,
      date: newDate,
      status: 'assigned',
      time_from: timeFrom,
      time_to: timeTo,
    }));
    const { error } = await supabase.from('assignments').insert(inserts);

    if (error) { addToast('Fehler beim Speichern', 'error'); setSaving(false); return; }

    if (prop) {
      const dateLabel = new Date(newDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeLabel = `${formatTime(timeFrom ?? prop.time_from)} – ${formatTime(timeTo ?? prop.time_to)} Uhr`;
      const pushTitle = `Neuer Einsatz: ${prop.name}`;
      const pushBody = `${dateLabel}, ${timeLabel}`;

      // Send push + in-app notification to each employee in parallel
      await Promise.all(
        newEmployeeIds.map(eid =>
          sendPushToEmployee(eid, pushTitle, pushBody, { type: 'new_assignment' })
        )
      );
    }

    setSaving(false); setAddModal(false);
    setNewPropertyId(''); setNewDate(toLocalDateStr(new Date())); setNewEmployeeIds([]); setNewTimeFrom(''); setNewTimeTo('');
    onRefresh(); addToast('Einsatz erstellt und Mitarbeiter benachrichtigt');
  };

  const toggleRecWeekday = (day: string) => {
    setRecWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleRecEmployee = (empId: string) => {
    setRecEmployeeIds(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);
  };

  const recEndDate = useMemo(() => {
    const d = new Date(recStartDate);
    d.setDate(d.getDate() + recDurationWeeks * 7 - 1);
    return toLocalDateStr(d);
  }, [recStartDate, recDurationWeeks]);

  const handleAddRecurringOrder = async () => {
    if (!recPropertyId || recWeekdays.length === 0 || recEmployeeIds.length === 0) {
      addToast('Bitte alle Felder ausfüllen', 'error');
      return;
    }

    const prop = properties.find(p => p.id === recPropertyId);
    const timeFrom = recTimeFrom || prop?.time_from || null;
    const timeTo = recTimeTo || prop?.time_to || null;

    setRecSaving(true);

    const { data: order, error: orderErr } = await supabase.from('recurring_orders').insert({
      company_id: company.id,
      property_id: recPropertyId,
      employee_ids: recEmployeeIds,
      weekdays: recWeekdays,
      time_from: timeFrom,
      time_to: timeTo,
      start_date: recStartDate,
      end_date: recEndDate,
    }).select().maybeSingle();

    if (orderErr || !order) {
      addToast('Fehler beim Erstellen der Serie', 'error');
      setRecSaving(false);
      return;
    }

    // Alle passenden Daten im Zeitraum sammeln
    const dates: string[] = [];
    const cursor = new Date(recStartDate + 'T00:00:00');
    const end = new Date(recEndDate + 'T00:00:00');
    while (cursor <= end) {
      if (recWeekdays.includes(getDayAbbrev(cursor))) {
        dates.push(toLocalDateStr(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const inserts = dates.flatMap(date =>
      recEmployeeIds.map(eid => ({
        property_id: recPropertyId,
        employee_id: eid,
        date,
        status: 'assigned',
        time_from: recTimeFrom || null,
        time_to: recTimeTo || null,
        recurring_order_id: order.id,
      }))
    );

    const { error: assignErr } = await supabase.from('assignments').insert(inserts);
    setRecSaving(false);

    if (assignErr) {
      addToast('Serie angelegt, aber Fehler beim Erstellen der Einsätze', 'error');
      return;
    }

    if (prop) {
      const weekdayLabel = recWeekdays.join('/');
      const pushTitle = `Neuer wiederkehrender Einsatz: ${prop.name}`;
      const pushBody = `Jeden ${weekdayLabel}, ${formatTime(timeFrom || '')} – ${formatTime(timeTo || '')} Uhr, bis ${new Date(recEndDate).toLocaleDateString('de-DE')}`;
      await Promise.all(recEmployeeIds.map(eid => sendPushToEmployee(eid, pushTitle, pushBody, { type: 'new_assignment' })));
    }

    setAddModal(false);
    setOrderType('single');
    setRecPropertyId(''); setRecWeekdays([]); setRecEmployeeIds([]); setRecTimeFrom(''); setRecTimeTo('');
    setRecStartDate(toLocalDateStr(new Date())); setRecDurationWeeks(8);
    onRefresh();
    addToast(`Serie erstellt — ${dates.length} Einsätze angelegt`);
  };

  const handleDeleteSeries = async (recurringOrderId: string) => {
    // Nur noch nicht wahrgenommene Einsätze löschen — bereits ein-/ausgecheckte
    // Termine bleiben als Nachweis/Abrechnungshistorie erhalten.
    const { error: assignErr } = await supabase.from('assignments').delete().eq('recurring_order_id', recurringOrderId).eq('status', 'assigned');
    if (assignErr) { addToast('Fehler beim Löschen der Serie', 'error'); return; }
    await supabase.from('recurring_orders').delete().eq('id', recurringOrderId);
    setDeleteSeriesConfirm(null);
    onRefresh();
    addToast('Serie gelöscht');
  };

  const handleRemoveAssignment = async (assignment: AssignmentWithDetails) => {
    const { error } = await supabase.from('assignments').delete().eq('id', assignment.id);
    if (error) { addToast('Fehler beim Entfernen', 'error'); return; }
    setRemoveConfirm(null);
    const dateLabel = new Date(assignment.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    sendPushToEmployee(assignment.employee_id, 'Einsatz abgesagt', `${assignment.property.name} am ${dateLabel} wurde entfernt`, { type: 'info' });
    onRefresh(); addToast('Zuweisung entfernt');
  };

  const handleDeleteGroup = async (groupAssignments: AssignmentWithDetails[]) => {
    const ids = groupAssignments.map(a => a.id);
    const { error } = await supabase.from('assignments').delete().in('id', ids);
    if (error) { addToast('Fehler beim Löschen', 'error'); return; }
    setDeleteGroupConfirm(null);
    groupAssignments.forEach(a => {
      const dateLabel = new Date(a.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      sendPushToEmployee(a.employee_id, 'Einsatz abgesagt', `${a.property.name} am ${dateLabel} wurde entfernt`, { type: 'info' });
    });
    onRefresh(); addToast('Einsatz gelöscht');
  };

  const handleStatusChange = async (assignment: AssignmentWithDetails, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'checked_in') updates.checked_in_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from('assignments').update(updates).eq('id', assignment.id);
    if (error) { addToast('Fehler beim Aktualisieren', 'error'); return; }
    onRefresh();
  };

  const toggleEmployee = (empId: string) => {
    setNewEmployeeIds(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);
  };

  const selectedProperty = properties.find(p => p.id === newPropertyId);
  const recSelectedProperty = properties.find(p => p.id === recPropertyId);
  const employeesForProperty = activeEmployees;

  const handleRecPropertyChange = (propId: string) => {
    setRecPropertyId(propId);
    const prop = properties.find(p => p.id === propId);
    if (prop) {
      setRecTimeFrom(prop.time_from); setRecTimeTo(prop.time_to);
      setRecWeekdays(prop.cleaning_days || []);
    } else {
      setRecTimeFrom(''); setRecTimeTo(''); setRecWeekdays([]);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'assigned': return 'Zugewiesen';
      case 'checked_in': return 'Eingecheckt';
      case 'completed': return 'Abgeschlossen';
      case 'cancelled': return 'Storniert';
      default: return status;
    }
  };

  const replacementAssignmentIds = useMemo(() => {
    const ids = new Set<string>();
    replacementRequests.forEach(rr => {
      companyAssignments.forEach(a => {
        if (a.employee_id === rr.replacement_employee_id && a.property_id === rr.property_id) {
          ids.add(a.id);
        }
      });
    });
    return ids;
  }, [replacementRequests, companyAssignments]);

  const groupedAssignments = useMemo(() => {
    const groups: Record<string, { property: Property; assignments: AssignmentWithDetails[]; replacementEmployee?: Employee }> = {};
    companyAssignments.forEach(a => {
      if (replacementAssignmentIds.has(a.id)) return;
      const timeFrom = a.time_from ?? a.property?.time_from ?? '';
      const timeTo = a.time_to ?? a.property?.time_to ?? '';
      const key = `${a.property_id}__${timeFrom}__${timeTo}`;
      if (!groups[key]) {
        const rr = replacementRequests.find(r => r.property_id === a.property_id);
        groups[key] = { property: a.property, assignments: [], replacementEmployee: rr?.replacement_employee };
      }
      groups[key].assignments.push(a);
    });
    return Object.values(groups);
  }, [companyAssignments, replacementAssignmentIds, replacementRequests]);

  const dateNav = (direction: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + direction * (viewMode === 'week' ? 7 : 1));
    setSelectedDate(toLocalDateStr(d));
  };

  const isToday = selectedDate === toLocalDateStr(new Date());

  const weekRangeLabel = (() => {
    const start = new Date(currentWeek.dates[0] + 'T00:00:00');
    const end = new Date(currentWeek.dates[6] + 'T00:00:00');
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString('de-DE', { day: 'numeric', month: sameMonth ? undefined : 'long' });
    const endLabel = end.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  })();

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Einsätze</h1>
        <button onClick={() => setAddModal(true)} className="btn-primary flex items-center justify-center gap-2">
          <Plus size={16} /> Auftrag erstellen
        </button>
      </div>

      {/* Ein einziger Toolbar-Streifen statt zwei getrennter Regler-Zeilen:
          Datumsnavigation + Tag/Woche-Umschalter zusammen in einer Card. */}
      <div className="card p-2 mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => dateNav(-1)} className="p-2.5 rounded-xl hover:bg-[#F1F5F9] transition-colors text-[#64748B]">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 text-center min-w-[140px]">
            <p className="text-sm font-semibold text-[#0F172A]">
              {viewMode === 'week' ? weekRangeLabel : new Date(selectedDate).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={() => dateNav(1)} className="p-2.5 rounded-xl hover:bg-[#F1F5F9] transition-colors text-[#64748B]">
            <ChevronRight size={18} />
          </button>
          {!isToday && (
            <button onClick={() => setSelectedDate(toLocalDateStr(new Date()))} className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-[#0F172A] text-white hover:bg-[#334155] transition-colors">
              Heute
            </button>
          )}
          <div className="w-px h-6 bg-[#E2E8F0] mx-0.5 hidden sm:block" />
          <div className="flex items-center gap-1 bg-[#F8FAFC] rounded-xl p-1">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'day' ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-white'}`}
            >
              Tag
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'week' ? 'bg-[#0F172A] text-white' : 'text-[#64748B] hover:bg-white'}`}
            >
              Woche
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'week' ? (
        weekLoading ? (
          // Gleicher Spinner-Stil wie Dashboard/Controlling (grau, in Card) —
          // vorher grün, größer, ohne Card-Hintergrund.
          <div className="card p-10 text-center"><div className="w-6 h-6 border-2 border-[#CBD5E1] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <WeekGrid
            weekDates={currentWeek.dates}
            employees={activeEmployees}
            weekAssignments={weekAssignments}
            isEmployeeSickOnDate={isEmployeeSickOnDate}
            onDropAssignment={handleWeekDrop}
            dragOverCell={dragOverCell}
            setDragOverCell={setDragOverCell}
          />
        )
      ) : loading ? (
        <div className="card p-10 text-center"><div className="w-6 h-6 border-2 border-[#CBD5E1] border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : groupedAssignments.length === 0 ? (
        <div className="card p-10 text-center">
          <Calendar size={36} className="text-[#CBD5E1] mx-auto mb-3" />
          <p className="text-sm text-[#94A3B8]">Keine Einsätze für diesen Tag</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedAssignments.map(({ property, assignments: propAssignments, replacementEmployee }) => {
            const firstA = propAssignments[0];
            const displayFrom = firstA?.time_from ?? property.time_from;
            const displayTo = firstA?.time_to ?? property.time_to;
            const hasSickInGroup = propAssignments.some(a => sickEmployeeIds.has(a.employee_id));
            return (
            <div key={property.id} className="card">
              <div className="px-5 sm:px-6 py-4 border-b border-[#F1F5F9] bg-[#F8FAFC]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A]">{property.name}</p>
                    <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5"><MapPin size={12} className="text-[#94A3B8]" /> {property.address}</p>
                    <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5"><Clock size={12} className="text-[#94A3B8]" /> {formatTime(displayFrom)} – {formatTime(displayTo)} Uhr</p>
                    {hasSickInGroup && replacementEmployee && (
                      <p className="text-xs text-[#16A34A] font-semibold mt-1.5 flex items-center gap-1.5">
                        <Check size={12} /> Ersatz: {replacementEmployee.first_name} {replacementEmployee.last_name}
                      </p>
                    )}
                    {firstA?.recurring_order_id && (
                      <p className="text-[10px] text-[#8B5CF6] font-semibold mt-1.5 flex items-center gap-1.5">
                        <Repeat size={11} /> Teil einer Serie
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {firstA?.recurring_order_id && (
                      <button
                        onClick={() => setDeleteSeriesConfirm({ recurringOrderId: firstA.recurring_order_id as string, propertyName: property.name })}
                        className="p-1.5 rounded-lg hover:bg-[#F5F3FF] transition-colors text-[#8B5CF6]"
                        title="Ganze Serie löschen"
                      >
                        <Repeat size={15} />
                      </button>
                    )}
                    <button onClick={() => setDeleteGroupConfirm(propAssignments)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors text-[#F87171]" title="Diesen Tag löschen">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-[#F1F5F9]">
                {propAssignments.map(a => {
                  const isSick = sickEmployeeIds.has(a.employee_id);
                  return (
                    <div key={a.id} className={`px-5 sm:px-6 py-4 flex items-center gap-3.5 ${isSick ? 'bg-[#FEF2F2]/30' : ''}`}>
                      <Avatar firstName={a.employee?.first_name || ''} lastName={a.employee?.last_name || ''} id={a.employee_id} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0F172A]">
                          {a.employee?.first_name} {a.employee?.last_name}
                          {isSick && <span className="ml-2 text-[#EF4444] text-xs font-semibold">(krank)</span>}
                        </p>
                        {a.status === 'checked_in' && a.checked_in_at && (
                          <p className="text-[11px] text-[#94A3B8] mt-0.5 font-medium">Eingecheckt: {new Date(a.checked_in_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
                        )}
                        {a.status === 'completed' && a.completed_at && (
                          <p className="text-[11px] text-[#94A3B8] mt-0.5 font-medium">
                            {a.checked_in_at && <>Eingecheckt: {new Date(a.checked_in_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · </>}
                            Fertiggestellt: {new Date(a.completed_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                          </p>
                        )}
                      </div>
                      {isSick ? (
                        <span className="badge-danger"><AlertTriangle size={11} /> Krank</span>
                      ) : (
                        <span className={
                          a.status === 'assigned' ? 'badge-info' :
                          a.status === 'checked_in' ? 'badge-success' :
                          a.status === 'completed' ? 'badge-neutral' :
                          'badge-danger'
                        }>{statusLabel(a.status)}</span>
                      )}
                      <div className="flex items-center gap-1">
                        {a.status === 'assigned' && !isSick && (
                          <button onClick={() => handleStatusChange(a, 'checked_in')} className="p-1.5 rounded-lg hover:bg-[#F0FDF4] transition-colors text-[#22C55E]" title="Einchecken"><Check size={16} /></button>
                        )}
                        <button onClick={() => setRemoveConfirm(a)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors text-[#F87171]" title="Entfernen"><X size={16} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );})}
        </div>
      )}

      {/* Add Assignment Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} width="max-w-md">
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#0F172A] mb-4">Auftrag erstellen</h2>

          <div className="flex gap-2 mb-6 bg-[#F1F5F9] p-1 rounded-xl">
            <button
              onClick={() => setOrderType('single')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${orderType === 'single' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B]'}`}
            >
              <CalendarDays size={14} /> Einzelauftrag
            </button>
            <button
              onClick={() => setOrderType('recurring')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${orderType === 'recurring' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B]'}`}
            >
              <Repeat size={14} /> Wiederkehrend
            </button>
          </div>

          {orderType === 'single' ? (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Datum</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Objekt <span className="text-[#EF4444]">*</span></label>
                  <select value={newPropertyId} onChange={e => {
                    setNewPropertyId(e.target.value);
                    const prop = properties.find(p => p.id === e.target.value);
                    if (prop) { setNewTimeFrom(prop.time_from); setNewTimeTo(prop.time_to); }
                    else { setNewTimeFrom(''); setNewTimeTo(''); }
                  }} className="input-field">
                    <option value="">Objekt auswählen...</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name} — {p.address}</option>)}
                  </select>
                </div>
                {selectedProperty && (
                  <div className="bg-[#F8FAFC] rounded-xl p-3.5 text-sm text-[#64748B]">
                    <p className="flex items-center gap-1.5"><MapPin size={14} className="text-[#94A3B8]" /> {selectedProperty.address}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="flex-1"><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Uhrzeit von</label><input type="time" value={newTimeFrom} onChange={e => setNewTimeFrom(e.target.value)} className="input-field" /></div>
                  <div className="flex-1"><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Uhrzeit bis</label><input type="time" value={newTimeTo} onChange={e => setNewTimeTo(e.target.value)} className="input-field" /></div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-2">Mitarbeiter zuweisen</label>
                  <div className="flex flex-wrap gap-2">
                    {employeesForProperty.map(emp => (
                      <button key={emp.id} onClick={() => toggleEmployee(emp.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${newEmployeeIds.includes(emp.id) ? 'bg-[#22C55E] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
                        {emp.first_name} {emp.last_name}
                      </button>
                    ))}
                    {employeesForProperty.length === 0 && <span className="text-sm text-[#94A3B8]">Keine aktiven Mitarbeiter</span>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button onClick={() => setAddModal(false)} className="btn-ghost">Abbrechen</button>
                <button onClick={handleAddAssignment} disabled={saving || !newPropertyId || !newDate || newEmployeeIds.length === 0} className="btn-primary">
                  {saving ? 'Wird erstellt...' : 'Einsatz erstellen'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Objekt <span className="text-[#EF4444]">*</span></label>
                  <select value={recPropertyId} onChange={e => handleRecPropertyChange(e.target.value)} className="input-field">
                    <option value="">Objekt auswählen...</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name} — {p.address}</option>)}
                  </select>
                </div>
                {recSelectedProperty && (
                  <div className="bg-[#F8FAFC] rounded-xl p-3.5 text-sm text-[#64748B]">
                    <p className="flex items-center gap-1.5"><MapPin size={14} className="text-[#94A3B8]" /> {recSelectedProperty.address}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-2">Wochentage <span className="text-[#EF4444]">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map(day => (
                      <button key={day} onClick={() => toggleRecWeekday(day)}
                        className={`w-11 h-9 rounded-xl text-sm font-semibold transition-all duration-200 ${recWeekdays.includes(day) ? 'bg-[#8B5CF6] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Uhrzeit von</label><input type="time" value={recTimeFrom} onChange={e => setRecTimeFrom(e.target.value)} className="input-field" /></div>
                  <div className="flex-1"><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Uhrzeit bis</label><input type="time" value={recTimeTo} onChange={e => setRecTimeTo(e.target.value)} className="input-field" /></div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-2">Mitarbeiter zuweisen</label>
                  <div className="flex flex-wrap gap-2">
                    {employeesForProperty.map(emp => (
                      <button key={emp.id} onClick={() => toggleRecEmployee(emp.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${recEmployeeIds.includes(emp.id) ? 'bg-[#8B5CF6] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
                        {emp.first_name} {emp.last_name}
                      </button>
                    ))}
                    {employeesForProperty.length === 0 && <span className="text-sm text-[#94A3B8]">Keine aktiven Mitarbeiter</span>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Startdatum</label>
                  <input type="date" value={recStartDate} onChange={e => setRecStartDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-2">Laufzeit</label>
                  <div className="flex flex-wrap gap-2">
                    {durationOptions.map(opt => (
                      <button key={opt.weeks} onClick={() => setRecDurationWeeks(opt.weeks)}
                        className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${recDurationWeeks === opt.weeks ? 'bg-[#8B5CF6] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-2">Bis {new Date(recEndDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button onClick={() => setAddModal(false)} className="btn-ghost">Abbrechen</button>
                <button
                  onClick={handleAddRecurringOrder}
                  disabled={recSaving || !recPropertyId || recWeekdays.length === 0 || recEmployeeIds.length === 0}
                  className="btn-primary !bg-[#8B5CF6] hover:!bg-[#7C3AED]"
                >
                  {recSaving ? 'Wird erstellt...' : 'Serie erstellen'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Series Confirmation */}
      <Modal open={!!deleteSeriesConfirm} onClose={() => setDeleteSeriesConfirm(null)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] flex items-center justify-center mb-5">
            <Repeat size={22} className="text-[#8B5CF6]" />
          </div>
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Ganze Serie löschen?</h2>
          <p className="text-sm text-[#64748B] leading-relaxed mb-8">
            {deleteSeriesConfirm && `Alle noch ausstehenden Einsätze der Serie bei ${deleteSeriesConfirm.propertyName} werden gelöscht. Bereits ein- oder ausgecheckte Einsätze bleiben als Nachweis erhalten.`}
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteSeriesConfirm(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={() => deleteSeriesConfirm && handleDeleteSeries(deleteSeriesConfirm.recurringOrderId)} className="btn-danger">Serie löschen</button>
          </div>
        </div>
      </Modal>

      {/* Delete Group Confirmation */}
      <Modal open={!!deleteGroupConfirm} onClose={() => setDeleteGroupConfirm(null)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] flex items-center justify-center mb-5">
            <Trash2 size={22} className="text-[#EF4444]" />
          </div>
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Einsatz löschen?</h2>
          <p className="text-sm text-[#64748B] leading-relaxed mb-8">
            {deleteGroupConfirm && `Der gesamte Einsatz bei ${deleteGroupConfirm[0].property.name} am ${new Date(deleteGroupConfirm[0].date).toLocaleDateString('de-DE')} wird mit allen ${deleteGroupConfirm.length} Zuweisung${deleteGroupConfirm.length !== 1 ? 'en' : ''} gelöscht.`}
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteGroupConfirm(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={() => deleteGroupConfirm && handleDeleteGroup(deleteGroupConfirm)} className="btn-danger">Löschen</button>
          </div>
        </div>
      </Modal>

      {/* Remove Confirmation */}
      <RemoveAssignmentModal assignment={removeConfirm} onClose={() => setRemoveConfirm(null)} onConfirm={handleRemoveAssignment} />
    </div>
  );
}

/* ---------- Wochenansicht (Drag-and-Drop-Grid) ---------- */

interface WeekGridProps {
  weekDates: string[];
  employees: Employee[];
  weekAssignments: AssignmentWithDetails[];
  isEmployeeSickOnDate: (employeeId: string, date: string) => boolean;
  onDropAssignment: (assignmentId: string, newEmployeeId: string, newDate: string) => void;
  dragOverCell: string | null;
  setDragOverCell: Dispatch<SetStateAction<string | null>>;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function WeekGrid({ weekDates, employees, weekAssignments, isEmployeeSickOnDate, onDropAssignment, dragOverCell, setDragOverCell }: WeekGridProps) {
  const todayStr = toLocalDateStr(new Date());

  // Fallback für Touch-Geräte: die native HTML5-Drag-and-Drop-API feuert auf
  // Handy/Tablet nicht, es gab vorher keinen Ersatzweg. "Tippen zum
  // Verschieben" öffnet für denselben Einsatz denselben onDropAssignment-Call,
  // den auch das Ziehen mit der Maus auslöst.
  const [moveAssignment, setMoveAssignment] = useState<AssignmentWithDetails | null>(null);
  const [moveEmpId, setMoveEmpId] = useState('');
  const [moveDate, setMoveDate] = useState('');

  const cellKey = (empId: string, date: string) => `${empId}__${date}`;

  const assignmentsFor = (empId: string, date: string) =>
    weekAssignments.filter(a => a.employee_id === empId && a.date === date);

  const handleDragStart = (e: DragEvent, assignmentId: string) => {
    e.dataTransfer.setData('text/plain', assignmentId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: DragEvent, empId: string, date: string) => {
    e.preventDefault();
    setDragOverCell(null);
    const assignmentId = e.dataTransfer.getData('text/plain');
    if (assignmentId) onDropAssignment(assignmentId, empId, date);
  };

  const openMoveDialog = (a: AssignmentWithDetails) => {
    setMoveAssignment(a);
    setMoveEmpId(a.employee_id);
    setMoveDate(a.date);
  };

  const confirmMove = () => {
    if (!moveAssignment) return;
    onDropAssignment(moveAssignment.id, moveEmpId, moveDate);
    setMoveAssignment(null);
  };

  if (employees.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-[#94A3B8]">Noch keine aktiven Mitarbeiter vorhanden</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full border-collapse min-w-[820px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10 text-left px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#94A3B8] border-b border-[#F1F5F9] w-[160px]">
              Mitarbeiter
            </th>
            {weekDates.map((date, i) => {
              const isToday = date === todayStr;
              const d = new Date(date + 'T00:00:00');
              return (
                <th key={date} className={`text-center px-2 py-3 text-xs font-bold border-b border-[#F1F5F9] border-l border-[#F8FAFC] ${isToday ? 'bg-[#F0FDF4]' : ''}`}>
                  <span className={`uppercase tracking-wide ${isToday ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>{WEEKDAY_LABELS[i]}</span>
                  <div className={`text-sm mt-0.5 ${isToday ? 'text-[#16A34A]' : 'text-[#0F172A]'}`}>{d.getDate()}.{d.getMonth() + 1}.</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id} className="border-b border-[#F1F5F9] last:border-0">
              <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-[#F8FAFC]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar firstName={emp.first_name} lastName={emp.last_name} id={emp.id} size="sm" />
                  <span className="text-sm font-semibold text-[#0F172A] truncate">{emp.first_name} {emp.last_name}</span>
                </div>
              </td>
              {weekDates.map(date => {
                const cellAssignments = assignmentsFor(emp.id, date);
                const sick = isEmployeeSickOnDate(emp.id, date);
                const key = cellKey(emp.id, date);
                const isOver = dragOverCell === key;
                return (
                  <td
                    key={date}
                    onDragOver={e => { e.preventDefault(); setDragOverCell(key); }}
                    onDragLeave={() => setDragOverCell(prev => (prev === key ? null : prev))}
                    onDrop={e => handleDrop(e, emp.id, date)}
                    className={`align-top px-1.5 py-1.5 border-l border-[#F8FAFC] min-w-[110px] transition-colors ${isOver ? 'bg-[#EFF6FF]' : ''}`}
                  >
                    {sick && cellAssignments.length === 0 ? (
                      <div className="text-[10px] font-bold text-white bg-[#DC2626] rounded-lg px-2 py-1.5 text-center">KRANK</div>
                    ) : (
                      <div className="space-y-1">
                        {cellAssignments.map(a => {
                          const locked = a.status === 'completed' || a.status === 'checked_in' || a.date < todayStr;
                          return (
                            <div
                              key={a.id}
                              draggable={!locked}
                              onDragStart={locked ? undefined : e => handleDragStart(e, a.id)}
                              onClick={locked ? undefined : () => openMoveDialog(a)}
                              title={locked ? 'Bereits erledigt bzw. vergangen — kann nicht mehr verschoben werden' : 'Ziehen oder antippen, um zu verschieben'}
                              className={`rounded-lg px-2 py-1.5 border transition-colors ${
                                locked
                                  ? 'cursor-not-allowed bg-[#F8FAFC] border-[#E2E8F0] opacity-70'
                                  : 'cursor-grab active:cursor-grabbing bg-[#EFF6FF] border-[#BFDBFE] hover:border-[#3B82F6]'
                              }`}
                            >
                              <p className="text-[11px] font-semibold text-[#0F172A] truncate">{a.property?.name}</p>
                              <p className="text-[10px] text-[#64748B]">{formatTime(a.time_from ?? a.property?.time_from ?? '')}–{formatTime(a.time_to ?? a.property?.time_to ?? '')}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-[#94A3B8] px-4 py-3 border-t border-[#F1F5F9]">Einsätze per Drag-and-Drop verschieben, oder auf Handy/Tablet antippen und Mitarbeiter/Tag im Dialog wählen.</p>

      <Modal open={!!moveAssignment} onClose={() => setMoveAssignment(null)} width="max-w-sm">
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#0F172A] mb-1">Einsatz verschieben</h2>
          <p className="text-sm text-[#64748B] mb-5">{moveAssignment?.property?.name}</p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#64748B] mb-1.5 block">Mitarbeiter</label>
              <select value={moveEmpId} onChange={e => setMoveEmpId(e.target.value)} className="input-field w-full">
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#64748B] mb-1.5 block">Tag</label>
              <select value={moveDate} onChange={e => setMoveDate(e.target.value)} className="input-field w-full">
                {weekDates.map((date, i) => {
                  const d = new Date(date + 'T00:00:00');
                  return <option key={date} value={date}>{WEEKDAY_LABELS[i]}, {d.getDate()}.{d.getMonth() + 1}.</option>;
                })}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button onClick={() => setMoveAssignment(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={confirmMove} className="btn-primary">Verschieben</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
