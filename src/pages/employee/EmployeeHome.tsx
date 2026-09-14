import { useState, useEffect, useRef } from 'react';
import { MapPin, Clock, LogIn, Mail, Heart, Bell, CheckCircle, CalendarDays, Globe, AlertTriangle, LogOut as CheckOutIcon, BellRing, BellOff, AlarmClock, CloudOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useLang } from '../../hooks/useLang';
import { formatDateLong, formatTime, toLocalDateStr } from '../../lib/utils';
import { langNames, langFlags, langLocale, type Lang } from '../../lib/i18n';
import { CheckInFlow } from '../../components/employee/CheckInFlow';
import { CheckOutFlow } from '../../components/employee/CheckOutFlow';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useToast } from '../../components/shared/Toast';
import { setSwUpdateBusy } from '../../lib/swUpdate';
import type { Employee, Property, Assignment, ReplacementRequest, Notification, SickReport } from '../../lib/types';

interface EmployeeHomeProps {
  onSickLeave: () => void;
}

const availableLangs: Lang[] = ['de', 'ro', 'ar', 'pl', 'en', 'uk', 'tr', 'bg'];

interface AssignmentWithProperty extends Assignment {
  property: Property;
}

export function EmployeeHome({ onSickLeave }: EmployeeHomeProps) {
  const { user } = useAuth();
  const { lang, setLang, t, rtl } = useLang();
  const { addToast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const { permission, subscribed, loading: pushLoading, error: pushError, subscribe, unsubscribe } = usePushNotifications(employee?.id ?? null);
  useEffect(() => {
    if (pushError) addToast(pushError, 'error');
  }, [pushError, addToast]);
  const { pendingCount } = useOfflineSync(() => loadData());
  const [todayAssignment, setTodayAssignment] = useState<AssignmentWithProperty | null>(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState<AssignmentWithProperty[]>([]);
  const [replacementRequest, setReplacementRequest] = useState<(ReplacementRequest & { property: Property; sickEmployee: Employee }) | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [showCheckInFlow, setShowCheckInFlow] = useState(false);
  const [showCheckOutFlow, setShowCheckOutFlow] = useState(false);
  const [requestResponded, setRequestResponded] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [sickReports, setSickReports] = useState<SickReport[]>([]);
  const [markingHealthy, setMarkingHealthy] = useState(false);
  const [respondingReplacement, setRespondingReplacement] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangPicker(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Waehrend ein Check-in/-out-Vorgang laeuft (GPS-Lock, Kamera, Upload),
  // soll ein im Hintergrund bereits aktiver neuer Service Worker die Seite
  // nicht per Reload unterbrechen — siehe src/lib/swUpdate.ts.
  useEffect(() => {
    setSwUpdateBusy(showCheckInFlow || showCheckOutFlow);
  }, [showCheckInFlow, showCheckOutFlow]);

  useEffect(() => {
    return () => setSwUpdateBusy(false);
  }, []);

  const today = new Date();
  const todayStr = toLocalDateStr(today);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  useEffect(() => {
    if (!employee) return;
    const channel = supabase
      .channel(`employee-home-${employee.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `employee_id=eq.${employee.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sick_reports', filter: `employee_id=eq.${employee.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `employee_id=eq.${employee.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replacement_requests' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employee?.id]);

  // Show push prompt when employee loaded and not yet subscribed (or permission not yet decided)
  useEffect(() => {
    if (employee && !subscribed && (permission === 'default' || permission === 'granted')) {
      const timer = setTimeout(() => setShowPushPrompt(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [employee, permission, subscribed]);

  async function loadData() {
    try {
      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!emp) return;
      setEmployee(emp);

      const { data: todayAssign } = await supabase
        .from('assignments')
        .select('*, property:properties(*)')
        .eq('employee_id', emp.id)
        .eq('date', todayStr)
        .in('status', ['assigned', 'checked_in'])
        .limit(1);

      if (todayAssign && todayAssign.length > 0) {
        const a = todayAssign[0] as unknown as AssignmentWithProperty;
        setTodayAssignment(a);
        if (a.status === 'checked_in') {
          setCheckedIn(true);
          setCheckedInAt(a.checked_in_at || null);
        }
      } else {
        setTodayAssignment(null);
      }

const { data: upcoming } = await supabase
  .from('assignments')
  .select('*, property:properties(*)')
  .eq('employee_id', emp.id)
  .gt('date', todayStr)
  .eq('status', 'assigned')
  .order('date', { ascending: true });

      setUpcomingAssignments((upcoming as unknown as AssignmentWithProperty[]) || []);

      const { data: requests } = await supabase
        .from('replacement_requests')
        .select('*, property:properties(*)')
        .eq('replacement_employee_id', emp.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (requests && requests.length > 0) {
        const req = requests[0];
        const { data: sickEmp } = await supabase
          .from('sick_reports')
          .select('*, employee:employees(*)')
          .eq('id', req.sick_report_id)
          .maybeSingle();

        setReplacementRequest({
          ...req,
          property: req.property,
          sickEmployee: sickEmp?.employee,
        } as unknown as ReplacementRequest & { property: Property; sickEmployee: Employee });
      } else {
        setReplacementRequest(null);
      }

      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20);

      setNotifications(notifs || []);

      const { data: sickRes } = await supabase
        .from('sick_reports')
        .select('*')
        .eq('employee_id', emp.id)
        .gte('date', todayStr)
        .order('date', { ascending: false });

      setSickReports(sickRes || []);
    } catch {
      // Silently handle - component shows existing state
    }
  }

  const handleCheckInSuccess = () => {
    setCheckedIn(true);
    setCheckedInAt(new Date().toISOString());
    setShowCheckInFlow(false);
    loadData();
  };

  const handleCheckOutSuccess = () => {
    setShowCheckOutFlow(false);
    setTodayAssignment(null);
    loadData();
  };

  // Queued offline: reflect the check-in/-out locally right away, but don't
  // loadData() yet — the DB hasn't actually been updated. useOfflineSync will
  // call loadData() itself once the queued action syncs successfully.
  const handleCheckInQueued = () => {
    setCheckedIn(true);
    setCheckedInAt(new Date().toISOString());
    setShowCheckInFlow(false);
  };

  const handleCheckOutQueued = () => {
    setShowCheckOutFlow(false);
    setTodayAssignment(null);
  };

  const handleMarkAsHealthy = async () => {
    // Guard against double-tap: without this, a slow connection let people tap
    // twice and fire the delete+update pair twice in a row.
    if (!employee || markingHealthy) return;
    setMarkingHealthy(true);
    try {
      const todayStr = toLocalDateStr(new Date());
      // Beide Fehler werden jetzt geprueft — vorher wurde bei einem
      // Fehlschlag trotzdem "gesund" angezeigt (setSickReports([])), obwohl
      // der Server-Stand unveraendert war und z.B. das Dashboard weiterhin
      // "krank" zeigte.
      const { error: e1 } = await supabase.from('sick_reports').delete()
        .eq('employee_id', employee.id)
        .lte('date', todayStr)
        .or(`date_to.gte.${todayStr},date_to.is.null`);
      if (e1) { addToast(t('markHealthyError'), 'error'); return; }

      const { error: e2 } = await supabase
        .from('employees')
        .update({ status: 'active' })
        .eq('id', employee.id);
      if (e2) { addToast(t('markHealthyError'), 'error'); return; }

      setSickReports([]);
    } catch {
      addToast(t('markHealthyError'), 'error');
    } finally {
      setMarkingHealthy(false);
    }
  };

  const handleAcceptReplacement = async () => {
    // Guard against double-tap: a second tap before the first request/insert
    // finished used to be able to create a duplicate assignment row.
    if (!replacementRequest || !employee || respondingReplacement) return;
    setRespondingReplacement(true);
    try {
      const { error: e1 } = await supabase.from('replacement_requests').update({ status: 'accepted' }).eq('id', replacementRequest.id);
      if (e1) { addToast(t('acceptReplacementError'), 'error'); return; }
      const { error: e2 } = await supabase.from('assignments').insert({
        property_id: replacementRequest.property_id,
        employee_id: employee.id,
        date: todayStr,
        status: 'assigned',
        time_from: replacementRequest.property?.time_from ?? null,
        time_to: replacementRequest.property?.time_to ?? null,
      });
      if (e2) {
        // Anfrage war schon "accepted", aber der Einsatz selbst konnte nicht
        // angelegt werden — zurueck auf "pending" setzen, statt stillschweigend
        // eine Anfrage als erledigt zu markieren, zu der es keinen Einsatz gibt.
        await supabase.from('replacement_requests').update({ status: 'pending' }).eq('id', replacementRequest.id);
        addToast(t('acceptReplacementError'), 'error');
        return;
      }
      setRequestResponded(true);
    } catch {
      addToast(t('acceptReplacementError'), 'error');
    } finally {
      setRespondingReplacement(false);
    }
  };

  const handleDeclineReplacement = async () => {
    if (!replacementRequest || respondingReplacement) return;
    setRespondingReplacement(true);
    try {
      const { error } = await supabase.from('replacement_requests').update({ status: 'declined' }).eq('id', replacementRequest.id);
      if (error) { addToast(t('declineReplacementError'), 'error'); return; }
      setRequestResponded(true);
    } catch {
      addToast(t('declineReplacementError'), 'error');
    } finally {
      setRespondingReplacement(false);
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
  };

  const handleMarkAllRead = async () => {
    if (!employee) return;
    await supabase.from('notifications').update({ read: true }).eq('employee_id', employee.id).eq('read', false);
    setNotifications([]);
  };

  const getGreeting = () => {
    const hour = today.getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 18) return t('goodDay');
    return t('goodEvening');
  };

  const locale = langLocale[lang];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  };

  const formatSickLabel = (sr: SickReport) => {
    if (sr.date_to) {
      return `${t('sickReportedFrom')} ${formatDateShort(sr.date)} ${t('sickUntil')} ${formatDateShort(sr.date_to)}`;
    }
    return `${t('sickReportedFor')} ${formatDateShort(sr.date)}`;
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const unreadCount = notifications.length;
  const isSick = employee.status === 'sick';

  const isLateCheckIn = (() => {
    if (!todayAssignment || checkedIn || isSick) return false;
    const timeFrom = todayAssignment.time_from ?? todayAssignment.property?.time_from;
    if (!timeFrom) return false;
    const [h, m] = timeFrom.split(':').map(Number);
    const startMs = new Date().setHours(h, m, 0, 0);
    return Date.now() >= startMs + 5 * 60 * 1000;
  })();

  return (
    <div className={`min-h-screen bg-surface-50 px-5 sm:px-6 pt-12 pb-28 sm:pt-8 sm:pb-28 max-w-md mx-auto ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">
            {getGreeting()}, {employee.first_name}
          </h1>
          <p className="text-ink-500 text-sm mt-1.5">{formatDateLong(today)}</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative" ref={langRef}>
            <button onClick={() => setShowLangPicker(!showLangPicker)} aria-label={t('ariaChooseLanguage')} className="p-2.5 rounded-xl hover:bg-surface-100 transition-colors">
              <Globe size={20} className="text-ink-500" />
            </button>
            {showLangPicker && (
              <div className={`absolute top-12 bg-surface-0 rounded-xl shadow-elevated border border-surface-200/60 py-1.5 z-30 w-44 animate-scale-in ${rtl ? 'left-0' : 'right-0'}`}>
                {availableLangs.map(l => (
                  <button key={l} onClick={() => { setLang(l); setShowLangPicker(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${lang === l ? 'bg-brand-50 text-brand-600 font-semibold' : 'text-ink-900 hover:bg-surface-50'}`}>
                    <span className="text-base">{langFlags[l]}</span><span>{langNames[l]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => subscribed && permission === 'granted' ? unsubscribe() : subscribe()}
            disabled={pushLoading || permission === 'denied' || permission === 'unsupported'}
            title={subscribed && permission === 'granted' ? t('disableNotifications') : t('enableNotifications')}
            aria-label={subscribed && permission === 'granted' ? t('disableNotifications') : t('enableNotifications')}
            className="p-2.5 rounded-xl hover:bg-surface-100 transition-colors disabled:opacity-40"
          >
            {subscribed && permission === 'granted'
              ? <Bell size={20} className="text-brand-500" />
              : <BellOff size={20} className="text-ink-400" />
            }
          </button>
          <div className="relative" ref={notifRef}>
            <button onClick={() => setShowNotifications(!showNotifications)} aria-label={t('notifications')} className="relative p-2.5 rounded-xl hover:bg-surface-100 transition-colors">
              <Bell size={20} className="text-ink-500" />
              {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-danger-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-1">{unreadCount}</span>}
            </button>
            {showNotifications && (
              <div className={`absolute top-12 bg-surface-0 rounded-xl shadow-elevated border border-surface-200/60 py-1.5 z-30 w-72 max-h-80 overflow-y-auto animate-scale-in ${rtl ? 'left-0' : 'right-0'}`}>
                <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-900">{t('notifications')}</p>
                  {unreadCount > 0 && <button onClick={handleMarkAllRead} className="text-xs text-brand-600 font-semibold">{t('markAllRead')}</button>}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center"><p className="text-sm text-ink-300">{t('noNotifications')}</p></div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="px-4 py-3 hover:bg-surface-50 transition-colors cursor-pointer" onClick={() => handleMarkNotificationRead(n.id)}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.type === 'new_assignment' ? 'bg-brand-500' : 'bg-info-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900">{n.title}</p>
                          <p className="text-xs text-ink-300 mt-0.5">{n.message}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Push Permission Prompt */}
      {showPushPrompt && (permission === 'default' || permission === 'granted') && !subscribed && (
        <div className="mb-5 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#3B82F6] flex items-center justify-center shrink-0">
              <BellRing size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#1E3A5F]">{t('allowNotifications')}</p>
              <p className="text-xs text-[#3B82F6] mt-0.5 leading-relaxed">
                {t('allowNotificationsDesc')}
              </p>
            </div>
            <button onClick={() => setShowPushPrompt(false)} aria-label={t('ariaDismiss')} className="text-[#94A3B8] hover:text-[#64748B] shrink-0 mt-0.5">
              <BellOff size={15} />
            </button>
          </div>
          <div className="flex gap-2.5 mt-3.5">
            <button
              onClick={async () => {
                const ok = await subscribe();
                if (ok) setShowPushPrompt(false);
              }}
              disabled={pushLoading}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors disabled:opacity-60"
            >
              {pushLoading ? t('enablingNotifications') : t('enableNotifications')}
            </button>
            <button
              onClick={() => setShowPushPrompt(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-white border border-[#BFDBFE] text-[#3B82F6] hover:bg-[#EFF6FF] transition-colors"
            >
              {t('later')}
            </button>
          </div>
        </div>
      )}

      {/* Push active indicator (subtle, shown once subscribed) */}
      {subscribed && permission === 'granted' && (
        <div className="mb-5 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 flex items-center gap-2.5">
          <BellRing size={15} className="text-[#22C55E] shrink-0" />
          <p className="text-xs font-semibold text-[#15803D]">{t('notificationsActive')}</p>
        </div>
      )}

      {/* Offline queue indicator */}
      {pendingCount > 0 && (
        <div className="mb-5 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 flex items-center gap-2.5">
          <CloudOff size={15} className="text-[#F97316] shrink-0" />
          <p className="text-xs font-semibold text-[#9A3412]">
            {pendingCount === 1 ? '1 Eintrag wird synchronisiert' : `${pendingCount} Einträge werden synchronisiert`}, sobald du wieder online bist
          </p>
        </div>
      )}

      {/* SICK STATUS PINNED BANNER */}
      {isSick && sickReports.length > 0 && (
        <div className="bg-danger-50 border border-danger-200/60 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3.5">
            <AlertTriangle size={22} className="text-danger-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-bold text-danger-500">{t('youAreSick')}</p>
              <div className="mt-1 space-y-0.5">
                {sickReports.map(sr => (
                  <p key={sr.id} className="text-sm text-ink-500">{formatSickLabel(sr)}</p>
                ))}
              </div>
              <button
                onClick={handleMarkAsHealthy}
                disabled={markingHealthy}
                className="mt-3 py-2 px-3 rounded-lg text-sm font-semibold bg-danger-500 text-white hover:bg-danger-600 transition-colors disabled:opacity-60"
              >
                {t('markAsHealthy')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Banner */}
      {notifications.length > 0 && (
        <div className="mb-6 space-y-2.5">
          {notifications.slice(0, 3).map(n => (
            <div key={n.id} className={`rounded-2xl p-4 border ${n.type === 'new_assignment' ? 'bg-brand-50 border-brand-200/60' : 'bg-info-50 border-info-100'}`}>
              <div className="flex items-start gap-3">
                {n.type === 'new_assignment' ? <CalendarDays size={18} className="text-brand-500 shrink-0 mt-0.5" /> : <Mail size={18} className="text-info-500 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                  <p className="text-sm text-ink-500 mt-0.5">{n.message}</p>
                </div>
                <button onClick={() => handleMarkNotificationRead(n.id)} aria-label={t('ariaMarkNotificationRead')} className="text-ink-300 hover:text-ink-700 transition-colors shrink-0"><CheckCircle size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Replacement Request Banner */}
      {replacementRequest && !requestResponded && (
        <div className="bg-info-50 border border-info-100 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={18} className="text-info-500" />
            <span className="text-sm font-semibold text-info-600">{t('replacementRequest')}</span>
          </div>
          <p className="text-sm text-ink-700 mb-1">{replacementRequest.sickEmployee?.first_name} {t('canYouCover')}</p>
          <p className="text-sm text-ink-500">{replacementRequest.property?.name} · {formatTime(replacementRequest.property?.time_from || '')}–{formatTime(replacementRequest.property?.time_to || '')} Uhr</p>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAcceptReplacement} disabled={respondingReplacement} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-60">{t('yesICan')}</button>
            <button onClick={handleDeclineReplacement} disabled={respondingReplacement} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-surface-100 text-ink-500 hover:bg-surface-200 transition-colors disabled:opacity-60">{t('no')}</button>
          </div>
        </div>
      )}

      {replacementRequest && requestResponded && (
        <div className="bg-brand-50 border border-brand-200/60 rounded-2xl p-5 mb-6 text-center">
          <p className="text-sm font-semibold text-brand-700">{t('bossInformed')}</p>
          {replacementRequest.property?.address && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(replacementRequest.property.address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-brand-600 hover:underline">{t('showRoute')}</a>
          )}
        </div>
      )}

      {/* Late check-in warning banner */}
      {isLateCheckIn && (
        <div className="bg-danger-50 border border-danger-200/60 rounded-2xl p-4 mb-5 animate-scale-in">
          <div className="flex items-start gap-3">
            <AlarmClock size={20} className="text-danger-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-danger-500">{t('assignmentStarted')}</p>
              <p className="text-sm text-ink-500 mt-0.5">{t('notCheckedIn')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Today's Assignment */}
      <div className={`p-5 sm:p-6 mb-6 rounded-2xl border transition-colors ${isLateCheckIn ? 'bg-danger-50 border-danger-200/60' : 'card'}`}>
        <p className={`section-label mb-3 ${isLateCheckIn ? 'text-danger-500' : ''}`}>{t('todaysAssignment')}</p>
        {todayAssignment ? (
          <>
            <p className="text-lg font-bold text-ink-900">{todayAssignment.property?.name}</p>
            <p className="text-sm text-ink-500 mt-2 flex items-center gap-1.5"><MapPin size={14} className={isLateCheckIn ? 'text-danger-300' : 'text-ink-300'} /> {todayAssignment.property?.address}</p>
            <p className={`text-sm mt-1 flex items-center gap-1.5 ${isLateCheckIn ? 'text-danger-500 font-semibold' : 'text-ink-500'}`}>
              <Clock size={14} className={isLateCheckIn ? 'text-danger-400' : 'text-ink-300'} />
              {formatTime(todayAssignment.time_from ?? todayAssignment.property?.time_from ?? '')} – {formatTime(todayAssignment.time_to ?? todayAssignment.property?.time_to ?? '')} {t('clock')}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-300">{t('noAssignmentToday')}</p>
        )}
      </div>

      {/* Check-in Button */}
      {todayAssignment && !checkedIn && !isSick && (
        <button onClick={() => setShowCheckInFlow(true)} className={`w-full py-3.5 rounded-2xl text-base font-semibold transition-colors flex items-center justify-center gap-2.5 mb-6 shadow-sm ${isLateCheckIn ? 'bg-danger-500 text-white hover:bg-danger-600 animate-pulse' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
          <LogIn size={20} /> {isLateCheckIn ? t('checkInNow') : t('checkIn')}
        </button>
      )}

      {/* Checked-in status + checkout */}
      {checkedIn && todayAssignment && (
        <div className="mb-6 space-y-3">
          <div className="w-full py-3 rounded-2xl text-sm font-semibold bg-brand-50 text-brand-600 text-center border border-brand-200/50">
            {t('checkedIn')} {checkedInAt ? `${t('at')} ${new Date(checkedInAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} ${t('clock')}` : ''}
          </div>
          <button onClick={() => setShowCheckOutFlow(true)} className="w-full py-3.5 rounded-2xl text-base font-semibold bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2.5 shadow-sm">
            <CheckOutIcon size={20} /> {t('checkOut')}
          </button>
        </div>
      )}

      {/* Upcoming Assignments */}
      {upcomingAssignments.length > 0 && (
        <div className="mb-6">
          <p className="section-label mb-3">{t('upcomingAssignments')}</p>
          <div className="space-y-2.5">
            {upcomingAssignments.map(a => {
              const isToday = a.date === todayStr;
              return (
                <div key={a.id} className={`rounded-2xl p-4 ${isToday ? 'bg-brand-50 border border-brand-200/60' : 'card'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink-900">{a.property?.name}</p>
                    <span className={`text-xs font-semibold ${isToday ? 'text-brand-600' : 'text-ink-300'}`}>
                      {isToday ? t('today') : formatDate(a.date)}
                    </span>
                  </div>
                  <p className="text-[13px] text-ink-500 mt-1 flex items-center gap-1.5">
                    <MapPin size={12} className="text-ink-300" /> {a.property?.address}
                  </p>
                  <p className="text-[13px] text-ink-500 mt-0.5 flex items-center gap-1.5">
                    <Clock size={12} className="text-ink-300" /> {formatTime(a.time_from ?? a.property?.time_from ?? '')} – {formatTime(a.time_to ?? a.property?.time_to ?? '')} {t('clock')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Krank melden — Abmelden ist in den Einstellungen-Tab umgezogen
          (EmployeeSettings.tsx), da eine echte Bottom-Tab-Bar jetzt den
          App-Fuss übernimmt. */}
      {!isSick && (
        <div className="border-t border-surface-200 pt-5 mt-2">
          <button onClick={onSickLeave} className="w-full flex items-center justify-center gap-2 text-sm text-danger-500 hover:bg-danger-50 transition-colors py-3.5 rounded-xl font-semibold">
            <Heart size={16} /> {t('sickLeave')}
          </button>
        </div>
      )}

      {/* Check-in Flow Modal */}
      {showCheckInFlow && todayAssignment && (
        <CheckInFlow
          assignmentId={todayAssignment.id}
          propertyId={todayAssignment.property_id}
          propertyName={todayAssignment.property?.name || ''}
          propertyAddress={todayAssignment.property?.address || ''}
          propertyLat={todayAssignment.property?.lat}
          propertyLng={todayAssignment.property?.lng}
          propertyRadiusM={todayAssignment.property?.gps_radius_m}
          onSuccess={handleCheckInSuccess}
          onQueued={handleCheckInQueued}
          onCancel={() => setShowCheckInFlow(false)}
          rtl={rtl}
          lang={lang}
        />
      )}

      {/* Check-out Flow Modal */}
      {showCheckOutFlow && todayAssignment && checkedInAt && (
        <CheckOutFlow
          assignmentId={todayAssignment.id}
          propertyName={todayAssignment.property?.name || ''}
          propertyType={todayAssignment.property?.type}
          checkedInAt={checkedInAt}
          onSuccess={handleCheckOutSuccess}
          onQueued={handleCheckOutQueued}
          onCancel={() => setShowCheckOutFlow(false)}
          rtl={rtl}
          lang={lang}
        />
      )}
    </div>
  );
}
