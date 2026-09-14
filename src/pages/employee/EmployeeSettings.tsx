import { useState, type FormEvent } from 'react';
import { LogOut, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLang } from '../../hooks/useLang';
import { useToast } from '../../components/shared/Toast';
import { Modal } from '../../components/shared/Modal';

// Einstellungen-Tab der Mitarbeiter-App. Enthaelt "Passwort aendern" und
// "Abmelden" (Abmelden kam aus dem alten "Bottom Actions"-Block in
// EmployeeHome hierher).
export function EmployeeSettings() {
  const { user, signIn, changePassword, signOut } = useAuth();
  const { t, rtl } = useLang();
  const { addToast } = useToast();
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError(t('passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('passwordsDontMatch'));
      return;
    }

    setSavingPassword(true);
    // Wer eingeloggt ist, kennt nicht zwangslaeufig auch das Passwort (z.B.
    // ein liegen gelassenes, entsperrtes Handy) — deshalb erst das aktuelle
    // Passwort verifizieren, bevor es geaendert wird.
    const { error: verifyError } = await signIn(user?.email ?? '', currentPassword);
    if (verifyError) {
      setSavingPassword(false);
      setPasswordError(t('currentPasswordWrong'));
      return;
    }

    const { error: changeError } = await changePassword(newPassword);
    setSavingPassword(false);
    if (changeError) {
      setPasswordError(changeError);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    addToast(t('passwordChanged'), 'success');
  };

  return (
    <div className={`min-h-screen bg-surface-50 px-5 sm:px-6 pt-12 pb-24 max-w-md mx-auto ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-ink-900 tracking-tight mb-6">{t('tabSettings')}</h1>

      {/* Passwort aendern */}
      <div className="card p-5 mb-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900 mb-4">
          <KeyRound size={16} className="text-ink-300" /> {t('changePassword')}
        </p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder={t('currentPassword')}
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="input-field"
            autoComplete="current-password"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('newPassword')}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input-field !pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700 transition-colors ${rtl ? 'left-3.5' : 'right-3.5'}`}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder={t('confirmPassword')}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="input-field"
            autoComplete="new-password"
          />

          {passwordError && <p className="text-sm text-danger-500 font-medium">{passwordError}</p>}

          <button
            type="submit"
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="btn-primary w-full py-3"
          >
            {savingPassword ? t('saving') : t('savePassword')}
          </button>
        </form>
      </div>

      {/* Abmelden */}
      <div className="card divide-y divide-surface-200">
        <button
          onClick={() => setLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-4 py-4 text-sm font-medium text-danger-500 hover:bg-danger-50 transition-colors rounded-2xl"
        >
          <LogOut size={17} /> {t('logOut')}
        </button>
      </div>

      <Modal open={logoutConfirm} onClose={() => setLogoutConfirm(false)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-danger-50 flex items-center justify-center mb-5">
            <LogOut size={22} className="text-danger-500" />
          </div>
          <h2 className="text-lg font-bold text-ink-900 mb-2">Wirklich abmelden?</h2>
          <p className="text-sm text-ink-500 leading-relaxed mb-8">Du wirst ausgeloggt und musst dich erneut anmelden.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setLogoutConfirm(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={() => { setLogoutConfirm(false); signOut(); }} className="btn-danger">Abmelden</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
