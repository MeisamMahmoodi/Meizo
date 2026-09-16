import { useState } from 'react';
import { Sidebar } from './Sidebar';
import type { Company } from '../../lib/types';

interface OwnerLayoutProps {
  company: Company;
  children: (props: { company: Company; refreshKey: number; onRefresh: () => void; onNavigate: (page: string) => void }) => React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  // Laedt company in App.tsx neu (einzige Quelle der Wahrheit). Vorher hat
  // onRefresh nur refreshKey erhoeht, wodurch Unterseiten neu geladen wurden,
  // aber das company-Objekt selbst (Firmenname, DATEV-Angaben etc.) auf dem
  // Stand vom Login stehen blieb, bis die Seite komplett neu geladen wurde.
  onCompanyRefresh: () => Promise<void>;
}

export function OwnerLayout({ company, children, activePage, onNavigate, onCompanyRefresh }: OwnerLayoutProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => {
    setRefreshKey(k => k + 1);
    onCompanyRefresh();
  };

  return (
    <div className="min-h-screen bg-[#F0F1F3]">
      <Sidebar active={activePage} onNavigate={onNavigate} ownerName={company.owner_name} />
      {/* Der Top-Abstand kam vorher aus einem inline style, das *immer*
          galt (fuer den fixen Mobile-Header + Notch gedacht) — die Klasse
          lg:pt-0 daneben sollte das am Desktop zuruecksetzen, konnte es
          aber nie, weil ein inline style jede Klasse schlaegt. Jede
          Owner-Seite stand dadurch am Desktop zu dicht am Fensterrand.
          Jetzt steuert eine reine pt-Klasse das Ganze, damit lg: den
          mobilen Wert sauber ueberschreiben kann und der Desktop-Wert
          spuerbar mehr Luft bekommt. */}
      <main className="lg:ml-60 px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 pt-[calc(3.5rem+max(0px,env(safe-area-inset-top)))] lg:pt-10">
        {children({ company, refreshKey, onRefresh, onNavigate })}
      </main>
    </div>
  );
}
