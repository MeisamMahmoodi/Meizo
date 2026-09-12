import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Package, Users, FileSpreadsheet, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/shared/Toast';
import { calculateMonthlyPrice } from '../../lib/plans';
import { ChecklistSettings } from '../../components/owner/ChecklistSettings';
import type { Company } from '../../lib/types';

interface SettingsProps {
  company: Company;
  onRefresh: () => void;
}

export function Settings({ company, onRefresh }: SettingsProps) {
  const [name, setName] = useState(company.name);
  const [ownerName, setOwnerName] = useState(company.owner_name);
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [employeeCount, setEmployeeCount] = useState(0);

  const [beraternummer, setBeraternummer] = useState(company.datev_beraternummer || '');
  const [mandantennummer, setMandantennummer] = useState(company.datev_mandantennummer || '');
  const [lohnartStunden, setLohnartStunden] = useState(company.datev_lohnart_stunden || '');
  const [savingDatev, setSavingDatev] = useState(false);

  const [autoDispatchEnabled, setAutoDispatchEnabled] = useState(company.auto_dispatch_enabled);
  const [savingAutoDispatch, setSavingAutoDispatch] = useState(false);

  const { addToast } = useToast();

  useEffect(() => {
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', company.id)
      .then(({ count }) => setEmployeeCount(count ?? 0));
  }, [company.id]);

  const handleSave = async () => {
    setSaving(true);
    // Login email is intentionally not editable anywhere in the app (owner
    // or employee) — only the password can be changed.
    const { error } = await supabase
      .from('companies')
      .update({ name, owner_name: ownerName })
      .eq('id', company.id);

    setSaving(false);
    if (error) {
      addToast('Fehler beim Speichern', 'error');
    } else {
      addToast('Einstellungen gespeichert');
      onRefresh();
    }
  };

  const handleSaveDatev = async () => {
    setSavingDatev(true);
    const { error } = await supabase
      .from('companies')
      .update({
        datev_beraternummer: beraternummer || null,
        datev_mandantennummer: mandantennummer || null,
        datev_lohnart_stunden: lohnartStunden || null,
      })
      .eq('id', company.id);

    setSavingDatev(false);
    if (error) {
      addToast('Fehler beim Speichern', 'error');
    } else {
      addToast('DATEV-Angaben gespeichert');
      onRefresh();
    }
  };

  const handleToggleAutoDispatch = async (next: boolean) => {
    setAutoDispatchEnabled(next);
    setSavingAutoDispatch(true);
    const { error } = await supabase
      .from('companies')
      .update({ auto_dispatch_enabled: next })
      .eq('id', company.id);

    setSavingAutoDispatch(false);
    if (error) {
      setAutoDispatchEnabled(!next);
      addToast('Fehler beim Speichern', 'error');
    } else {
      addToast(next ? 'Automatische Ersatzsuche aktiviert' : 'Automatische Ersatzsuche deaktiviert');
      onRefresh();
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      addToast('Passwort muss mindestens 6 Zeichen haben', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Passwörter stimmen nicht überein', 'error');
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      addToast('Fehler beim Ändern des Passworts', 'error');
    } else {
      setNewPassword('');
      setConfirmPassword('');
      addToast('Passwort geändert');
    }
  };

  return (
    <div>
      <h1 className="text-2xl sm:text-[28px] font-bold text-ink-900 tracking-tight mb-8">Einstellungen</h1>

      <div className="space-y-6 max-w-lg">
        {/* Preis & Team */}
        <div className="rounded-2xl border p-6 sm:p-7 bg-[#F0FDF4] border-[#BBF7D0]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm">
                <Package size={22} className="text-[#16A34A]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-0.5 flex items-center gap-1.5">
                  <Users size={11} /> {employeeCount} Mitarbeiter
                </p>
                <p className="text-xl font-bold text-ink-900">{calculateMonthlyPrice(employeeCount)}€/Monat</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D]">Aktiv</span>
          </div>
          <p className="text-sm text-ink-700 mt-4">
            Alle Funktionen sind für dich freigeschaltet. Der Preis passt sich automatisch an, sobald du Mitarbeiter hinzufügst oder entfernst — keine Pakete, keine versteckten Grenzen.
          </p>
        </div>

        {/* Company Settings */}
        <div className="card p-6 sm:p-8">
          <h2 className="text-base font-semibold text-ink-900 mb-5">Firmendaten</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-900 mb-1.5">Firmenname</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-900 mb-1.5">Inhaber Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary mt-6"
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>

        {/* Automatische Ersatzsuche */}
        <div className="card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2.5">
              <Search size={18} className="text-ink-500" /> Automatische Ersatzsuche
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={autoDispatchEnabled}
              disabled={savingAutoDispatch}
              onClick={() => handleToggleAutoDispatch(!autoDispatchEnabled)}
              className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${autoDispatchEnabled ? 'bg-brand-500' : 'bg-surface-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${autoDispatchEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-ink-500 mt-3 leading-relaxed">
            Wenn aktiviert, fragt meizo bei einer Krankmeldung automatisch verfügbare Mitarbeiter nacheinander an, bevorzugt werden Mitarbeiter, die das Objekt schon kennen, und wer in den letzten 30 Tagen am seltensten gefragt wurde. Jeder Kandidat hat 5 Minuten Zeit zu antworten, danach wird automatisch der nächste gefragt. Ist es aus, musst du Ersatz weiterhin manuell über "Ersatz finden" anfragen.
          </p>
        </div>

        {/* DATEV Export */}
        <div className="card p-6 sm:p-8">
          <h2 className="text-base font-semibold text-ink-900 mb-2 flex items-center gap-2.5">
            <FileSpreadsheet size={18} className="text-ink-500" /> DATEV-Export einrichten
          </h2>
          <p className="text-sm text-ink-500 mb-5 leading-relaxed">
            Diese drei Angaben bekommst du einmalig von deinem Steuerberater — Beraternummer und Mandantennummer kennt er, die Lohnart-Nummer für Stundenlohn muss er einmal in seinem DATEV-System für dich einrichten. Danach funktioniert der monatliche Export in der Abrechnung automatisch.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-900 mb-1.5">Beraternummer</label>
              <input type="text" value={beraternummer} onChange={e => setBeraternummer(e.target.value)} placeholder="z. B. 12345" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-900 mb-1.5">Mandantennummer</label>
              <input type="text" value={mandantennummer} onChange={e => setMandantennummer(e.target.value)} placeholder="z. B. 678" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-900 mb-1.5">Lohnart-Nummer für Stundenlohn</label>
              <input type="text" value={lohnartStunden} onChange={e => setLohnartStunden(e.target.value)} placeholder="von deinem Steuerberater erfragen" className="input-field" />
            </div>
          </div>
          <button onClick={handleSaveDatev} disabled={savingDatev} className="btn-primary mt-6">
            {savingDatev ? 'Speichern...' : 'Speichern'}
          </button>
        </div>

        {/* Password Change */}
        <div className="card p-6 sm:p-8">
          <h2 className="text-base font-semibold text-ink-900 mb-5 flex items-center gap-2.5">
            <Lock size={18} className="text-ink-500" /> Passwort ändern
          </h2>
          <div className="space-y-4">
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                placeholder="Neues Passwort"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="input-field !pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700 transition-colors"
              >
                {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div>
              <input
                type={showPasswords ? 'text' : 'password'}
                placeholder="Passwort bestätigen"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword || !confirmPassword}
            className="btn-secondary mt-6"
          >
            {savingPassword ? 'Wird geändert...' : 'Passwort ändern'}
          </button>
        </div>

        {/* Checklists */}
        <ChecklistSettings company={company} />
      </div>
    </div>
  );
}
