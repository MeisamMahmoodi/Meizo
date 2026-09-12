import { ArrowUpDown, ChevronDown } from 'lucide-react';

interface SortOption {
  value: string;
  label: string;
}

interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SortOption[];
}

// Kleines, wiederverwendbares Sortier-Dropdown — gleiche Optik/Verhalten
// überall, wo eine Liste sortierbar sein soll (Mitarbeiter, Objekte, ...),
// statt es pro Seite einzeln nachzubauen.
export function SortSelect({ value, onChange, options }: SortSelectProps) {
  return (
    <div className="relative inline-flex items-center shrink-0">
      <ArrowUpDown size={13} className="absolute left-3.5 text-[#94A3B8] pointer-events-none" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="Sortieren nach"
        className="appearance-none pl-9 pr-8 py-2 rounded-xl text-sm font-medium bg-white border border-[#E2E8F0]/60 text-[#64748B] hover:bg-[#F8FAFC] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#22C55E]/20"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-3 text-[#94A3B8] pointer-events-none" />
    </div>
  );
}
