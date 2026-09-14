import { Clock } from 'lucide-react';
import { useLang } from '../../hooks/useLang';

// Stunden-Tab der Mitarbeiter-App. Platzhalter fuer jetzt — naechster
// Schritt laut Plan ist die Uebersicht "bereits gearbeitete Stunden" (Daten
// existieren schon, hier kommt nur noch die Ansicht rein).
export function EmployeeHours() {
  const { t, rtl } = useLang();

  return (
    <div className={`min-h-screen bg-surface-50 px-5 sm:px-6 pt-12 pb-24 max-w-md mx-auto ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-ink-900 tracking-tight mb-6">{t('tabHours')}</h1>
      <div className="card p-8 text-center">
        <Clock size={28} className="text-ink-300 mx-auto mb-3" />
        <p className="text-sm text-ink-500">{t('hoursComingSoon')}</p>
      </div>
    </div>
  );
}
