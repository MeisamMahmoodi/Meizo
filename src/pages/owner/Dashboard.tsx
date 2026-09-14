import { useState, useEffect, useMemo, useRef } from 'react';
import { Bell, AlertTriangle, MapPin, User, Clock, Search, UserCheck, X, Check, CalendarDays, AlertCircle, AlarmClock, ChevronDown, ChevronUp, Users, HeartPulse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDateLong, formatTime, getTodayDayAbbrev, toLocalDateStr } from '../../lib/utils';
import type { Employee, Property, Assignment, SickReport, EmployeeProperty } from '../../lib/types';
import { ReplacementModal } from '../../components/owner/ReplacementModal';
import { RemoveAssignmentModal } from '../../components/owner/RemoveAssignmentModal';
import { Avatar } from '../../components/shared/Avatar';
import { useToast } from '../../components/shared/Toast';
import { sendPushToEmployee } from '../../hooks/usePushNotifications';
import type { Company } from '../../lib/types';

interface DashboardProps {
  company: Company;
  refreshKey: number;
  onRefresh: () => void;
}

interface SickReportWithEmployee extends SickReport {
  employee: Employee;
}

interface AssignmentWithDetails extends Assignment {
  employee: Employee;
  property: Property;
}

export function Dashboard({ company, refreshKey, onRefresh }: DashboardProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [sickReports, setSickReports] = useState<SickReportWithEmployee[]>([]);
  const [employeeProperties, setEmployeeProperties] = useState<EmployeeProperty[]>([]);
  const [replacementRequests, setReplacementRequests] = useState<{ id: string; sick_report_id: string; property_id: string; status: string; replacement_employee_id: string; created_at: string; expires_at: string | null; replacement_employee?: Employee }[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [replacementModal, setReplacementModal] = useState<{ sickReport: SickReportWithEmployee; property: Property; assignment: AssignmentWithDetails } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<AssignmentWithDetails | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [replacementDetailsOpen, setReplacementDetailsOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const notifRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const todayDay = getTodayDayAbbrev();
  const isWeekend = todayDay === 'Sa' || todayDay === 'So';

  useEffect(() => { loadData(); }, [company.id, refreshKey]);

  // Tick every second so the auto-dispatch countdown stays live without a full reload.
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sick_reports' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replacement_requests' }, (payload) => {
        loadData();
        handleReplacementRealtimeEvent(payload as unknown as { eventType: string; new: Record<string, unknown> });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company.id]);

  // Cost-preview toast when a candidate accepts an auto-dispatched replacement
  // request. Reads fresh data inside the callback (not from closed-over state)
  // since this effect only depends on company.id.
  const handleReplacementRealtimeEvent = async (payload: { eventType: string; new: Record<string, unknown> }) => {
    if (payload.eventType !== 'UPDATE') return;
    const row = payload.new as { status?: string; replacement_employee_id?: string; property_id?: string };
    if (row.status !== 'accepted' || !row.replacement_employee_id || !row.property_id) return;

    const [{ data: emp }, { data: prop }] = await Promise.all([
      supabase.from('employees').select('first_name, last_name, hourly_wage').eq('id', row.replacement_employee_id).maybeSingle(),
      supabase.from('properties').select('name, time_from, time_to').eq('id', row.property_id).maybeSingle(),
    ]);
    if (!emp || !prop) return;

    let costLabel = '';
    if (emp.hourly_wage && prop.time_from && prop.time_to) {
      const [fh, fm] = prop.time_from.split(':').map(Number);
      const [th, tm] = prop.time_to.split(':').map(Number);
      const hours = Math.max(0, (th * 60 + tm - (fh * 60 + fm)) / 60);
      const cost = hours * emp.hourly_wage;
      costLabel = ` (ca. ${hours.toFixed(1).replace('.0', '')}h × ${emp.hourly_wage.toFixed(2)}€ = ${cost.toFixed(2)}€)`;
    }
    addToast(`${emp.first_name} ${emp.last_name} übernimmt ${prop.name}${costLabel}`);
  };

  async function loadData() {
    try {
      const [empRes, propRes, assignRes, sickRes, epRes, rrRes] = await Promise.all([
        supabase.from('employees').select('*').eq('company_id', company.id),
        supabase.from('properties').select('*').eq('company_id', company.id),
        supabase.from('assignments').select('*, employee:employees(*), property:properties(*)').eq('date', todayStr),
        supabase.from('sick_reports').select('*, employee:employees(*)'),
        supabase.from('employee_properties').select('*'),
        supabase.from('replacement_requests').select('id, sick_report_id, property_id, status, replacement_employee_id, created_at, expires_at, replacement_employee:employees!replacement_employee_id(*)'),
      ]);
      setEmployees(empRes.data || []);
      setProperties(propRes.data || []);
      setAssignments((assignRes.data as unknown as AssignmentWithDetails[]) || []);
      const activeSickReports = (sickRes.data as unknown as SickReportWithEmployee[]) || [];
      const todayDate = new Date(todayStr);
      const filtered = activeSickReports.filter(sr => {
        const startDate = new Date(sr.date);
        const endDate = sr.date_to ? new Date(sr.date_to) : startDate;
        return startDate <= todayDate && todayDate <= endDate;
      });
      setSickReports(filtered);
      setEmployeeProperties(epRes.data || []);
      setReplacementRequests((rrRes.data || []) as unknown as typeof replacementRequests);
    } catch {
      // Component renders with existing state
    } finally {
      setLoading(false);
    }
  }

  const companyEmployees = useMemo(() => employees.filter(e => e.company_id === company.id), [employees, company.id]);
  const activeEmployees = useMemo(() => companyEmployees.filter(e => e.status === 'active'), [companyEmployees]);
  const todayAssignments = useMemo(() => assignments.filter(a => a.property?.company_id === company.id), [assignments, company.id]);
  const sickReportsForCompany = useMemo(() => sickReports.filter(sr => sr.employee?.company_id === company.id), [sickReports, company.id]);

  const sickReportsByEmployee = useMemo(() => {
    const map = new Map<string, SickReportWithEmployee>();
    sickReportsForCompany.forEach(sr => {
      if (!map.has(sr.employee_id)) map.set(sr.employee_id, sr);
    });
    return Array.from(map.values());
  }, [sickReportsForCompany]);

  const getGreeting = () => {
    const hour = today.getHours();
    if (hour < 12) return 'Guten Morgen';
    if (hour < 18) return 'Guten Tag';
    return 'Guten Abend';
  };

  const isLateNoCheckIn = (a: AssignmentWithDetails) => {
    if (a.status !== 'assigned') return false;
    const timeFrom = a.time_from ?? a.property?.time_from;
    if (!timeFrom) return false;
    const [h, m] = timeFrom.split(':').map(Number);
    const startMs = new Date().setHours(h, m, 0, 0);
    return Date.now() >= startMs + 5 * 60 * 1000;
  };

  const formatSickDate = (sr: SickReport) => {
    const from = new Date(sr.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!sr.date_to) return from;
    const to = new Date(sr.date_to + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${from} – ${to}`;
  };

  const replacementAssignmentIds = useMemo(() => {
    const ids = new Set<string>();
    replacementRequests
      .filter(rr => rr.status === 'accepted')
      .forEach(rr => {
        todayAssignments.forEach(a => {
          if (a.employee_id === rr.replacement_employee_id && a.property_id === rr.property_id) {
            ids.add(a.id);
          }
        });
      });
    return ids;
  }, [replacementRequests, todayAssignments]);

  const groupedPropertyAssignments = useMemo(() => {
    const groups: Record<string, { property: Property; timeFrom: string; timeTo: string; assignments: AssignmentWithDetails[] }> = {};
    todayAssignments.forEach(a => {
      if (a.status === 'cancelled') return;
      if (replacementAssignmentIds.has(a.id)) return;
      const timeFrom = a.time_from ?? a.property?.time_from ?? '';
      const timeTo = a.time_to ?? a.property?.time_to ?? '';
      const key = `${a.property_id}__${timeFrom}__${timeTo}`;
      if (!groups[key]) {
        groups[key] = { property: a.property!, timeFrom, timeTo, assignments: [] };
      }
      groups[key].assignments.push(a);
    });
    return Object.values(groups);
  }, [todayAssignments, replacementAssignmentIds]);

  const handleFindReplacement = (sickReport: SickReportWithEmployee) => {
    const affectedAssignment = todayAssignments.find(a => a.employee_id === sickReport.employee_id);
    if (!affectedAssignment) return;
    const prop = properties.find(p => p.id === affectedAssignment.property_id);
    if (!prop) return;
    setReplacementModal({ sickReport, property: prop, assignment: affectedAssignment });
  };

  const handleReplacementComplete = () => {
    setReplacementModal(null);
    onRefresh();
    addToast('Ersatz wurde benachrichtigt');
  };

  const handleSkipCandidate = async (requestId: string) => {
    setSkippingId(requestId);
    const { error } = await supabase.from('replacement_requests').update({ status: 'declined' }).eq('id', requestId);
    setSkippingId(null);
    if (error) { addToast('Fehler beim Überspringen', 'error'); return; }
    addToast('Kandidat übersprungen — nächster wird automatisch angefragt');
    onRefresh();
  };

  const formatCountdown = (expiresAt: string) => {
    const remainingMs = new Date(expiresAt).getTime() - nowTick;
    if (remainingMs <= 0) return '0:00';
    const totalSec = Math.floor(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handleRemoveAssignment = async (assignment: AssignmentWithDetails) => {
    const { error } = await supabase.from('assignments').delete().eq('id', assignment.id);
    if (error) { addToast('Fehler beim Entfernen', 'error'); return; }
    setRemoveConfirm(null);
    const dateLabel = new Date(assignment.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    sendPushToEmployee(assignment.employee_id, 'Einsatz abgesagt', `${assignment.property.name} am ${dateLabel} wurde entfernt`, { type: 'info' });
    onRefresh();
    addToast('Zuweisung entfernt');
  };

  const handleCheckIn = async (id: string) => {
    const { error } = await supabase.from('assignments').update({ status: 'checked_in', checked_in_at: new Date().toISOString() }).eq('id', id);
    if (error) { addToast('Fehler beim Einchecken', 'error'); return; }
    onRefresh();
  };

  const sickCount = sickReportsForCompany.length;
  const srHasReplacement = (sr: SickReportWithEmployee) => {
    return replacementRequests.some(rr => rr.sick_report_id === sr.id && rr.status === 'accepted');
  };

  const openSickCount = sickReportsByEmployee.filter(sr => {
    const empAssignments = todayAssignments.filter(a => a.employee_id === sr.employee_id);
    if (empAssignments.length === 0) return false;
    return !srHasReplacement(sr);
  }).length;

  const coveredSickCount = sickReportsByEmployee.filter(sr => {
    const empAssignments = todayAssignments.filter(a => a.employee_id === sr.employee_id);
    if (empAssignments.length === 0) return false;
    return srHasReplacement(sr);
  }).length;

  const sickWithAssignments = useMemo(() => {
    return sickReportsByEmployee
      .map(sr => {
        const empAssignments = todayAssignments.filter(a => a.employee_id === sr.employee_id);
        const hasReplacement = replacementRequests.some(rr => rr.sick_report_id === sr.id && rr.status === 'accepted');
        return { sickReport: sr, assignments: empAssignments, hasReplacement };
      })
      .filter(item => item.assignments.length > 0);
  }, [sickReportsByEmployee, todayAssignments, replacementRequests]);

  const sickWithoutAssignments = useMemo(() => {
    return sickReportsByEmployee
      .filter(sr => !todayAssignments.some(a => a.employee_id === sr.employee_id))
      .map(sr => ({ sickReport: sr }));
  }, [sickReportsByEmployee, todayAssignments]);

  const propertiesWithAssignments = useMemo(() => {
    const propIds = new Set(todayAssignments.map(a => a.property_id));
    return properties.filter(p => propIds.has(p.id));
  }, [todayAssignments, properties]);

  const trialBadge = (() => {
    if (!company.trial_ends_at) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(company.trial_ends_at); end.setHours(0, 0, 0, 0);
    const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return null;
    return diff === 0 ? 'Noch heute kostenlos' : `Kostenlose Testphase — noch ${diff} Tage`;
  })();

  return (
    <div>
      {trialBadge && (
        <div className="mb-5 inline-flex items-center px-3.5 py-1.5 rounded-xl bg-orange-100 text-orange-700 text-xs font-semibold">
          {trialBadge}
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
            {getGreeting()}, {company.owner_name.split(' ')[0]}
          </h1>
          <p className="text-[#64748B] text-sm mt-1.5">{formatDateLong(today)}</p>
          {isWeekend && (
            <p className="text-xs text-[#F97316] mt-1.5 flex items-center gap-1.5 font-medium">
              <AlertCircle size={13} /> Wochenende — ggf. keine regulären Einsätze
            </p>
          )}
        </div>
        <div className="relative" ref={notifRef}>
          <button onClick={() => setShowNotifications(!showNotifications)} aria-label="Benachrichtigungen" className="relative p-2.5 rounded-xl hover:bg-white/60 transition-colors">
            <Bell size={20} className="text-[#64748B]" />
            {sickCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#EF4444] rounded-full text-white text-[10px] flex items-center justify-center font-bold px-1">{sickCount}</span>}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-12 bg-white rounded-xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08),0_4px_6px_-4px_rgba(0,0,0,0.04)] border border-[#E2E8F0]/60 py-1 z-30 w-80 max-h-80 overflow-y-auto animate-scale-in">
              <div className="px-4 py-3 border-b border-[#F1F5F9]"><p className="text-sm font-semibold text-[#0F172A]">Benachrichtigungen</p></div>
              {sickReportsForCompany.length === 0 ? (
                <div className="px-4 py-8 text-center"><p className="text-sm text-[#94A3B8]">Keine Benachrichtigungen</p></div>
              ) : (
                sickReportsForCompany.map(sr => (
                  <div key={sr.id} className="px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle size={15} className="text-[#F87171] shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0F172A]">{sr.employee?.first_name} {sr.employee?.last_name} ist krank</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          {sr.date_to
                            ? `${new Date(sr.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${new Date(sr.date_to + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : new Date(sr.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          }{sr.reason ? ` — ${sr.reason}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* CRITICAL: Sick employees WITH assignments */}
      {sickWithAssignments.length > 0 && (
        <div className="mb-8">
          <h2 className="section-label text-[#EF4444] mb-4 flex items-center gap-2">
            <AlertTriangle size={14} /> Krankmeldungen mit Einsatz
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sickWithAssignments.map(({ sickReport: sr, assignments: empAssignments, hasReplacement }) => (
              <div key={sr.employee_id} className="bg-[#FEF2F2] border border-[#FECACA]/60 rounded-[1.5rem] p-6">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <Avatar firstName={sr.employee?.first_name || ''} lastName={sr.employee?.last_name || ''} id={sr.employee_id} size="lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-[#0F172A]">{sr.employee?.first_name} {sr.employee?.last_name}</p>
                    <span className="badge-danger mt-1.5">Krankgemeldet</span>
                    <p className="text-xs text-[#94A3B8] mt-1.5">{formatSickDate(sr)}</p>
                    {sr.reason && <p className="text-sm text-[#64748B] mt-1">Grund: {sr.reason}</p>}
                    {empAssignments.map(a => (
                      <div key={a.id} className="mt-3 bg-white/70 rounded-xl p-3">
                        <p className="text-sm font-semibold text-[#0F172A] flex items-center gap-1.5"><MapPin size={14} className="text-[#94A3B8]" /> {a.property?.name}</p>
                        <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5"><Clock size={12} className="text-[#94A3B8]" /> {formatTime(a.time_from ?? a.property?.time_from ?? '')} – {formatTime(a.time_to ?? a.property?.time_to ?? '')} Uhr</p>
                      </div>
                    ))}
                  </div>
                </div>
                {!hasReplacement && (() => {
                  const pending = replacementRequests.find(
                    rr => rr.sick_report_id === sr.id && rr.status === 'pending'
                  );
                  if (pending && pending.expires_at) {
                    const expired = new Date(pending.expires_at).getTime() <= nowTick;
                    return (
                      <div className="mt-5 bg-white/70 border border-[#FECACA]/60 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-sm text-[#0F172A]">
                          <Search size={14} className="text-[#F97316] shrink-0" />
                          <span className="font-semibold">
                            {pending.replacement_employee?.first_name} {pending.replacement_employee?.last_name}
                          </span>
                          <span className="text-[#64748B]">wird automatisch angefragt</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-[#94A3B8]">
                          <AlarmClock size={13} />
                          {expired ? 'Wartet auf nächste Anfrage…' : <>Antwort erwartet in <span className="font-semibold text-[#F97316]">{formatCountdown(pending.expires_at)}</span> Min</>}
                        </div>
                        <button
                          onClick={() => handleSkipCandidate(pending.id)}
                          disabled={skippingId === pending.id}
                          className="w-full mt-3 py-2 rounded-xl text-xs font-semibold text-[#64748B] bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] transition-colors disabled:opacity-50"
                        >
                          {skippingId === pending.id ? 'Wird übersprungen…' : 'Überspringen — nächsten Kandidaten fragen'}
                        </button>
                      </div>
                    );
                  }
                  if (pending) {
                    // Manuell gesendete Anfrage ohne Ablaufzeit — es gibt keine
                    // Eskalationskette, daher nur ein Wartehinweis ohne Countdown/Skip.
                    return (
                      <div className="mt-5 bg-white/70 border border-[#FECACA]/60 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-sm text-[#0F172A]">
                          <Clock size={14} className="text-[#F97316] shrink-0" />
                          <span className="font-semibold">
                            {pending.replacement_employee?.first_name} {pending.replacement_employee?.last_name}
                          </span>
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-2">Warten auf Bestätigung des Mitarbeiters …</p>
                      </div>
                    );
                  }
                  return (
                    <button onClick={() => handleFindReplacement(sr)} className="w-full mt-5 py-3 rounded-xl text-sm font-semibold bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors flex items-center justify-center gap-2">
                      <Search size={16} /> Ersatz finden
                    </button>
                  );
                })()}
                {hasReplacement && (() => {
                  const replacementRequest = replacementRequests.find(rr => rr.sick_report_id === sr.id);
                  const detailsOpen = replacementDetailsOpen === sr.employee_id;
                  return (
                    <div className="mt-5 space-y-2">
                      <div className="py-2.5 rounded-xl text-sm font-semibold bg-[#F0FDF4] text-[#16A34A] text-center flex items-center justify-center gap-2">
                        <UserCheck size={16} /> Ersatz gefunden
                      </div>
                      <button
                        onClick={() => setReplacementDetailsOpen(detailsOpen ? null : sr.employee_id)}
                        className="w-full py-2 rounded-xl text-xs font-medium text-[#64748B] bg-white/70 hover:bg-white border border-[#E2E8F0] transition-colors flex items-center justify-center gap-1.5"
                      >
                        {detailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        Details einsehen
                      </button>
                      {detailsOpen && replacementRequest && (
                        <div className="bg-white/80 border border-[#E2E8F0] rounded-xl px-4 py-3 space-y-1.5 text-sm">
                          <div className="flex items-center gap-2 text-[#0F172A]">
                            <User size={13} className="text-[#94A3B8] shrink-0" />
                            <span className="font-semibold">{replacementRequest.replacement_employee?.first_name} {replacementRequest.replacement_employee?.last_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[#64748B]">
                            <Clock size={13} className="text-[#94A3B8] shrink-0" />
                            <span>{new Date(replacementRequest.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, {new Date(replacementRequest.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sick employees WITHOUT assignments */}
      {sickWithoutAssignments.length > 0 && (
        <div className="mb-8">
          <h2 className="section-label text-[#F97316] mb-4 flex items-center gap-2">
            <AlertTriangle size={14} /> Krankmeldungen
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sickWithoutAssignments.map(({ sickReport: sr }) => (
              <div key={sr.employee_id} className="bg-[#FFF7ED] border border-[#FFEDD5]/60 rounded-[1.5rem] p-5">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <Avatar firstName={sr.employee?.first_name || ''} lastName={sr.employee?.last_name || ''} id={sr.employee_id} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[#0F172A]">{sr.employee?.first_name} {sr.employee?.last_name}</p>
                    <span className="badge-warning mt-1.5">Krankgemeldet</span>
                    <p className="text-xs text-[#94A3B8] mt-1.5">{formatSickDate(sr)}</p>
                    {sr.reason && <p className="text-sm text-[#64748B] mt-1">Grund: {sr.reason}</p>}
                    <p className="text-xs text-[#94A3B8] mt-1">Kein Einsatz heute</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-[1.5rem] shadow-[0_6px_24px_-10px_rgba(15,23,42,0.12)] p-5 sm:p-6">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="stat-icon" style={{ backgroundColor: '#EFF6FF' }}>
              <Users size={20} className="text-[#2563EB]" />
            </div>
            <p className="section-label">Mitarbeiter</p>
          </div>
          {loading ? (
            <div className="h-8 w-16 bg-[#F1F5F9] rounded-lg animate-pulse" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <p className="text-[1.75rem] leading-none font-bold text-[#0F172A] tracking-tight">{activeEmployees.length}</p>
              <span className="text-sm text-[#94A3B8]">/</span>
              <span className="text-sm text-[#94A3B8]">{companyEmployees.length}</span>
            </div>
          )}
          <p className="text-xs text-[#94A3B8] mt-2.5">verfügbar</p>
          {!loading && sickCount > 0 && <p className="text-xs text-[#F97316] font-semibold mt-1">{sickCount} krank</p>}
        </div>
        <div className="bg-[#0F172A] rounded-[1.5rem] shadow-[0_10px_32px_-8px_rgba(15,23,42,0.35)] p-5 sm:p-6">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="stat-icon" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <CalendarDays size={20} className="text-white" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/60">Einsätze heute</p>
          </div>
          {loading ? (
            <div className="h-8 w-10 bg-white/10 rounded-lg animate-pulse" />
          ) : (
            <p className="text-[1.75rem] leading-none font-bold text-white tracking-tight">{todayAssignments.length}</p>
          )}
          {!loading && (todayAssignments.length > 0 ? (
            <p className="text-xs text-[#4ADE80] font-medium mt-2.5">{propertiesWithAssignments.length} Objekte</p>
          ) : (
            <p className="text-xs text-white/50 mt-2.5">Keine Einsätze</p>
          ))}
        </div>
        <div className="bg-white rounded-[1.5rem] shadow-[0_6px_24px_-10px_rgba(15,23,42,0.12)] p-5 sm:p-6 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="stat-icon" style={{ backgroundColor: sickCount > 0 ? '#FEF2F2' : '#F0FDF4' }}>
              <HeartPulse size={20} className={sickCount > 0 ? 'text-[#EF4444]' : 'text-[#16A34A]'} />
            </div>
            <p className="section-label">Krankmeldungen</p>
          </div>
          {loading ? (
            <div className="h-8 w-10 bg-[#F1F5F9] rounded-lg animate-pulse" />
          ) : (
            <p className="text-[1.75rem] leading-none font-bold text-[#0F172A] tracking-tight">{sickCount}</p>
          )}
          {!loading && (openSickCount > 0 ? (
            <p className="text-xs text-[#EF4444] font-semibold mt-2.5">{openSickCount} Ersatz fehlt</p>
          ) : coveredSickCount > 0 ? (
            <p className="text-xs text-[#16A34A] font-medium mt-2.5">{coveredSickCount} mit Ersatz</p>
          ) : (
            <p className="text-xs text-[#16A34A] font-medium mt-2.5">Alles erledigt</p>
          ))}
        </div>
      </div>

      {/* Today's Assignments */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[#0F172A]">Heutige Einsätze</h2>
          <span className="text-xs text-[#94A3B8] font-medium">{today.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        </div>

        {loading ? (
          // Vorher wurde hier beim ersten Laden kurz "Keine Einsätze für
          // heute" angezeigt, bevor die echten Daten da waren - sah aus wie
          // ein leerer Tag, obwohl nur noch geladen wurde.
          <div className="bg-white rounded-[1.5rem] shadow-[0_6px_24px_-10px_rgba(15,23,42,0.12)] p-10 text-center">
            <div className="w-6 h-6 border-2 border-[#CBD5E1] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : todayAssignments.length === 0 ? (
          <div className="bg-white rounded-[1.5rem] shadow-[0_6px_24px_-10px_rgba(15,23,42,0.12)] p-10 text-center">
            <CalendarDays size={36} className="text-[#CBD5E1] mx-auto mb-3" />
            <p className="text-sm text-[#94A3B8]">Keine Einsätze für heute</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedPropertyAssignments.map((group) => {
              const propAssignments = group.assignments;
              const hasSick = sickReportsForCompany.some(sr => propAssignments.some(a => a.employee_id === sr.employee_id));
              const sickForProp = sickReportsForCompany.filter(sr => propAssignments.some(a => a.employee_id === sr.employee_id));
              const activeAssignments = propAssignments.filter(a => !sickReportsForCompany.some(sr => sr.employee_id === a.employee_id));
              const hasReplacementRequest = sickForProp.some(sr => replacementRequests.some(rr => rr.sick_report_id === sr.id && rr.property_id === group.property.id && rr.status === 'accepted'));
              const hasLateNoCheckIn = activeAssignments.some(a => isLateNoCheckIn(a));

              let statusColor = 'bg-[#CBD5E1]';
              if (hasSick && activeAssignments.length === 0) statusColor = 'bg-[#F87171]';
              else if (hasLateNoCheckIn) statusColor = 'bg-[#F87171]';
              else if (propAssignments.length > 0 && !hasSick) statusColor = 'bg-[#22C55E]';
              else if (hasSick) statusColor = 'bg-[#FB923C]';

              return (
                <div key={`${group.property.id}_${group.timeFrom}_${group.timeTo}`} className="bg-white rounded-[1.5rem] shadow-[0_6px_24px_-10px_rgba(15,23,42,0.12)]">
                  <div className="p-5 sm:p-6 flex items-start gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${statusColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A]">{group.property.name}</p>
                      <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5"><MapPin size={12} className="text-[#94A3B8]" /> {group.property.address}</p>
                      <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5"><Clock size={12} className="text-[#94A3B8]" /> {formatTime(group.timeFrom)} – {formatTime(group.timeTo)} Uhr</p>
                      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                        {activeAssignments.map(a => (
                          <span key={a.id} className="chip"><User size={11} /> {a.employee?.first_name} {a.employee?.last_name?.charAt(0)}.</span>
                        ))}
                        {sickForProp.map(sr => (
                          <span key={sr.id} className="chip !bg-[#FEF2F2] !text-[#EF4444]"><User size={11} /> {sr.employee?.first_name} {sr.employee?.last_name?.charAt(0)}. (krank)</span>
                        ))}
                        {activeAssignments.length === 0 && !hasSick && <span className="text-xs text-[#94A3B8]">Kein Personal zugewiesen</span>}
                        {hasSick && activeAssignments.length === 0 && !hasReplacementRequest && <span className="text-xs text-[#EF4444] font-semibold">Ersatz fehlt noch</span>}
                        {hasSick && activeAssignments.length === 0 && hasReplacementRequest && <span className="text-xs text-[#16A34A] font-semibold">Ersatz gefunden</span>}
                      </div>
                    </div>
                    {hasSick && activeAssignments.length === 0 && sickForProp.length > 0 && !hasReplacementRequest && (
                      <button onClick={() => handleFindReplacement(sickForProp[0])} className="bg-[#EF4444] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#DC2626] transition-colors shrink-0 flex items-center gap-1.5">
                        <span className="hidden sm:inline">Ersatz finden</span><span className="sm:hidden">Ersatz</span>
                      </button>
                    )}
                    {hasSick && activeAssignments.length === 0 && hasReplacementRequest && (
                      <div className="bg-[#F0FDF4] text-[#16A34A] px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 flex items-center gap-1.5">
                        <UserCheck size={15} />
                        <span className="hidden sm:inline">Ersatz gefunden</span><span className="sm:hidden">Ersatz</span>
                      </div>
                    )}
                  </div>
                  {propAssignments.length > 0 && (
                    <div className="border-t border-[#F1F5F9] divide-y divide-[#F1F5F9]">
                      {propAssignments.map(a => {
                        const isSick = sickReportsForCompany.some(sr => sr.employee_id === a.employee_id);
                        const lateNoCheckIn = !isSick && isLateNoCheckIn(a);
                        return (
                          <div key={a.id} className={`px-5 sm:px-6 py-3.5 flex items-center gap-3 ${isSick ? 'bg-[#FEF2F2]/40' : lateNoCheckIn ? 'bg-[#FEF2F2]/30' : ''}`}>
                            <Avatar firstName={a.employee?.first_name || ''} lastName={a.employee?.last_name || ''} id={a.employee_id} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#0F172A]">{a.employee?.first_name} {a.employee?.last_name}</p>
                              {lateNoCheckIn && (
                                <p className="text-xs text-[#EF4444] font-medium mt-0.5 flex items-center gap-1">
                                  <AlarmClock size={11} /> Noch nicht eingecheckt
                                </p>
                              )}
                            </div>
                            {isSick && <span className="badge-danger">Krank</span>}
                            {!isSick && (
                              <span className={
                                lateNoCheckIn ? 'badge-danger' :
                                a.status === 'checked_in' ? 'badge-success' :
                                a.status === 'completed' ? 'badge-neutral' :
                                'badge-info'
                              }>
                                {lateNoCheckIn ? 'Fehlt' :
                                  a.status === 'checked_in' ? 'Eingecheckt' :
                                  a.status === 'completed' ? 'Fertig' : 'Zugewiesen'}
                              </span>
                            )}
                            {a.status === 'assigned' && !isSick && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleCheckIn(a.id)} className="p-1.5 rounded-lg hover:bg-[#F0FDF4] transition-colors text-[#22C55E]" title="Einchecken"><Check size={15} /></button>
                                <button onClick={() => setRemoveConfirm(a)} className="p-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors text-[#F87171]" title="Entfernen"><X size={15} /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {replacementModal && (
        <ReplacementModal
          sickReport={replacementModal.sickReport}
          property={replacementModal.property}
          employees={companyEmployees}
          employeeProperties={employeeProperties}
          assignments={todayAssignments}
          onClose={() => setReplacementModal(null)}
          onComplete={handleReplacementComplete}
        />
      )}

      {/* Remove Confirmation */}
      <RemoveAssignmentModal assignment={removeConfirm} onClose={() => setRemoveConfirm(null)} onConfirm={handleRemoveAssignment} />
    </div>
  );
}
