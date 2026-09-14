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
      <main className="lg:ml-60 lg:pt-0 p-4 sm:p-6 lg:p-8" style={{ paddingTop: 'calc(3.5rem + max(0, env(safe-area-inset-top)))' }}>
        {children({ company, refreshKey, onRefresh, onNavigate })}
      </main>
    </div>
  );
}
