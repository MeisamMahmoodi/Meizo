import { useState, useRef, useEffect } from 'react';

interface VerifyCodeFormProps {
  email: string;
  onVerify: (code: string) => Promise<{ error: string | null }>;
  onResend: () => Promise<{ error: string | null }>;
  onBack: () => void;
  submitLabel?: string;
}

// Gemeinsamer "6-stelligen Code eingeben"-Screen fuer Owner-Registrierung
// (Register.tsx) und Mitarbeiter-Einladung (EmployeeInvite.tsx). Bewusst
// EIN Eingabefeld statt sechs einzelner Kaestchen mit Auto-Weiterspringen:
// weniger Fokus-Verwaltung, weniger Fehlerquellen in der PWA (siehe die
// Safari/PWA-Ueberraschungen von heute). autoComplete="one-time-code"
// sorgt trotzdem dafuer, dass iOS den Code aus der Mail-App oberhalb der
// Tastatur zum Antippen vorschlagen kann.
export function VerifyCodeForm({ email, onVerify, onResend, onBack, submitLabel = 'Bestätigen' }: VerifyCodeFormProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.trim().length < 6) {
      setError('Bitte gib den 6-stelligen Code ein.');
      return;
    }
    setLoading(true);
    const { error: err } = await onVerify(code.trim());
    setLoading(false);
    if (err) {
      setError(
        err.toLowerCase().includes('expired') || err.toLowerCase().includes('invalid')
          ? 'Der Code ist falsch oder abgelaufen. Bitte prüfe ihn oder fordere einen neuen an.'
          : err
      );
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resendState === 'sending') return;
    setError('');
    setResendState('sending');
    const { error: err } = await onResend();
    setResendState('sent');
    setCooldown(30);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-11 w-auto mx-auto mb-5" />
          <h1 className="text-xl font-bold text-ink-900 tracking-tight mb-2">Code eingeben</h1>
          <p className="text-ink-500 text-sm leading-relaxed">
            Wir haben einen 6-stelligen Code an <span className="font-semibold text-ink-900">{email}</span> geschickt.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input-field text-center text-2xl font-bold tracking-[0.5em]"
          />

          {error && <p className="text-sm text-danger-500 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-ink-900 text-white hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Wird geprüft...' : submitLabel}
          </button>
        </form>

        <div className="text-center mt-5 space-y-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resendState === 'sending'}
            className="text-xs font-medium text-ink-500 hover:text-ink-900 transition-colors disabled:opacity-50"
          >
            {resendState === 'sending'
              ? 'Wird gesendet...'
              : cooldown > 0
              ? `Code erneut senden (${cooldown}s)`
              : resendState === 'sent'
              ? 'Erneut gesendet — Code erneut senden'
              : 'Code nicht bekommen? Erneut senden'}
          </button>
          <div>
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-medium text-ink-300 hover:text-ink-700 transition-colors"
            >
              Andere E-Mail verwenden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
