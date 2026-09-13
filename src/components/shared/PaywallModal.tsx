import { useState, useEffect } from 'react';
import { Check, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BASE_FEE_EUR, PER_EMPLOYEE_EUR, calculateMonthlyPrice } from '../../lib/plans';
import { Modal } from './Modal';

interface Props {
  companyId: string;
}

const FEATURES = [
  'Alle Funktionen inklusive — keine Pakete, keine Sperren',
  'GPS-Check-in mit Foto-Nachweis',
  'Smart-Ersatz-Dispatch bei Krankmeldung',
  'Abrechnung, Zeitstempel, DATEV-Export',
  'Mehrsprachige Mitarbeiter-App (8 Sprachen)',
];

export function PaywallModal({ companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      .then(({ count }) => setEmployeeCount(count ?? 0));
  }, [companyId]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ company_id: companyId, employee_count: employeeCount ?? 1 }),
        }
      );
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } catch {
      // silently reset on network error
    }
    setLoading(false);
  };

  const price = employeeCount != null ? calculateMonthlyPrice(employeeCount) : null;

  return (
    // Bewusst nicht schliessbar (dismissible=false): die Testphase ist
    // abgelaufen, der Owner muss zahlen oder sich abmelden. Vorher hatte
    // dieser Dialog ausserdem keinen Fokus-Fang/role=dialog wie der Rest der
    // App — Tab konnte auf die verdeckte Seite dahinter springen.
    <Modal open dismissible={false} width="max-w-sm" ariaLabel="Deine Testphase ist abgelaufen">
      <div className="px-6 py-8">
        <div className="text-center mb-6">
          <img src="/meizoLogoMarkDark.png" alt="meizo" className="h-8 w-auto mx-auto mb-5" />
          <h2 className="text-xl font-bold text-slate-900">Deine Testphase ist abgelaufen.</h2>
          <p className="text-slate-500 text-sm mt-2">Ein Preis, alle Funktionen — kein Paket zum Auswählen.</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Users size={12} /> {employeeCount ?? '…'} Mitarbeiter
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {price != null ? `${price}€` : '…'}<span className="text-sm font-medium text-slate-400">/Monat</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">{BASE_FEE_EUR}€ Grundgebühr + {PER_EMPLOYEE_EUR}€ pro Mitarbeiter</p>
        </div>

        <ul className="space-y-2.5 mb-6">
          {FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2.5">
              <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Check size={10} className="text-green-600" strokeWidth={3} />
              </span>
              <span className="text-sm text-slate-600">{f}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleStart}
          disabled={loading || employeeCount == null}
          className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Jetzt starten'
          )}
        </button>

        <div className="mt-5 text-center">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Abmelden
          </button>
        </div>
      </div>
    </Modal>
  );
}
