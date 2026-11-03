import React, { createContext, useContext } from 'react';
import { ToastItem, ToastKind, Toasts, useToasts } from '../components/Toasts';

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toasts, pushToast, dismissToast } = useToasts();

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
