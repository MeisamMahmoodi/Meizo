import { useState, useMemo } from 'react';
import { AlertTriangle, Star, Bell } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { Avatar } from '../shared/Avatar';
import { formatTime, toLocalDateStr } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { sendPushToEmployee } from '../../hooks/usePushNotifications';
import { useToast } from '../shared/Toast';
import type { Employee, Property, SickReport, EmployeeProperty, Assignment } from '../../lib/types';

interface ReplacementModalProps {
  sickReport: SickReport & { employee: Employee };
  property: Property;
  employees: Employee[];
  employeeProperties: EmployeeProperty[];
  assignments: Assignment[];
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'select' | 'confirm';

export function ReplacementModal({
  sickReport,
  property,
  employees,
  employeeProperties,
  assignments,
  onClose,
  onComplete,
}: ReplacementModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  type AvailableEmployee = Employee & { knowsProperty: boolean; availStatus: 'free' | 'partial' | 'unknown'; empAssignments: Assignment[] };
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { addToast } = useToast();

  const availableEmployees = useMemo((): AvailableEmployee[] => {
    const sickEmployeeId = sickReport.employee_id;
    const todayStr = toLocalDateStr(new Date());

    const alreadyAssignedToProperty = new Set(
      assignments
        .filter(a => a.property_id === property.id && a.date === todayStr)
        .map(a => a.employee_id)
    );

    return employees
      .filter(e => e.id !== sickEmployeeId && e.status === 'active' && !alreadyAssignedToProperty.has(e.id))
      .map(e => {
        const knowsProperty = employeeProperties.some(
          ep => ep.employee_id === e.id && ep.property_id === property.id
        );
        const empAssignments = assignments.filter(a => a.employee_id === e.id && a.date === todayStr);
        const isFree = empAssignments.length === 0;
        const hasPartial = empAssignments.length > 0;

        let availStatus: 'free' | 'partial' | 'unknown' = 'unknown';
        if (isFree) availStatus = 'free';
        else if (hasPartial) availStatus = 'partial';

        return { ...e, knowsProperty, availStatus, empAssignments };
      })
      .sort((a, b) => {
        if (a.knowsProperty && !b.knowsProperty) return -1;
        if (!a.knowsProperty && b.knowsProperty) return 1;
        if (a.availStatus === 'free' && b.availStatus !== 'free') return -1;
        if (a.availStatus !== 'free' && b.availStatus === 'free') return 1;
        return 0;
      });
  }, [employees, sickReport, property, employeeProperties, assignments]);

  const handleSelect = (emp: AvailableEmployee) => {
    setSelectedEmployee(emp);
    const todayStr = toLocalDateStr(new Date());
    const empAssignments = assignments.filter(a => a.employee_id === emp.id && a.date === todayStr);
    const timeInfo = empAssignments.length > 0
      ? `Du hast heute bereits eine Schicht.`
      : '';

    setMessage(
      `Hallo ${emp.first_name}, kannst du heute von ${formatTime(property.time_from)}–${formatTime(property.time_to)} Uhr ${property.name} übernehmen? ${sickReport.employee.first_name} ist krank. Bitte melde dich kurz zurück. ${timeInfo}`
    );
    setStep('confirm');
  };

  const handleSend = async () => {
    if (!selectedEmployee) return;
    setSending(true);

    const { data: existing } = await supabase
  .from('replacement_requests')
  .select('id')
  .eq('sick_report_id', sickReport.id)
  .eq('status', 'pending')
  .maybeSingle();

if (existing) {
  setSending(false);
  onComplete();
  return;
}

    try {
      const { error } = await supabase.from('replacement_requests').insert({
        sick_report_id: sickReport.id,
        property_id: property.id,
        replacement_employee_id: selectedEmployee.id,
        status: 'pending',
        message,
        channel: 'app',
      });

      if (error) {
        // Vorher gab es hier keinerlei Rückmeldung: der Button hörte einfach
        // auf zu laden, und der Owner wusste nicht, ob die Anfrage raus ist.
        addToast('Fehler beim Senden der Vertretungsanfrage', 'error');
        setSending(false);
        return;
      }

      // Push-Benachrichtigung in der App — das ist der einzige Kanal, bei
      // dem wir wirklich wissen, ob der Mitarbeiter angenommen/abgelehnt hat
      // (WhatsApp/SMS-Links hatten keine Zustellbestätigung).
      await sendPushToEmployee(selectedEmployee.id, 'Einspringen?', message, { type: 'replacement_request' });

      onComplete();
    } catch {
      addToast('Fehler beim Senden der Vertretungsanfrage', 'error');
      setSending(false);
    }
  };

  const getStatusLabel = (emp: AvailableEmployee) => {
    if (emp.availStatus === 'free' && emp.knowsProperty) return 'Heute frei · Kennt das Objekt';
    if (emp.availStatus === 'free') return 'Heute frei · Objekt unbekannt';
    if (emp.availStatus === 'partial' && emp.knowsProperty) return 'Hat heute Schicht · Kennt das Objekt';
    if (emp.availStatus === 'partial') return 'Hat heute Schicht · Objekt unbekannt';
    return 'Objekt unbekannt';
  };

  const getStatusDot = (status: string) => {
    if (status === 'free') return 'bg-brand-500';
    if (status === 'partial') return 'bg-warning-400';
    return 'bg-ink-100';
  };

  return (
    <Modal open onClose={onClose} width="max-w-xl">
      {step === 'select' && (
        <div className="p-8">
          <div className="flex items-start gap-3.5 mb-1">
            <AlertTriangle size={20} className="text-danger-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-ink-900">Krankmeldung — Ersatz finden</h2>
              <p className="text-sm text-ink-500 mt-1">
                {sickReport.employee.first_name} {sickReport.employee.last_name} · {property.name} · {formatTime(property.time_from)}–{formatTime(property.time_to)} Uhr
              </p>
            </div>
          </div>

          <div className="h-px bg-surface-100 my-5" />

          <p className="section-label mb-3">
            Verfügbare Mitarbeiter
          </p>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {availableEmployees.map(emp => {
              const isBest = emp.knowsProperty && emp.availStatus === 'free';
              return (
                <div
                  key={emp.id}
                  className="flex items-center gap-3.5 p-3.5 rounded-xl border border-surface-200/60 hover:border-surface-200 hover:bg-surface-50/50 transition-all duration-200"
                >
                  <Avatar firstName={emp.first_name} lastName={emp.last_name} id={emp.id} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusDot(emp.availStatus)}`} />
                      <p className="text-sm font-semibold text-ink-900">
                        {emp.first_name} {emp.last_name}
                      </p>
                      {isBest && (
                        <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                          <Star size={10} /> Beste Wahl
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-ink-500 mt-0.5">{getStatusLabel(emp)}</p>
                  </div>
                  <button
                    onClick={() => handleSelect(emp)}
                    className="px-3.5 py-2 rounded-xl text-sm font-semibold border border-brand-500 text-brand-500 hover:bg-brand-500 hover:text-white transition-colors shrink-0"
                  >
                    Zuweisen
                  </button>
                </div>
              );
            })}
            {availableEmployees.length === 0 && (
              <p className="text-sm text-ink-300 text-center py-6">Keine verfügbaren Mitarbeiter</p>
            )}
          </div>
        </div>
      )}

      {step === 'confirm' && selectedEmployee && (
        <div className="p-8">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">&#10003;</span>
            </div>
            <h2 className="text-lg font-bold text-ink-900">
              {selectedEmployee.first_name} {selectedEmployee.last_name} zuweisen
            </h2>
          </div>

          <p className="text-sm text-ink-500 mb-2">Nachricht an {selectedEmployee.first_name}:</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            className="input-field resize-none bg-surface-50"
          />

          <div className="flex items-start gap-2.5 mt-5 p-3.5 rounded-xl bg-brand-50/60 border border-brand-100">
            <Bell size={15} className="text-brand-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-500 leading-relaxed">
              Wird als Push-Benachrichtigung in der App gesendet. Sie sehen live, ob {selectedEmployee.first_name} annimmt oder ablehnt.
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={() => setStep('select')}
              className="btn-ghost"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="btn-primary"
            >
              {sending ? 'Wird gesendet...' : 'Jetzt senden'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
