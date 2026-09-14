import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { VerifyCodeForm } from '../components/shared/VerifyCodeForm';

type InviteReason = 'not_found' | 'used' | 'expired';

type InviteState =
  | { status: 'loading' }
  | { status: 'invalid'; reason: InviteReason }
  | { status: 'valid'; companyName: string; firstName: string | null };

const REASON_TEXT: Record<InviteReason, string> = {
  not_found: 'Dieser Einladungslink wurde nicht gefunden. Bitte prüfe den Link oder wende dich an deinen Chef.',
  used: 'Diese Einladung wurde bereits verwendet. Bitte wende dich an deinen Chef für einen neuen Link.',
  expired: 'Diese Einladung ist abgelaufen. Bitte wende dich an deinen Chef für einen neuen Link.',
};

// Oeffentliche Seite unter /einladung/CODE — bewusst ausserhalb der
// normalen rollenbasierten Routen in App.tsx gerendert (gleiches Muster wie
// /kunde/:token bei CustomerPortal), weil hier noch niemand eingeloggt ist.
//
// Ablauf seit der E-Mail-Verifizierung: die Seite erstellt das Konto nicht
// mehr direkt server-seitig (vorher: accept-employee-invite legte das Konto
// sofort mit email_confirm=true an, ganz ohne Nachweis, dass die
// eingegebene Adresse ueberhaupt existiert/dem Nutzer gehoert). Stattdessen
// laeuft es jetzt genau wie bei der Chef-Registrierung ueber Supabase Auth
// selbst: signUp() -> 6-stelliger Code per Mail -> verifyOtp(). Erst danach,
// wenn die Mail-Adresse nachweislich bestaetigt ist, verknuepft
// finalize-employee-invite (App.tsx/NoProfileScreen ruft das automatisch
// auf) den Mitarbeiter-Datensatz mit dem neuen Konto.
export function EmployeeInvite() {
  const navigate = useNavigate();
  const { verifySignupOtp, resendSignupOtp } = useAuth();
  const code = window.location.pathname.replace('/einladung/', '').trim().toUpperCase();
  const [invite, setInvite] = useState<InviteState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'verify'>('form');

  useEffect(() => {
    if (!code) { setInvite({ status: 'invalid', reason: 'not_found' }); return; }
    supabase
      .rpc('get_employee_invite_info', { p_code: code })
      .then(({ data, error: rpcError }) => {
        if (rpcError || !data) { setInvite({ status: 'invalid', reason: 'not_found' }); return; }
        if (!data.valid) { setInvite({ status: 'invalid', reason: data.reason as InviteReason }); return; }
        setInvite({ status: 'valid', companyName: data.company_name, firstName: data.first_name });
      });
  }, [code]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    setSubmitting(true);

    // Einladung direkt vor dem Anlegen des Kontos nochmal frisch pruefen —
    // sie kann zwischen dem Laden der Seite und dem Absenden inzwischen
    // verbraucht oder abgelaufen sein.
    const { data: freshInvite, error: rpcError } = await supabase
      .rpc('get_employee_invite_info', { p_code: code });
    if (rpcError || !freshInvite || !freshInvite.valid) {
      setInvite({ status: 'invalid', reason: (freshInvite?.reason as InviteReason) ?? 'not_found' });
      setSubmitting(false);
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { pending_invite_code: code } },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(
        signUpError.message.includes('already registered')
          ? 'Diese E-Mail ist bereits registriert. Bitte melde dich an oder nutze eine andere E-Mail-Adresse.'
          : signUpError.message
      );
      return;
    }
    setStep('verify');
  };

  if (invite.status === 'loading') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (invite.status === 'invalid') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-5">
          <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-10 w-auto mx-auto" />
          <div className="card p-6 space-y-3">
            <h1 className="text-lg font-bold text-ink-900">Einladung nicht gültig</h1>
            <p className="text-sm text-ink-500 leading-relaxed">{REASON_TEXT[invite.reason]}</p>
          </div>
          <a href="/login" className="text-sm font-semibold text-ink-900 hover:underline">
            Zum Login
          </a>
        </div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <VerifyCodeForm
        email={email}
        onVerify={async (otp) => {
          const { error: err } = await verifySignupOtp(email, otp);
          if (!err) {
            // Session steht jetzt — App.tsx (NoProfileScreen) verknuepft
            // den Mitarbeiter-Datensatz automatisch ueber
            // finalize-employee-invite, sobald es die neue Session sieht.
            navigate('/', { replace: true });
          }
          return { error: err };
        }}
        onResend={() => resendSignupOtp(email)}
        onBack={() => setStep('form')}
        submitLabel="Konto bestätigen"
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-11 w-auto mx-auto mb-5" />
          <h1 className="text-xl font-bold text-ink-900 tracking-tight">
            Einladung zu {invite.companyName}
          </h1>
          <p className="text-ink-500 text-sm mt-1.5">
            {invite.firstName ? `Willkommen, ${invite.firstName}. ` : ''}Richte dein eigenes Konto ein.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Deine E-Mail-Adresse"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="input-field"
            autoFocus
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Wähle ein Passwort"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="input-field !pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 -translate-y-1/2 right-3.5 text-ink-300 hover:text-ink-700 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <p className="text-sm text-danger-500 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="btn-primary w-full py-3"
          >
            {submitting ? 'Konto wird erstellt...' : 'Konto erstellen'}
          </button>
        </form>
      </div>
    </div>
  );
}
