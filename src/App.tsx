import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LangProvider, useLang } from './hooks/useLang';
import { ToastProvider } from './components/shared/Toast';
import { OwnerLayout } from './components/owner/OwnerLayout';
import { BottomTabBar, type EmployeeTab } from './components/employee/BottomTabBar';
import { supabase } from './lib/supabase';
import { AndroidInstallBanner } from './components/shared/AndroidInstallBanner';
import { IosInstallButton } from './components/shared/IosInstallGuide';
import type { Company } from './lib/types';
import { Eye, EyeOff } from 'lucide-react';
import { PaywallModal } from './components/shared/PaywallModal';

// Lazy-loaded: each role/page only downloads its own code instead of
// everyone paying for the full bundle (owner dashboard, admin cockpit,
// employee app, DATEV export, etc. all in one 694KB chunk previously).
const Dashboard = lazy(() => import('./pages/owner/Dashboard').then(m => ({ default: m.Dashboard })));
const Employees = lazy(() => import('./pages/owner/Employees').then(m => ({ default: m.Employees })));
const Properties = lazy(() => import('./pages/owner/Properties').then(m => ({ default: m.Properties })));
const Assignments = lazy(() => import('./pages/owner/Assignments').then(m => ({ default: m.Assignments })));
const Payroll = lazy(() => import('./pages/owner/Payroll').then(m => ({ default: m.Payroll })));
const Controlling = lazy(() => import('./pages/owner/Controlling').then(m => ({ default: m.Controlling })));
const Timestamps = lazy(() => import('./pages/owner/Timestamps').then(m => ({ default: m.Timestamps })));
const Settings = lazy(() => import('./pages/owner/Settings').then(m => ({ default: m.Settings })));
const Impressum = lazy(() => import('./pages/owner/Impressum').then(m => ({ default: m.Impressum })));
const Datenschutz = lazy(() => import('./pages/owner/Datenschutz').then(m => ({ default: m.Datenschutz })));
const EmployeeHome = lazy(() => import('./pages/employee/EmployeeHome').then(m => ({ default: m.EmployeeHome })));
const EmployeeHours = lazy(() => import('./pages/employee/EmployeeHours').then(m => ({ default: m.EmployeeHours })));
const EmployeeSettings = lazy(() => import('./pages/employee/EmployeeSettings').then(m => ({ default: m.EmployeeSettings })));
const SickLeave = lazy(() => import('./pages/employee/SickLeave').then(m => ({ default: m.SickLeave })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));
const Landing = lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal').then(m => ({ default: m.CustomerPortal })));
const Register = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const EmployeeInvite = lazy(() => import('./pages/EmployeeInvite').then(m => ({ default: m.EmployeeInvite })));

// Shown in a Suspense fallback while a lazy chunk downloads (only on first
// visit to that section — cached afterwards).
function PageLoader() {
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function OwnerApp({ company, onCompanyRefresh }: { company: Company & { paid_until: string | null }; onCompanyRefresh: () => Promise<void> }) {
  const [page, setPage] = useState('dashboard');

  return (
    <OwnerLayout company={company} activePage={page} onNavigate={setPage} onCompanyRefresh={onCompanyRefresh}>
      {(props) => (
        <Suspense fallback={<PageLoader />}>
          {(() => {
            switch (page) {
              case 'dashboard': return <Dashboard {...props} />;
              case 'employees': return <Employees {...props} />;
              case 'properties': return <Properties {...props} />;
              case 'assignments': return <Assignments {...props} />;
              case 'payroll': return <Payroll {...props} />;
              case 'controlling': return <Controlling {...props} />;
              case 'timestamps': return <Timestamps {...props} />;
              case 'settings': return <Settings company={props.company} onRefresh={props.onRefresh} />;
              case 'impressum': return <Impressum />;
              case 'datenschutz': return <Datenschutz />;
              default: return <Dashboard {...props} />;
            }
          })()}
        </Suspense>
      )}
    </OwnerLayout>
  );
}

function EmployeeApp() {
  const [screen, setScreen] = useState<'home' | 'sick'>('home');
  const [tab, setTab] = useState<EmployeeTab>('home');
  const [refreshKey, setRefreshKey] = useState(0);

  // Krankmeldung ist ein fokussierter Vollbild-Ablauf, kein vierter Tab —
  // deshalb eigener "screen"-State statt Teil von "tab", und die Tab-Bar
  // wird waehrenddessen ausgeblendet.
  if (screen === 'sick') {
    return (
      <Suspense fallback={<PageLoader />}>
        <SickLeave onBack={() => setScreen('home')} onComplete={() => { setScreen('home'); setRefreshKey(k => k + 1); }} />
      </Suspense>
    );
  }

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        {tab === 'home' && <EmployeeHome key={refreshKey} onSickLeave={() => setScreen('sick')} />}
        {tab === 'hours' && <EmployeeHours />}
        {tab === 'settings' && <EmployeeSettings />}
      </Suspense>
      <BottomTabBar active={tab} onChange={setTab} />
    </>
  );
}

