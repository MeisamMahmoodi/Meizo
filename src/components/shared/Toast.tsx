import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { CheckCircle, X, AlertCircle } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastContextType {
  addToast: (message: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // useCallback: ohne stabile Referenz bekommt jeder Consumer, der addToast
  // in einer useEffect-Abhaengigkeitsliste hat, bei JEDEM ToastProvider-
  // Rerender (z.B. weil gerade ein Toast hinzugefuegt wurde) eine "neue"
  // Funktion und feuert den Effekt erneut — das erzeugt bei einem einzelnen
  // andauernden Fehlerzustand (z.B. fehlender VAPID-Key) eine Endlosschleife
  // aus immer neuen Toasts, die den ganzen Bildschirm zuspammen.
  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* aria-live: Toasts waren bisher rein visuell - Screenreader-Nutzer
          bekamen Erfolgs-/Fehlermeldungen gar nicht mit. */}
      <div aria-live="polite" aria-atomic="false" className="fixed top-5 right-5 z-[100] flex flex-col gap-2.5">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl shadow-elevated text-sm font-medium animate-slide-in backdrop-blur-sm ${
        toast.type === 'success'
          ? 'bg-brand-50/95 text-brand-700 border border-brand-200/60'
          : 'bg-danger-50/95 text-danger-600 border border-danger-200/60'
      }`}
    >
      {toast.type === 'success' && <CheckCircle size={16} className="text-brand-500 shrink-0" />}
      {toast.type === 'error' && <AlertCircle size={16} className="text-danger-500 shrink-0" />}
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} aria-label="Meldung schließen" className="p-1 rounded-lg opacity-40 hover:opacity-100 transition-opacity shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}
