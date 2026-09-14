import { useState } from 'react';
import { LayoutDashboard, Users, Building2, Settings, LogOut, Menu, X, CalendarDays, Wallet, Timer, FileText, Shield, TrendingUp } from 'lucide-react';
import { Avatar } from '../shared/Avatar';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../shared/Modal';

interface SidebarProps {
  active: string;
  onNavigate: (page: string) => void;
  ownerName: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

// Alle Funktionen sind für jede Firma freigeschaltet — Preis skaliert mit
// der Mitarbeiterzahl statt mit einem Funktions-Plan (siehe lib/plans.ts).
const navItems: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'employees',   label: 'Mitarbeiter',  icon: Users },
  { id: 'properties',  label: 'Objekte',      icon: Building2 },
  { id: 'assignments', label: 'Einsätze',     icon: CalendarDays },
  { id: 'payroll',     label: 'Abrechnung',   icon: Wallet },
  { id: 'controlling', label: 'Controlling',  icon: TrendingUp },
  { id: 'timestamps',  label: 'Zeitstempel',  icon: Timer },
  { id: 'settings',    label: 'Einstellungen',icon: Settings },
];

// Helle Sidebar (monochrom: Weiß/Grau, Farbe nur als echtes Signal) statt
// der frueheren dunklen Navy-Leiste - zusammen mit dem grauen Canvas in
// OwnerLayout die eigentliche Design-Umstellung, nicht nur Kosmetik an
// einzelnen Farbwerten.
export function Sidebar({ active, onNavigate, ownerName }: SidebarProps) {
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const handleNav = (item: NavItem) => {
    onNavigate(item.id);
    setMobileOpen(false);
  };

  const handleLogout = async () => {
    setLogoutConfirm(false);
    await signOut();
  };

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <img src="/meizoLogoMarkDark.png" alt="meizo" className="h-8 w-auto" />
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg text-ink-300 hover:text-ink-900 hover:bg-surface-100 transition-all">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="mx-5 h-px bg-ink-100" />

      {/* Navigation */}
      <nav className="flex-1 mt-4 px-3">
        {navItems.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item)}
              className={`w-full flex items-center gap-2.5 pl-2 pr-3 py-2 rounded-2xl text-[13px] font-medium transition-all duration-200 mb-1 ${
                isActive
                  ? 'bg-surface-100 text-ink-900'
                  : 'text-ink-500 hover:text-ink-900 hover:bg-surface-50'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 transition-colors duration-200 ${
                  isActive ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12)]' : ''
                }`}
              >
                <item.icon
                  size={17}
                  strokeWidth={isActive ? 2 : 1.5}
                  className={isActive ? 'text-ink-900' : ''}
                />
              </div>
              <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-5 h-px bg-ink-100" />

      {/* Legal links */}
      <div className="px-4 pt-3 pb-1 flex gap-1">
        <button
          onClick={() => { onNavigate('impressum'); setMobileOpen(false); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
            active === 'impressum' ? 'text-ink-900 bg-surface-100' : 'text-ink-300 hover:text-ink-500 hover:bg-surface-50'
          }`}
        >
          <FileText size={11} />
          Impressum
        </button>
        <button
          onClick={() => { onNavigate('datenschutz'); setMobileOpen(false); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
            active === 'datenschutz' ? 'text-ink-900 bg-surface-100' : 'text-ink-300 hover:text-ink-500 hover:bg-surface-50'
          }`}
        >
          <Shield size={11} />
          Datenschutz
        </button>
      </div>

      <div className="mx-5 h-px bg-ink-100" />

      {/* User */}
      <div className="px-4 pt-6 pb-5">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar firstName={ownerName?.split(' ')[0] || 'O'} lastName={ownerName?.split(' ')[1] || ''} id="owner" size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-ink-900 text-sm font-medium truncate leading-tight">{ownerName || 'Inhaber'}</p>
            <p className="text-ink-300 text-[11px] font-medium mt-0.5">Inhaber</p>
          </div>
          <button onClick={() => setLogoutConfirm(true)} className="p-1.5 rounded-lg text-ink-300 hover:text-ink-700 hover:bg-surface-100 transition-all" title="Abmelden">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm flex items-center px-4 z-40 border-b border-ink-100" style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))', paddingBottom: '0.875rem' }}>
        <button onClick={() => setMobileOpen(true)} className="text-ink-500 hover:text-ink-900 p-1.5 rounded-lg transition-colors mr-3">
          <Menu size={22} />
        </button>
        <img src="/meizoLogoMarkDark.png" alt="meizo" className="h-6 w-auto" />
      </div>

      {/* Mobile Drawer */}
      <div className={`lg:hidden fixed inset-0 z-50 transition-all duration-300 ${mobileOpen ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMobileOpen(false)} />
        <aside className={`absolute left-0 top-0 bottom-0 w-72 bg-white flex flex-col transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {sidebarContent}
        </aside>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-ink-100 flex-col z-40">
        {sidebarContent}
      </aside>

      {/* Logout Confirmation */}
      <Modal open={logoutConfirm} onClose={() => setLogoutConfirm(false)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-danger-50 flex items-center justify-center mb-5">
            <LogOut size={22} className="text-danger-500" />
          </div>
          <h2 className="text-lg font-bold text-ink-900 mb-2">Wirklich abmelden?</h2>
          <p className="text-sm text-ink-500 leading-relaxed mb-8">Du wirst ausgeloggt und musst dich erneut anmelden.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setLogoutConfirm(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleLogout} className="btn-danger">Abmelden</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
