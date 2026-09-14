import { Home, Clock, Settings } from 'lucide-react';
import { useLang } from '../../hooks/useLang';

export type EmployeeTab = 'home' | 'hours' | 'settings';

interface BottomTabBarProps {
  active: EmployeeTab;
  onChange: (tab: EmployeeTab) => void;
}

// Persistentes Grundgerüst der Mitarbeiter-App (Start / Stunden /
// Einstellungen). Wird ausgeblendet, solange ein fokussierter Vollbild-Ablauf
// laeuft (z.B. Krankmeldung), da das kein vierter Tab ist, sondern ein
// Teilschritt von "Start".
export function BottomTabBar({ active, onChange }: BottomTabBarProps) {
  const { t, rtl } = useLang();

  const tabs: { id: EmployeeTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t('tabHome'), icon: Home },
    { id: 'hours', label: t('tabHours'), icon: Clock },
    { id: 'settings', label: t('tabSettings'), icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-surface-200"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <div className="max-w-md mx-auto grid grid-cols-3">
        {tabs.map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 pt-2.5 pb-1.5 transition-colors ${
                isActive ? 'text-brand-600' : 'text-ink-300 hover:text-ink-500'
              }`}
            >
              <tab.icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
