import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, toasts, dismissToast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => {
          let borderLeft = 'border-l-2 border-l-border';
          let icon = <Info className="w-4 h-4 text-muted-foreground shrink-0" />;

          if (toast.type === 'success') {
            borderLeft = 'border-l-2 border-l-[var(--verdict-held)]';
            icon = <CheckCircle2 className="w-4 h-4 text-[var(--verdict-held)] shrink-0" />;
          } else if (toast.type === 'error') {
            borderLeft = 'border-l-2 border-l-[var(--verdict-violated)]';
            icon = <AlertCircle className="w-4 h-4 text-[var(--verdict-violated)] shrink-0" />;
          } else if (toast.type === 'warning') {
            borderLeft = 'border-l-2 border-l-[var(--sev-high)]';
            icon = <AlertTriangle className="w-4 h-4 text-[var(--sev-high)] shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-md bg-card border border-border text-foreground shadow-sm transition-opacity duration-150 ${borderLeft}`}
              role="alert"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {icon}
                <span className="text-sm font-medium tracking-normal break-words">{toast.message}</span>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                aria-label="Dismiss toast"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
