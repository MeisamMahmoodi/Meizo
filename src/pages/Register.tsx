import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { VerifyCodeForm } from '../components/shared/VerifyCodeForm';

export function Register() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 'form' -> Firmenname/E-Mail/Passwort, 'verify' -> 6-stelliger Code aus
  // der Mail. Vorher gab es hier nur eine "Mail geschickt, klick den Link"-
  // Meldung — der Link riss aus der installierten PWA raus in Safari/Mail,
  // siehe heutige Diskussion zur Mitarbeiter-App. Der Code bleibt in der App.
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const { signUp, verifySignupOtp, resendSignupOtp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen haben');
      return;
    }

    setLoading(true);
    const { error: err } = await signUp(email, password, companyName.trim());
    setLoading(false);

    if (err) {
      setError(err.includes('already registered') ? 'Diese E-Mail ist bereits registriert' : err);
    } else {
      setStep('verify');
    }
  };

  const handleGoogle = async () => {
    setError('');
    const { error: err } = await signInWithGoogle();
    if (err) setError(err);
  };

  if (step === 'verify') {
    return (
      <VerifyCodeForm
        email={email}
        onVerify={async (code) => {
          const { error: err } = await verifySignupOtp(email, code);
          // Bei Erfolg uebernimmt App.tsx (Session vorhanden, noch kein
          // Profil -> NoProfileScreen fuehrt die Firmen-Einrichtung fertig
          // aus), deshalb hier keine explizite Navigation noetig.
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
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">meizo</h1>
          <p className="text-ink-500 text-sm mt-1.5">Kostenloses Konto erstellen und testen</p>
        </div>

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
          Mit Google registrieren
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-ink-100" />
          <span className="text-xs text-ink-300 font-medium">oder</span>
          <div className="flex-1 h-px bg-ink-100" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Firmenname"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <input
              type="email"
              placeholder="E-Mail"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field"
            />
          </div>

          {error && <p className="text-sm text-danger-500 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading || !companyName.trim() || !email || !password}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-ink-900 text-white hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Wird erstellt...' : 'Konto erstellen'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="w-full text-center text-xs font-medium text-ink-500 hover:text-ink-900 transition-colors pt-5"
        >
          Schon ein Konto? Anmelden
        </button>
      </div>
    </div>
  );
}
