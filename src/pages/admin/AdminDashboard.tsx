import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { calculateMonthlyPrice } from '../../lib/plans';
import { toLocalDateStr } from '../../lib/utils';
import { Modal as SharedModal } from '../../components/shared/Modal';
import {
  Building2, Users, ShieldCheck, LogOut, ChevronDown, ChevronUp,
  Plus, Eye, EyeOff, AlertTriangle, Calendar, CreditCard,
  CheckCircle, Clock, Trash2, RefreshCw, Key, Search, Database,
  UserCog, Mail, Copy, Check as CheckIcon, Crown, Activity,
} from 'lucide-react';

interface CompanyRow {
  id: string;
  name: string;
  owner_name: string;
  owner_email: string;
  owner_id: string | null;
  contract: string;
  contract_start: string | null;
  contract_end: string | null;
  paid_until: string | null;
  last_payment_at: string | null;
  deleted_at: string | null;
  created_at: string;
  employee_count: number;
  property_count: number;
  assignment_count: number;
  employees: { id: string; first_name: string; last_name: string; status: string; email: string | null; user_id: string | null; phone: string }[];
}

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  role: string | null;
  user_metadata: Record<string, unknown>;
}


function paymentStatus(c: CompanyRow): { label: string; color: string; icon: typeof CheckCircle } {
  if (!c.paid_until) return { label: 'Nicht hinterlegt', color: 'text-slate-400', icon: Clock };
  const until = new Date(c.paid_until);
  const daysLeft = Math.ceil((until.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return { label: `Überfällig (${Math.abs(daysLeft)}d)`, color: 'text-red-600', icon: AlertTriangle };
  if (daysLeft <= 7) return { label: `Fällig in ${daysLeft}d`, color: 'text-amber-600', icon: AlertTriangle };
  return { label: `Bezahlt bis ${until.toLocaleDateString('de-DE')}`, color: 'text-emerald-600', icon: CheckCircle };
}

function daysUntilPurge(deletedAt: string): number {
  const d = new Date(deletedAt);
  d.setDate(d.getDate() + 30);
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

async function callAdminAction(action: string, payload: Record<string, unknown>, token: string | undefined) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Fehler');
  return json;
}

// ── Create Owner Modal ───────────────────────────────────────────────────────
function CreateOwnerModal({ onClose, onCreated, token }: { onClose: () => void; onCreated: () => void; token?: string }) {
  const [form, setForm] = useState({
    owner_name: '', company_name: '', email: '', password: '',
    contract_start: toLocalDateStr(new Date()),
    paid_until: '',
    trial_ends_at: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return toLocalDateStr(d); })(),
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value as typeof form[typeof k] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.owner_name || !form.company_name || !form.email || !form.password) { setError('Alle Pflichtfelder ausfüllen.'); return; }
    // Einheitlich mit Registrierung, Owner-Settings und Passwort-Reset - vorher
    // war hier 8 Zeichen verlangt, überall sonst in der App 6, was verwirrend
    // war, wenn ein Admin ein Passwort setzen wollte, das anderswo gültig ist.
    if (form.password.length < 6) { setError('Passwort muss mindestens 6 Zeichen haben.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-owner-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          owner_name: form.owner_name, company_name: form.company_name, email: form.email, password: form.password,
          contract_start: form.contract_start ? new Date(form.contract_start).toISOString() : undefined,
          paid_until: form.paid_until ? new Date(form.paid_until).toISOString() : undefined,
          trial_ends_at: form.trial_ends_at || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Fehler beim Erstellen'); setLoading(false); return; }
      onCreated(); onClose();
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  };

  return (
    <Modal title="Neues Unternehmen anlegen" onClose={onClose}>
      <form onSubmit={submit} className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name des Chefs *"><input value={form.owner_name} onChange={set('owner_name')} className="input-field text-sm" placeholder="Max Mustermann" /></Field>
          <Field label="Firmenname *"><input value={form.company_name} onChange={set('company_name')} className="input-field text-sm" placeholder="Reinigungs GmbH" /></Field>
        </div>
        <Field label="E-Mail (Login) *">
          <input type="email" value={form.email} onChange={set('email')} className="input-field text-sm" placeholder="chef@firma.de" />
        </Field>
        <Field label="Passwort *">
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} className="input-field text-sm !pr-10" placeholder="Mindestens 6 Zeichen" />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vertragsbeginn"><input type="date" value={form.contract_start} onChange={set('contract_start')} className="input-field text-sm" /></Field>
          <Field label="Bezahlt bis"><input type="date" value={form.paid_until} onChange={set('paid_until')} className="input-field text-sm" /></Field>
        </div>
        <Field label="Testzeitraum endet am">
          <input type="date" value={form.trial_ends_at} onChange={set('trial_ends_at')} className="input-field text-sm" />
        </Field>
        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">
            {loading ? 'Wird erstellt…' : 'Konto erstellen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Delete / Restore Company Modal ───────────────────────────────────────────
function DeleteCompanyModal({ company, onClose, onDone, token }: { company: CompanyRow; onClose: () => void; onDone: () => void; token?: string }) {
  const [loading, setLoading] = useState(false);
  const [hardDelete, setHardDelete] = useState(false);
  const isDeleted = !!company.deleted_at;

  const softDelete = async () => {
    setLoading(true);
    await supabase.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', company.id);
    setLoading(false); onDone(); onClose();
  };

  const restore = async () => {
    setLoading(true);
    await supabase.from('companies').update({ deleted_at: null }).eq('id', company.id);
    setLoading(false); onDone(); onClose();
  };

  const hardDeleteCompany = async () => {
    setLoading(true);
    try {
      await callAdminAction('hard-delete-company', { companyId: company.id }, token);
      onDone(); onClose();
    } catch { /* no-op */ }
    setLoading(false);
  };

  return (
    <Modal title={isDeleted ? 'Unternehmen wiederherstellen' : 'Unternehmen löschen'} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {isDeleted ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
              <RefreshCw size={22} className="text-amber-600" />
            </div>
            <p className="text-sm text-slate-500 text-center">
              <strong>{company.name}</strong> wird in {daysUntilPurge(company.deleted_at!)} Tagen endgültig gelöscht. Jetzt wiederherstellen?
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
              <button onClick={restore} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {loading ? '…' : 'Wiederherstellen'}
              </button>
            </div>
          </>
        ) : hardDelete ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle size={22} className="text-red-600" />
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-bold text-red-900">Endgültig löschen</p>
              <p className="text-xs text-red-700 mt-1">
                <strong>{company.name}</strong>, alle Mitarbeiter, Objekte, Einsätze sowie die Auth-Konten (Owner & Mitarbeiter-Logins) werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setHardDelete(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Zurück</button>
              <button onClick={hardDeleteCompany} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {loading ? '…' : 'Endgültig löschen'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <p className="text-sm text-slate-500 text-center">
              <strong>{company.name}</strong> wird nach <strong>30 Tagen</strong> automatisch gelöscht. Bis dahin können die Daten wiederhergestellt werden.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
              <button onClick={softDelete} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {loading ? '…' : 'In 30 Tagen löschen'}
              </button>
            </div>
            <button onClick={() => setHardDelete(true)} className="w-full py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50">
              Stattdessen sofort endgültig löschen
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Billing Modal ────────────────────────────────────────────────────────────
function BillingModal({ company, onClose, onSaved }: { company: CompanyRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    contract_start: company.contract_start ? company.contract_start.split('T')[0] : '',
    contract_end: company.contract_end ? company.contract_end.split('T')[0] : '',
    paid_until: company.paid_until ? company.paid_until.split('T')[0] : '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setLoading(true);
    const { error: err } = await supabase.from('companies').update({
      contract_start: form.contract_start ? new Date(form.contract_start).toISOString() : null,
      contract_end: form.contract_end ? new Date(form.contract_end).toISOString() : null,
      paid_until: form.paid_until ? new Date(form.paid_until).toISOString() : null,
      last_payment_at: form.paid_until ? new Date().toISOString() : company.last_payment_at,
    }).eq('id', company.id);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onSaved(); onClose();
  };

  return (
    <Modal title="Vertrag & Zahlung" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">{company.name}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vertragsbeginn"><input type="date" value={form.contract_start} onChange={set('contract_start')} className="input-field text-sm" /></Field>
          <Field label="Vertragsende"><input type="date" value={form.contract_end} onChange={set('contract_end')} className="input-field text-sm" /></Field>
        </div>
        <Field label="Bezahlt bis"><input type="date" value={form.paid_until} onChange={set('paid_until')} className="input-field text-sm" /></Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
          <button onClick={save} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">
            {loading ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reset Password Modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, token }: { user: AuthUser; onClose: () => void; token?: string }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generate = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let out = '';
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setPassword(out);
  };

  const submit = async () => {
    setError('');
    if (password.length < 6) { setError('Mindestens 6 Zeichen'); return; }
    setLoading(true);
    try {
      await callAdminAction('reset-password', { userId: user.id, password }, token);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
    setLoading(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="Passwort zurücksetzen" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-400 font-medium">Benutzer</p>
          <p className="text-sm font-semibold text-slate-800">{user.email}</p>
          <p className="text-xs text-slate-500 mt-0.5">Rolle: {user.role ?? '—'}</p>
        </div>

        {done ? (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckIcon size={16} className="text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-900">Passwort gesetzt</p>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg p-2.5 border border-emerald-200">
                <code className="text-sm font-mono text-slate-800 flex-1 break-all">{password}</code>
                <button onClick={copy} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-700">
                  {copied ? <CheckIcon size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-xs text-emerald-700">Teile das Passwort sicher mit dem Nutzer. Es wird nicht gespeichert und kann später nicht eingesehen werden.</p>
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700">Fertig</button>
          </>
        ) : (
          <>
            <Field label="Neues Passwort">
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-field text-sm !pr-20" placeholder="Mind. 6 Zeichen" />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button type="button" onClick={generate} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-900 hover:text-slate-600">
                  Gen
                </button>
              </div>
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
              <button onClick={submit} disabled={loading || !password} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">
                {loading ? '…' : 'Passwort setzen'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Delete User Modal ────────────────────────────────────────────────────────
function DeleteUserModal({ user, isSelf, onClose, onDone, token }: { user: AuthUser; isSelf?: boolean; onClose: () => void; onDone: () => void; token?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const requiredPhrase = 'LÖSCHEN';

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await callAdminAction('delete-user', { userId: user.id }, token);
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
    setLoading(false);
  };

  return (
    <Modal title="Benutzer löschen" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
          <Trash2 size={22} className="text-red-600" />
        </div>
        {isSelf ? (
          <>
            {/* Der Server (admin-actions/delete-user) lehnt die Löschung des
                eigenen Kontos immer ab — vorher fragte die UI trotzdem nach
                einer Tipp-Bestätigung, die dann garantiert ins Leere lief.
                Ehrlicher: den Grund sofort zeigen, statt eine Aktion
                anzubieten, die nie gelingen kann. */}
            <p className="text-sm font-bold text-red-700 text-center bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              Das ist dein eigenes Konto. Aus Sicherheitsgründen kann ein Admin sein eigenes Konto hier nicht selbst löschen — bitte einen anderen Admin darum bitten.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Verstanden</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 text-center">
              <strong>{user.email}</strong> wird unwiderruflich aus der Authentifizierung entfernt. Zugehörige Firmen- oder Mitarbeiter-Datensätze bleiben erhalten (ohne Login).
            </p>
            <Field label={`Tippe "${requiredPhrase}" zum Bestätigen`}>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)} className="input-field text-sm" />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
              <button onClick={submit} disabled={loading || confirmText !== requiredPhrase} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {loading ? '…' : 'Endgültig löschen'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated, token }: { onClose: () => void; onCreated: () => void; token?: string }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'owner' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    // Einheitlich mit dem Rest der App (siehe Owner-Erstellung oben) - 6 statt 8 Zeichen.
    if (!form.email || form.password.length < 6) { setError('E-Mail und Passwort (min. 6 Zeichen) erforderlich'); return; }
    setLoading(true);
    try {
      await callAdminAction('create-user', form, token);
      onCreated(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
    setLoading(false);
  };

  return (
    <Modal title="Auth-Konto anlegen" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <Field label="E-Mail *"><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field text-sm" /></Field>
        <Field label="Passwort *"><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input-field text-sm" placeholder="Min. 6 Zeichen" /></Field>
        <Field label="Rolle">
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input-field text-sm">
            <option value="owner">Owner</option><option value="employee">Employee</option><option value="admin">Admin</option>
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Abbrechen</button>
          <button onClick={submit} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">
            {loading ? '…' : 'Anlegen'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────
// Duennwandiger Wrapper um die geteilte Modal-Komponente (Fokus-Fang, Escape,
// Klick-auf-Hintergrund-zum-Schliessen, Scroll-Sperre). Die lokale Kopie
// vorher hatte nichts davon, obwohl genau hier (Firma/Konto endgueltig
// loeschen, Passwort setzen) die riskantesten Aktionen der App liegen.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <SharedModal open onClose={onClose} width="max-w-md" ariaLabel={title}>
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </SharedModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── Companies Tab ────────────────────────────────────────────────────────────
function CompaniesTab({ companies, loading, token, onRefresh }: { companies: CompanyRow[]; loading: boolean; token?: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [billingTarget, setBillingTarget] = useState<CompanyRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'deleted' | 'overdue'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => companies.filter(c => {
    if (filter === 'active' && c.deleted_at) return false;
    if (filter === 'deleted' && !c.deleted_at) return false;
    if (filter === 'overdue' && (!c.paid_until || new Date(c.paid_until) >= new Date() || c.deleted_at)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.owner_email.toLowerCase().includes(q) && !c.owner_name.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [companies, filter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Firma, Chef oder E-Mail suchen…" className="input-field text-sm !pl-9" />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'deleted', 'overdue'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {{ all: 'Alle', active: 'Aktiv', deleted: 'Gelöscht', overdue: 'Überfällig' }[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-sm">{filtered.length} Unternehmen</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">Keine Einträge</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(c => {
              const open = expanded === c.id;
              const pay = paymentStatus(c);
              const PayIcon = pay.icon;
              const isDeleted = !!c.deleted_at;
              return (
                <li key={c.id} className={isDeleted ? 'opacity-60' : ''}>
                  <button onClick={() => setExpanded(open ? null : c.id)} className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDeleted ? 'bg-red-50' : 'bg-slate-100'}`}>
                          <Building2 size={16} className={isDeleted ? 'text-red-400' : 'text-slate-500'} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                            {isDeleted && <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-md">Löschen in {daysUntilPurge(c.deleted_at!)}d</span>}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{c.owner_name} · {c.owner_email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700">
                          <CreditCard size={11} /> {calculateMonthlyPrice(c.employee_count)}€/Monat
                        </span>
                        <span className={`hidden sm:flex items-center gap-1 text-xs font-medium ${pay.color}`}><PayIcon size={13} /> {pay.label}</span>
                        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        <StatCard icon={Calendar} label="Vertragsbeginn" value={c.contract_start ? new Date(c.contract_start).toLocaleDateString('de-DE') : '—'} />
                        <StatCard icon={Calendar} label="Vertragsende" value={c.contract_end ? new Date(c.contract_end).toLocaleDateString('de-DE') : 'Laufend'} />
                        <StatCard icon={CreditCard} label="Bezahlt bis" value={c.paid_until ? new Date(c.paid_until).toLocaleDateString('de-DE') : '—'} valueClass={pay.color} />
                        <StatCard icon={Clock} label="Letzte Zahlung" value={c.last_payment_at ? new Date(c.last_payment_at).toLocaleDateString('de-DE') : '—'} />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <MiniMetric label="Mitarbeiter" value={c.employee_count} icon={Users} />
                        <MiniMetric label="Objekte" value={c.property_count} icon={Building2} />
                        <MiniMetric label="Einsätze" value={c.assignment_count} icon={Activity} />
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Mitarbeiter ({c.employee_count})</p>
                        {c.employees.length === 0 ? (
                          <p className="text-sm text-slate-400">Keine Mitarbeiter eingetragen</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {c.employees.map(emp => (
                              <div key={emp.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-100">
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                  {emp.first_name[0]}{emp.last_name[0]}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-800 truncate">{emp.first_name} {emp.last_name}</p>
                                  <p className="text-xs text-slate-400 truncate">{emp.email ?? emp.phone ?? '—'}</p>
                                </div>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md flex-shrink-0 ${emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                  {emp.status === 'active' ? 'Aktiv' : 'Krank'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-1 flex-wrap">
                        <button onClick={() => setBillingTarget(c)} className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-100">
                          <CreditCard size={13} /> Vertrag & Paket
                        </button>
                        <button onClick={() => setDeleteTarget(c)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ${isDeleted ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border border-red-200 text-red-600 hover:bg-red-50'}`}>
                          {isDeleted ? <><RefreshCw size={13} /> Wiederherstellen</> : <><Trash2 size={13} /> Löschen</>}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deleteTarget && <DeleteCompanyModal company={deleteTarget} onClose={() => setDeleteTarget(null)} onDone={onRefresh} token={token} />}
      {billingTarget && <BillingModal company={billingTarget} onClose={() => setBillingTarget(null)} onSaved={onRefresh} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, valueClass }: { icon: typeof Calendar; label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100">
      <p className="text-xs text-slate-400 font-medium mb-0.5 flex items-center gap-1"><Icon size={11} /> {label}</p>
      <p className={`text-sm font-semibold ${valueClass ?? 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><Icon size={14} className="text-slate-500" /></div>
      <div>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ token, companies, currentUserId }: { token?: string; companies: CompanyRow[]; currentUserId?: string }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'employee' | 'admin' | 'orphan'>('all');
  const [resetTarget, setResetTarget] = useState<AuthUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users: fetched } = await callAdminAction('list-users', {}, token);
      setUsers(fetched);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // email -> company (for owner matching)
  const companyByOwnerEmail = useMemo(() => {
    const m = new Map<string, CompanyRow>();
    companies.forEach(c => { if (c.owner_email) m.set(c.owner_email.toLowerCase(), c); });
    return m;
  }, [companies]);

  // auth user_id -> company (for employee matching)
  const companyByEmployeeUserId = useMemo(() => {
    const m = new Map<string, CompanyRow>();
    companies.forEach(c => {
      c.employees.forEach(e => { if (e.user_id) m.set(e.user_id, c); });
    });
    return m;
  }, [companies]);

  // Build owner groups: each owner with their company's employees
  const groups = useMemo(() => {
    const ownerUsers = users.filter(u => u.role === 'owner');
    const employeeUsers = users.filter(u => u.role === 'employee');
    return ownerUsers.map(owner => {
      const company = companyByOwnerEmail.get(owner.email.toLowerCase()) ?? null;
      const empUsers = company
        ? employeeUsers.filter(eu => companyByEmployeeUserId.get(eu.id)?.id === company.id)
        : [];
      return { owner, company, employees: empUsers };
    });
  }, [users, companyByOwnerEmail, companyByEmployeeUserId]);

  const coveredEmployeeIds = useMemo(() => new Set(groups.flatMap(g => g.employees.map(e => e.id))), [groups]);

  const counts = useMemo(() => ({
    all: users.length,
    owner: users.filter(u => u.role === 'owner').length,
    employee: users.filter(u => u.role === 'employee').length,
    admin: users.filter(u => u.role === 'admin').length,
    orphan: users.filter(u => !u.role).length,
  }), [users]);

  const q = search.toLowerCase();

  // Flat filtered list for admin/orphan views
  const flatFiltered = useMemo(() => users.filter(u => {
    if (roleFilter === 'orphan' && u.role) return false;
    if (roleFilter === 'admin' && u.role !== 'admin') return false;
    if (roleFilter !== 'orphan' && roleFilter !== 'admin') return false;
    return !q || u.email.toLowerCase().includes(q);
  }), [users, roleFilter, q]);

  // Filtered groups for owner/employee/all views
  const groupsFiltered = useMemo(() => {
    if (roleFilter === 'admin' || roleFilter === 'orphan') return [];
    return groups
      .filter(g => {
        if (roleFilter === 'owner') return !q || g.owner.email.toLowerCase().includes(q);
        if (roleFilter === 'employee') return g.employees.some(e => !q || e.email.toLowerCase().includes(q));
        return !q || g.owner.email.toLowerCase().includes(q) || g.employees.some(e => e.email.toLowerCase().includes(q));
      })
      .map(g => {
        if (roleFilter === 'owner') return { ...g, employees: [] };
        if (roleFilter === 'employee') return { ...g, employees: g.employees.filter(e => !q || e.email.toLowerCase().includes(q)) };
        return g;
      });
  }, [groups, roleFilter, q]);

  // Ungrouped employees (not matched to any owner's company)
  const ungroupedEmployees = useMemo(() => {
    if (roleFilter === 'admin' || roleFilter === 'orphan' || roleFilter === 'owner') return [];
    return users.filter(u => u.role === 'employee' && !coveredEmployeeIds.has(u.id) && (!q || u.email.toLowerCase().includes(q)));
  }, [users, coveredEmployeeIds, roleFilter, q]);

  const useGrouped = roleFilter !== 'admin' && roleFilter !== 'orphan';
  const visibleCount = useGrouped
    ? groupsFiltered.reduce((s, g) => s + 1 + g.employees.length, 0) + ungroupedEmployees.length
    : flatFiltered.length;

  const renderUserActions = (u: AuthUser) => (
    <div className="flex gap-1.5 flex-shrink-0">
      <button onClick={() => setResetTarget(u)} className="flex items-center gap-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50" title="Passwort ändern">
        <Key size={12} /> PW
      </button>
      <button
        onClick={() => setDeleteTarget(u)}
        className="flex items-center gap-1 text-xs font-semibold bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50"
        title={u.id === currentUserId ? 'Dein eigenes Konto löschen' : 'Konto löschen'}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  const renderRoleBadge = (u: AuthUser) => (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
      u.role === 'admin' ? 'bg-amber-100 text-amber-700' :
      u.role === 'owner' ? 'bg-blue-100 text-blue-700' :
      u.role === 'employee' ? 'bg-emerald-100 text-emerald-700' :
      'bg-slate-100 text-slate-500'
    }`}>{u.role ?? 'ohne Profil'}</span>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="E-Mail suchen…" className="input-field text-sm !pl-9" />
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-700 whitespace-nowrap">
          <Plus size={15} /> Auth-Konto
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'owner', 'employee', 'admin', 'orphan'] as const).map(r => (
          <button key={r} onClick={() => setRoleFilter(r)} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${roleFilter === r ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {{ all: 'Alle', owner: 'Owner', employee: 'Employee', admin: 'Admin', orphan: 'Ohne Profil' }[r]} · {counts[r]}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">{visibleCount} Benutzer</h2>
          <button onClick={load} className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"><RefreshCw size={12} /> Aktualisieren</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /></div>
        ) : visibleCount === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">Keine Benutzer</p>
        ) : useGrouped ? (
          <ul className="divide-y divide-slate-100">
            {groupsFiltered.map(g => (
              <li key={g.owner.id}>
                {/* Owner row */}
                <div className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Crown size={15} className="text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm truncate">{g.owner.email}</p>
                      {renderRoleBadge(g.owner)}
                      {g.owner.user_metadata?.must_change_password === true && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">muss PW ändern</span>}
                      {!g.owner.email_confirmed_at && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">unbestätigt</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {g.company ? `${g.company.name} · ` : ''}
                      Erstellt {new Date(g.owner.created_at).toLocaleDateString('de-DE')} ·
                      {g.owner.last_sign_in_at ? ` Login ${new Date(g.owner.last_sign_in_at).toLocaleDateString('de-DE')}` : ' Nie eingeloggt'}
                    </p>
                  </div>
                  {renderUserActions(g.owner)}
                </div>

                {/* Indented employee rows */}
                {g.employees.map(emp => (
                  <div key={emp.id} className="flex items-center gap-4 hover:bg-slate-50/80 transition-colors border-t border-slate-100 bg-slate-50/40">
                    <div className="w-px self-stretch bg-slate-200 ml-[52px] flex-shrink-0" />
                    <div className="flex items-center gap-4 flex-1 py-3 pr-6 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Users size={12} className="text-emerald-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800 text-sm truncate">{emp.email}</p>
                          {renderRoleBadge(emp)}
                          {emp.user_metadata?.must_change_password === true && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">muss PW ändern</span>}
                          {!emp.email_confirmed_at && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">unbestätigt</span>}
                        </div>
                        <p className="text-xs text-slate-400 truncate">
                          Erstellt {new Date(emp.created_at).toLocaleDateString('de-DE')} ·
                          {emp.last_sign_in_at ? ` Login ${new Date(emp.last_sign_in_at).toLocaleDateString('de-DE')}` : ' Nie eingeloggt'}
                        </p>
                      </div>
                      {renderUserActions(emp)}
                    </div>
                  </div>
                ))}
              </li>
            ))}

            {/* Ungrouped employees */}
            {ungroupedEmployees.map(u => (
              <li key={u.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Mail size={15} className="text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm truncate">{u.email}</p>
                    {renderRoleBadge(u)}
                    {u.user_metadata?.must_change_password === true && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">muss PW ändern</span>}
                    {!u.email_confirmed_at && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">unbestätigt</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    Erstellt {new Date(u.created_at).toLocaleDateString('de-DE')} ·
                    {u.last_sign_in_at ? ` Login ${new Date(u.last_sign_in_at).toLocaleDateString('de-DE')}` : ' Nie eingeloggt'}
                  </p>
                </div>
                {renderUserActions(u)}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-slate-100">
            {flatFiltered.map(u => (
              <li key={u.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Mail size={15} className="text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm truncate">{u.email}</p>
                    {renderRoleBadge(u)}
                    {u.user_metadata?.must_change_password === true && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">muss PW ändern</span>}
                    {!u.email_confirmed_at && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">unbestätigt</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    Erstellt {new Date(u.created_at).toLocaleDateString('de-DE')} ·
                    {u.last_sign_in_at ? ` Login ${new Date(u.last_sign_in_at).toLocaleDateString('de-DE')}` : ' Nie eingeloggt'}
                  </p>
                </div>
                {renderUserActions(u)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} token={token} />}
      {deleteTarget && <DeleteUserModal user={deleteTarget} isSelf={deleteTarget.id === currentUserId} onClose={() => setDeleteTarget(null)} onDone={load} token={token} />}
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={load} token={token} />}
    </div>
  );
}

// ── Database Tab ─────────────────────────────────────────────────────────────
function DatabaseTab() {
  const tables = [
    { name: 'companies', label: 'Unternehmen' },
    { name: 'profiles', label: 'Profile' },
    { name: 'employees', label: 'Mitarbeiter' },
    { name: 'properties', label: 'Objekte' },
    { name: 'assignments', label: 'Einsätze' },
    { name: 'sick_reports', label: 'Krankmeldungen' },
    { name: 'replacement_requests', label: 'Ersatzanfragen' },
    { name: 'employee_properties', label: 'Mitarbeiter-Objekte' },
    { name: 'notifications', label: 'Benachrichtigungen' },
    { name: 'push_subscriptions', label: 'Push Subscriptions' },
    { name: 'checkin_reminders', label: 'Check-in Reminder' },
  ];
  const [selected, setSelected] = useState<string>('companies');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const map: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await supabase.from(t.name).select('*', { count: 'exact', head: true });
        map[t.name] = count ?? 0;
      }
      setCounts(map);
    })();
  }, []);

  const load = useCallback(async (table: string) => {
    setLoading(true);
    const { data } = await supabase.from(table).select('*').limit(200);
    setRows((data as Record<string, unknown>[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(selected); }, [selected, load]);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
      <div className="card p-3 h-fit">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-3 py-2">Tabellen</p>
        {tables.map(t => (
          <button key={t.name} onClick={() => setSelected(t.name)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${selected === t.name ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <span className="font-medium truncate">{t.label}</span>
            <span className={`text-xs font-semibold ${selected === t.name ? 'text-slate-300' : 'text-slate-400'}`}>{counts[t.name] ?? '—'}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">{tables.find(t => t.name === selected)?.label}</h2>
            <p className="text-xs text-slate-400 mt-0.5">public.{selected} · {rows.length} Zeilen (max. 200)</p>
          </div>
          <button onClick={() => load(selected)} className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1"><RefreshCw size={12} /> Neu laden</button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">Keine Daten</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {columns.map(c => <th key={c} className="text-left font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5 whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {columns.map(c => {
                      const v = r[c];
                      const display = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                      return <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[240px] overflow-hidden text-ellipsis" title={display}>{display}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export function AdminDashboard() {
  const { signOut, session } = useAuth();
  const token = session?.access_token;
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'overview' | 'users' | 'database'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminAction('list-dashboard-data', {}, token);
      const companiesData: CompanyRow[] = data.companies ?? [];
      const employees: { id: string; company_id: string; first_name: string; last_name: string; status: string; email: string | null; user_id: string | null; phone: string }[] = data.employees ?? [];
      const properties: { id: string; company_id: string }[] = data.properties ?? [];
      const assignments: { id: string; property_id: string }[] = data.assignments ?? [];

      const propertyToCompany = new Map<string, string>();
      properties.forEach(p => propertyToCompany.set(p.id, p.company_id));

      const rows: CompanyRow[] = companiesData.map(c => {
        const emps = employees.filter(e => e.company_id === c.id);
        const props = properties.filter(p => p.company_id === c.id);
        const asss = assignments.filter(a => propertyToCompany.get(a.property_id) === c.id);
        return { ...c, employee_count: emps.length, property_count: props.length, assignment_count: asss.length, employees: emps };
      });

      setCompanies(rows);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const activeCompanies = companies.filter(c => !c.deleted_at);
  const totalEmployees = activeCompanies.reduce((s, c) => s + c.employee_count, 0);
  const overdueCount = activeCompanies.filter(c => !!c.paid_until && new Date(c.paid_until) < new Date()).length;
  const totalMonthlyRevenue = useMemo(() => (
    activeCompanies.reduce((s, c) => s + calculateMonthlyPrice(c.employee_count), 0)
  ), [activeCompanies]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <img src="/meizoLogoMarkDark.png" alt="Meizo" className="h-7 w-auto" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Admin Cockpit</span>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">Plattform-Steuerung</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="hidden sm:flex items-center gap-1.5 text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-700 transition-colors">
            <Plus size={15} /> Unternehmen
          </button>
          <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors p-2">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 sticky top-[57px] z-10">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {([
            { id: 'overview', label: 'Übersicht', icon: Building2 },
            { id: 'users', label: 'Benutzer & Logins', icon: UserCog },
            { id: 'database', label: 'Datenbank', icon: Database },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <HeroCard icon={Building2} label="Aktive Firmen" value={activeCompanies.length} color="text-blue-600 bg-blue-50" loading={loading} />
              <HeroCard icon={Users} label="Mitarbeiter gesamt" value={totalEmployees} color="text-emerald-600 bg-emerald-50" loading={loading} />
              <HeroCard icon={ShieldCheck} label="MRR (geschätzt)" value={`${totalMonthlyRevenue} EUR`} color="text-slate-600 bg-slate-100" loading={loading} />
              <HeroCard icon={AlertTriangle} label="Überfällig" value={overdueCount} color={overdueCount > 0 ? 'text-red-600 bg-red-50' : 'text-slate-400 bg-slate-50'} loading={loading} />
            </div>

            <CompaniesTab companies={companies} loading={loading} token={token} onRefresh={load} />
          </>
        )}

        {tab === 'users' && <UsersTab token={token} companies={companies} currentUserId={session?.user?.id} />}
        {tab === 'database' && <DatabaseTab />}
      </main>

      {showCreate && <CreateOwnerModal token={token} onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function HeroCard({ icon: Icon, label, value, color, loading }: { icon: typeof Building2; label: string; value: number | string; color: string; loading: boolean }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-slate-900 truncate">{loading ? '–' : value}</p>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
      </div>
    </div>
  );
}
