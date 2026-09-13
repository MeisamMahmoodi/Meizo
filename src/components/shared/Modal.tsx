import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  width?: string;
  /** Screenreader-Name für den Dialog, falls der Inhalt keine passende Überschrift liefert. */
  ariaLabel?: string;
  /** false für Dialoge, die absichtlich nicht schließbar sind (z.B. Paywall
   * nach Testphase-Ende) — dann kein Escape, kein Backdrop-Klick, kein
   * X-Button. Default true. */
  dismissible?: boolean;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Basis-Dialog für die ganze App. War vorher ohne jede Dialog-Barrierefreiheit:
// kein Fokus-Fang (Tab konnte hinter den Dialog auf die verdeckte Seite
// springen) und kein role/aria-modal, wodurch Screenreader das Öffnen gar
// nicht mitbekamen. Betrifft dadurch jedes Formular- und Lösch-Fenster in der
// App auf einen Schlag.
export function Modal({ open, onClose, children, width = 'max-w-lg', ariaLabel, dismissible = true }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      previouslyFocused.current = document.activeElement as HTMLElement | null;

      // Fokus in den Dialog holen — sonst bleibt er auf dem Button dahinter,
      // und Screenreader-Nutzer merken gar nicht, dass sich etwas geöffnet hat.
      const focusTimer = window.setTimeout(() => {
        const focusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (focusable ?? dialogRef.current)?.focus();
      }, 0);

      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { if (dismissible) onClose?.(); return; }
        if (e.key !== 'Tab' || !dialogRef.current) return;
        // Fokus-Falle: Tab darf den Dialog nicht verlassen, solange er offen ist.
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
          .filter(el => !el.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      };
      document.addEventListener('keydown', handler);
      return () => {
        document.removeEventListener('keydown', handler);
        window.clearTimeout(focusTimer);
        // Fokus zurück auf das Element, das den Dialog geöffnet hat.
        previouslyFocused.current?.focus?.();
      };
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative bg-white rounded-2xl shadow-modal ${width} w-full max-h-[85vh] overflow-y-auto animate-scale-in outline-none`}
      >
        {dismissible && (
          <button onClick={onClose} aria-label="Schließen" className="absolute top-4 right-4 p-2 rounded-xl text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-all z-10">
            <X size={18} />
          </button>
        )}
        <div className={dismissible ? 'pr-12' : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
