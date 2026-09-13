import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
export function EmployeeInvite() {
  const navigate = useNavigate();
  const code = window.location.pathname.replace('/einladung/', '').trim().toUpperCase();
  const [invite, setInvite] = useState<InviteState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-employee-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Die Einladung konnte nicht eingelöst werden.');
        setSubmitting(false);
        return;
      }
      // Konto steht serverseitig schon, jetzt nur noch selbst einloggen —
      // dafuer braucht es keinen zusaetzlichen Token-Umweg ueber die Edge
      // Function, das Passwort ist hier ja schon im Browser bekannt.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Konto wurde erstellt, die automatische Anmeldung ist aber fehlgeschlagen. Bitte melde dich manuell an.');
        setSubmitting(false);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setError('Etwas ist schiefgelaufen. Bitte versuche es erneut.');
      setSubmitting(false);
    }
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