function ChangePasswordScreen() {
  const { changePassword } = useAuth();
  const { t, rtl } = useLang();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(t('passwordMinLength'));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordsDontMatch'));
      return;
    }

    setLoading(true);
    const { error: err } = await changePassword(password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className={`min-h-screen bg-surface-50 flex items-center justify-center px-6 ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-11 w-auto mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">{t('setPassword')}</h1>
          <p className="text-ink-500 text-sm mt-1.5">{t('chooseOwnPassword')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('newPassword')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field !pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700 transition-colors ${rtl ? 'left-3.5' : 'right-3.5'}`}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('confirmPassword')}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="input-field"
            />
          </div>

          {error && <p className="text-sm text-danger-500 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="btn-primary w-full py-3"
          >
            {loading ? t('saving') : t('savePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccountSuspendedScreen() {
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-10 w-auto mx-auto" />
        <div className="card p-8 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Konto gesperrt</h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Ihr Konto wurde vom Inhaber deaktiviert. Bitte wenden Sie sich direkt an uns, um Ihr Konto wiederherzustellen.
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Kontakt</p>
            <a
              href="mailto:meisammahmoodi08@gmail.com"
              className="flex items-center gap-2 text-sm font-medium text-slate-800 hover:text-slate-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              meisammahmoodi08@gmail.com
            </a>
            <a
              href="tel:+4917661860432"
              className="flex items-center gap-2 text-sm font-medium text-slate-800 hover:text-slate-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              +49 176 6186 0432
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingPage() {
  const isPwa = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isPwa) {
    return <UnifiedLogin />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Landing />
    </Suspense>
  );
}

  

function PricingGate() {
  const [showLogin, setShowLogin] = useState(false);
  if (showLogin) return <UnifiedLogin />;
  return (
    <Suspense fallback={<PageLoader />}>
      <Pricing onContinue={() => setShowLogin(true)} />
    </Suspense>
  );
}

function PublicLegalPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] py-10 px-5 sm:px-6">
      <div className="max-w-2xl mx-auto mb-6">
        <a href="/" className="text-sm font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors">
          ← Zurück zu meizo
        </a>
      </div>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, mustChangePassword, passwordRecovery, signOut } = useAuth();
  const [role, setRole] = useState<'owner' | 'employee' | 'admin' | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  // Unterscheidet "die Profil-Abfrage brauchte laenger als das Timeout"
  // (Verbindung langsam, Abfrage laeuft evtl. noch im Hintergrund weiter)
  // von einem echten "kein Profil vorhanden" — vorher zeigte beides dieselbe
  // beunruhigende "Kein Profil gefunden"-Meldung mit Abmelden-Button, obwohl
  // sich die Ansicht bei langsamem Netz oft von selbst korrigiert haette.
  const [roleFetchTimedOut, setRoleFetchTimedOut] = useState(false);
  const [ownerCompany, setOwnerCompany] = useState<(Company & { paid_until: string | null }) | null | undefined>(undefined);
  const [suspended, setSuspended] = useState(false);
  const prevUserId = React.useRef<string | null>(null);

  // Laedt die Firmendaten neu und aktualisiert die eine "Quelle der Wahrheit"
  // (ownerCompany), statt wie vorher nur einen lokalen Zaehler in OwnerLayout
  // zu erhoehen. Vorher blieben Aenderungen aus Einstellungen (Firmenname,
  // DATEV-Angaben usw.) app-weit auf dem Stand vom Login, bis man neu laedt —
  // z.B. schlug der DATEV-Export direkt nach dem Eintragen der Beraternummer
  // weiterhin fehl, weil er noch das alte company-Objekt sah.
  const refreshOwnerCompany = useCallback(async () => {
    if (!user) return;
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();
    setOwnerCompany(company ? { ...company, paid_until: (company as unknown as { paid_until: string | null }).paid_until ?? null } : null);
  }, [user]);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid === prevUserId.current) return;
    prevUserId.current = uid;

    if (!uid) {
      // Don't clear suspended here — suspension screen must persist after signOut
      setRole(null);
      setCompanyId(null);
      setOwnerCompany(undefined);
      setRoleLoading(false);
      return;
    }

    setSuspended(false);

    setRoleLoading(true);
    setRoleFetchTimedOut(false);

    // Vorher 3000ms: auf einer langsamen Verbindung (Hotel-WLAN, mobile
    // Daten) lief dieses Timeout oft ab, bevor die Profil-Abfrage fertig
    // war, und der Nutzer sah kurz "Kein Profil gefunden" mit Abmelden-
    // Button, obwohl gar nichts kaputt war. Grosszuegigerer Wert, und wenn
    // es doch abläuft, wird das separat vermerkt (roleFetchTimedOut) statt
    // wie ein echtes "kein Profil" behandelt zu werden.
    const timeout = setTimeout(() => {
      setRoleLoading(false);
      setRoleFetchTimedOut(true);
    }, 8000);

    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .maybeSingle();

        if (data?.role === 'owner' || data?.role === 'employee' || data?.role === 'admin') {
          setRole(data.role);
          if (data.role === 'owner') {
            const { data: company } = await supabase
              .from('companies')
              .select('*')
              .eq('owner_id', uid)
              .maybeSingle();
            setCompanyId(company?.id ?? null);
            setOwnerCompany(company ? { ...company, paid_until: (company as unknown as { paid_until: string | null }).paid_until ?? null } : null);
          }
        } else {
          setRole(null);
          setCompanyId(null);
        }
      } catch {
        setRole(null);
        setCompanyId(null);
        setOwnerCompany(undefined);
      } finally {
        clearTimeout(timeout);
        setRoleLoading(false);
        // Die Abfrage ist wirklich fertig (Erfolg oder Fehler) — das ist ein
        // echtes Ergebnis, kein Timeout-Ratespiel mehr.
        setRoleFetchTimedOut(false);
      }
    })();

    return () => clearTimeout(timeout);
  }, [user]);

  // Realtime: watch for company deletion while owner is logged in
  useEffect(() => {
    if (!companyId || role !== 'owner') return;

    const channel = supabase
      .channel(`company-suspension-${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
        (payload) => {
          if (payload.new?.deleted_at) {
            setSuspended(true);
            signOut();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, role, signOut]);

  // Öffentlicher Kunden-Link — muss für jeden funktionieren, auch für Besucher
  // ohne Login oder mit einer fremden Session im selben Browser. Alle Hooks
  // oben sind schon deklariert, dieser Return kommt erst danach (React-Regel:
  // Hooks nie nach einem bedingten Return aufrufen).
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/kunde/')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <CustomerPortal />
      </Suspense>
    );
  }

  // Oeffentlicher Einladungslink fuer neue Mitarbeiter-Konten — muss
  // genau wie /kunde/ fuer jeden erreichbar sein, unabhaengig von einer
  // evtl. schon bestehenden fremden Session im selben Browser.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/einladung/')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <EmployeeInvite />
      </Suspense>
    );
  }

  if (suspended) {
    return <AccountSuspendedScreen />;
  }

  // Recovery link clicked (forgot password) — let the user set a new
  // password immediately, regardless of role/loading state.
  if (passwordRecovery) {
    return <ChangePasswordScreen />;
  }

  if (loading || (user && roleLoading) || (role === 'owner' && ownerCompany === undefined)) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<UnifiedLogin />} />
        <Route path="/register" element={<Suspense fallback={<PageLoader />}><Register /></Suspense>} />
        <Route path="/pricing" element={<PricingGate />} />
        <Route path="/impressum" element={<PublicLegalPage><Impressum /></PublicLegalPage>} />
        <Route path="/datenschutz" element={<PublicLegalPage><Datenschutz /></PublicLegalPage>} />
        <Route path="/*" element={<LandingPage />} />
      </Routes>
    );
  }

  if (role === 'admin') {
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminDashboard />
      </Suspense>
    );
  }

  if (mustChangePassword && role === 'employee') {
    return <ChangePasswordScreen />;
  }

  if (role === 'employee') {
    return (
      <Routes>
        <Route path="/*" element={<EmployeeApp />} />
      </Routes>
    );
  }

  if (role === 'owner') {
    if (!ownerCompany) {
      return (
        <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
          <p className="text-ink-500 text-sm">Kein Unternehmen gefunden.</p>
        </div>
      );
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const trialActive = ownerCompany.trial_ends_at ? new Date(ownerCompany.trial_ends_at) >= today : false;
    const paidActive = ownerCompany.paid_until ? new Date(ownerCompany.paid_until) >= today : false;
    const showPaywall = !trialActive && !paidActive;
    return (
      <>
        <Routes>
          <Route path="/*" element={<OwnerApp company={ownerCompany} onCompanyRefresh={refreshOwnerCompany} />} />
        </Routes>
        {showPaywall && <PaywallModal companyId={ownerCompany.id} />}
      </>
    );
  }

  return <NoProfileScreen user={user} signOut={signOut} timedOut={roleFetchTimedOut} />;
}

// Shown when someone is authenticated but has no profiles row yet. Covers
// two very different cases:
// 1. A fresh self-signup finishing its first visit — either an email/
//    password account with pending_company_name in its metadata (set by
//    Register.tsx at signUp time), or a first-time Google login (Google is
//    only ever reached via the "Mit Google registrieren" button, so any
//    Google-authenticated session without a profile is by definition new).
// 2. A genuinely orphaned account (e.g. an employee whose profile got
//    deleted) — falls back to the original error message.
function NoProfileScreen({ user, signOut, timedOut }: { user: NonNullable<ReturnType<typeof useAuth>['user']>; signOut: () => Promise<void>; timedOut?: boolean }) {
  const pendingCompanyName = (user.user_metadata?.pending_company_name as string | undefined)?.trim();
  // Gesetzt von EmployeeInvite.tsx bei signUp() — nach der Code-Bestaetigung
  // landet der Mitarbeiter hier mit Session, aber noch ohne Profil. Gleiches
  // Muster wie pendingCompanyName oben, nur fuer den Einladungs-Weg.
  const pendingInviteCode = (user.user_metadata?.pending_invite_code as string | undefined)?.trim();
  const isFreshGoogleLogin = !pendingCompanyName && user.app_metadata?.provider === 'google';

  const [companyName, setCompanyName] = useState(pendingCompanyName ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!pendingCompanyName || !!pendingInviteCode);
  const [failed, setFailed] = useState(false);

  const completeSignup = async (name: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-signup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_name: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Fehler beim Einrichten');
      window.location.reload();
    } catch (err) {
      setLoading(false);
      setFailed(true);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const completeInvite = async (inviteCode: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finalize-employee-invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: inviteCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Die Einladung konnte nicht abgeschlossen werden.');
      window.location.reload();
    } catch (err) {
      setLoading(false);
      setFailed(true);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (pendingCompanyName) completeSignup(pendingCompanyName);
    else if (pendingInviteCode) completeInvite(pendingInviteCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pendingCompanyName && !failed) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (pendingInviteCode && !failed) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isFreshGoogleLogin && !failed) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-11 w-auto mx-auto mb-5" />
            <h1 className="text-xl font-bold text-ink-900 tracking-tight">Fast geschafft</h1>
            <p className="text-ink-500 text-sm mt-1.5">Wie heißt deine Firma?</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (companyName.trim()) completeSignup(companyName.trim()); }} className="space-y-4">
            <input
              type="text"
              placeholder="Firmenname"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className="input-field"
              autoFocus
            />
            {error && <p className="text-sm text-danger-500 text-center font-medium">{error}</p>}
            <button
              type="submit"
              disabled={loading || !companyName.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-ink-900 text-white hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Wird erstellt...' : 'Konto erstellen'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (timedOut && !failed) {
    // Das war nur ein Timeout, kein bestaetigtes "kein Profil" - die Abfrage
    // laeuft evtl. noch. Bewusst weniger alarmierend als die Meldung unten
    // (kein Abmelden-Button), da ein Reload das meistens von selbst loest.
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <p className="text-ink-500 text-sm">Das dauert gerade länger als gewöhnlich. Bitte prüfe deine Internetverbindung.</p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <p className="text-ink-500 text-sm">
          {failed ? error : 'Kein Profil gefunden. Bitte wenden Sie sich an den Administrator.'}
        </p>
        <button
          onClick={signOut}
          className="btn-primary"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}

function UnifiedLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent' | 'invite'>('login');
  const [inviteCode, setInviteCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const { signIn, signInWithGoogle, requestPasswordReset } = useAuth();
  const { t, lang, setLang, rtl } = useLang();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: err } = await signIn(email, password);
    if (err) setError(t('invalidCredentials'));
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError('');
    const { error: err } = await signInWithGoogle();
    if (err) setError(err);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setLoading(true);
    const { error: err } = await requestPasswordReset(resetEmail);
    setLoading(false);
    // Always show the "sent" confirmation, even on error — this avoids
    // leaking whether an email address exists in the system.
    if (err) {
      setResetError(err);
    } else {
      setMode('sent');
    }
  };

  return (
    <div className={`min-h-screen bg-surface-50 flex items-center justify-center px-6 ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-11 w-auto mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">meizo</h1>
          <p className="text-ink-500 text-sm mt-1.5">{mode === 'login' ? t('login') : t('forgotPassword')}</p>
        </div>

        {mode === 'login' && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold border border-ink-100 bg-white text-ink-900 hover:bg-surface-50 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
              </svg>
              {t('continueWithGoogle')}
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-ink-100" />
              <span className="text-xs text-ink-300 font-medium">{t('orDivider')}</span>
              <div className="flex-1 h-px bg-ink-100" />
            </div>
          </>
        )}

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder={t('email')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder={t('password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
              />
            </div>

            {error && <p className="text-sm text-danger-500 text-center font-medium">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-ink-900 text-white hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('sending') : t('login')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setResetEmail(email); setResetError(''); }}
              className="w-full text-center text-xs font-medium text-ink-500 hover:text-ink-900 transition-colors pt-1"
            >
              {t('forgotPassword')}
            </button>
            <button
              type="button"
              onClick={() => setMode('invite')}
              className="w-full text-center text-xs font-medium text-ink-500 hover:text-ink-900 transition-colors"
            >
              Einladungscode eingeben
            </button>
            <div className="flex justify-center pt-1">
              <IosInstallButton />
            </div>
          </form>
        )}

        {/* Fallback fuer Mitarbeiter, die ihren Einladungslink nicht direkt
            anklicken konnten (z.B. muendlich diktiert statt per WhatsApp
            geteilt) — leitet einfach auf dieselbe /einladung/CODE Seite
            weiter, die auch beim direkten Klick auf den Link erscheint. */}
        {mode === 'invite' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-500 text-center -mt-2 mb-2">
              Gib den Einladungscode ein, den du von deinem Chef bekommen hast.
            </p>
            <input
              type="text"
              placeholder="z.B. K7M2XQAB"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              className="input-field text-center tracking-widest font-semibold"
              autoFocus
              autoCapitalize="characters"
            />
            <button
              type="button"
              disabled={!inviteCode.trim()}
              onClick={() => { window.location.href = `/einladung/${inviteCode.trim()}`; }}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-ink-900 text-white hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Bestätigen
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-center text-xs font-medium text-ink-500 hover:text-ink-900 transition-colors pt-1"
            >
              {t('backToLogin')}
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-sm text-ink-500 text-center -mt-2 mb-2">{t('resetPasswordPrompt')}</p>
            <div>
              <input
                type="email"
                placeholder={t('email')}
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                className="input-field"
                autoFocus
              />
            </div>

            {resetError && <p className="text-sm text-danger-500 text-center font-medium">{resetError}</p>}

            <button
              type="submit"
              disabled={loading || !resetEmail}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-ink-900 text-white hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('sending') : t('sendResetLink')}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-center text-xs font-medium text-ink-500 hover:text-ink-900 transition-colors pt-1"
            >
              {t('backToLogin')}
            </button>
          </form>
        )}

        {mode === 'sent' && (
          <div className="text-center space-y-5">
            <p className="text-sm text-ink-700">{t('resetLinkSent')}</p>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="text-sm font-semibold text-ink-900 hover:underline"
            >
              {t('backToLogin')}
            </button>
          </div>
        )}

        {/* Language switcher on login page */}
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          {(['de', 'ro', 'ar', 'pl', 'en', 'uk', 'tr', 'bg'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                lang === l ? 'bg-ink-900 text-white shadow-sm' : 'bg-surface-100 text-ink-500 hover:bg-surface-200'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LangProvider>
          <ToastProvider>
            <AppRoutes />
            <AndroidInstallBanner />
          </ToastProvider>
        </LangProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
