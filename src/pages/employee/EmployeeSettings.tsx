import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLang } from '../../hooks/useLang';
import { Modal } from '../../components/shared/Modal';

// Einstellungen-Tab der Mitarbeiter-App. Enthaelt aktuell nur "Abmelden"
// (aus dem alten "Bottom Actions"-Block in EmployeeHome hierher verschoben).
// Naechster Schritt laut Plan: Passwort aendern kommt hier ebenfalls rein.
export function EmployeeSettings() {
  const { signOut } = useAuth();
  const { t, rtl } = useLang();
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  return (
    <div className={`min-h-screen bg-surface-50 px-5 sm:px-6 pt-12 pb-24 max-w-md mx-auto ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-ink-900 tracking-tight mb-6">{t('tabSettings')}</h1>

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
