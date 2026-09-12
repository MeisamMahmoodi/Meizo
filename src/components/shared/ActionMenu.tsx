import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import type { ComponentType } from 'react';
import { MoreVertical } from 'lucide-react';

interface ActionMenuIconProps {
  size?: string | number;
  className?: string;
}

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: ComponentType<ActionMenuIconProps>;
  tone?: 'default' | 'danger' | 'success' | 'info';
  /** Zieht eine dünne Trennlinie über diesem Eintrag — z. B. vor "Löschen". */
  dividerBefore?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bevorzugte Ausrichtung, solange genug Platz da ist (Standard: rechtsbündig). */
  align?: 'left' | 'right';
}

const toneClasses: Record<NonNullable<ActionMenuItem['tone']>, string> = {
  default: 'text-[#0F172A] hover:bg-[#F8FAFC]',
  danger: 'text-[#EF4444] hover:bg-[#FEF2F2]',
  success: 'text-[#16A34A] hover:bg-[#F0FDF4]',
  info: 'text-[#2563EB] hover:bg-[#EFF6FF]',
};

// Gemeinsames "..."-Aktionsmenü für Karten/Tabellenzeilen (Mitarbeiter, Objekte, ...).
// Ersetzt die vorher pro Seite duplizierte Version — inklusive der Klick-
// außerhalb-schließt-Logik, die es vorher zweimal, leicht unterschiedlich,
// gab (data-menu-Attribut in Employees.tsx vs. ref in Properties.tsx).
//
// Neu gegenüber den alten Versionen: das Menü erkennt selbst, wenn es unten
// oder seitlich am Bildschirmrand keinen Platz mehr hat, und klappt dann
// automatisch nach oben bzw. zur anderen Seite auf, statt abgeschnitten zu
// werden (z. B. bei den letzten Karten einer langen Liste).
export function ActionMenu({ items, isOpen, onOpenChange, align = 'right' }: ActionMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ vertical: 'down' | 'up'; horizontal: 'left' | 'right' }>({
    vertical: 'down',
    horizontal: align,
  });

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onOpenChange(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onOpenChange]);

  // Läuft synchron vor dem nächsten Bildschirm-Update — dadurch sieht man
  // nie kurz die falsche Position aufblitzen, bevor auf "oben"/"links"
  // umgeschaltet wird.
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current || !menuRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const margin = 8;

    const fitsBelow = containerRect.bottom + menuRect.height + margin <= window.innerHeight;
    const fitsAbove = containerRect.top - menuRect.height - margin >= 0;
    const vertical = !fitsBelow && fitsAbove ? 'up' : 'down';

    let horizontal = align;
    if (align === 'right' && containerRect.right - menuRect.width < margin) horizontal = 'left';
    if (align === 'left' && containerRect.left + menuRect.width > window.innerWidth - margin) horizontal = 'right';

    setPlacement({ vertical, horizontal });
  }, [isOpen, align]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors"
      >
        <MoreVertical size={16} className="text-[#94A3B8]" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute ${placement.horizontal === 'right' ? 'right-0' : 'left-0'} ${placement.vertical === 'down' ? 'top-9' : 'bottom-9'} bg-white rounded-xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08),0_4px_6px_-4px_rgba(0,0,0,0.04)] border border-[#E2E8F0]/60 py-1.5 z-20 min-w-[180px] animate-scale-in`}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.dividerBefore && <div className="mx-3 my-1 h-px bg-[#F1F5F9]" />}
              <button
                type="button"
                onClick={item.onClick}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${toneClasses[item.tone ?? 'default']}`}
              >
                {item.icon && <item.icon size={14} className={item.tone ? undefined : 'text-[#94A3B8]'} />} {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
