import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastKind = 'error' | 'info' | 'success';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = idRef.current++;
      setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  return { toasts, pushToast, dismissToast };
}

const KIND_STYLES: Record<
  ToastKind,
  { container: string; icon: React.ReactNode }
> = {
  error: {
    container: 'bg-rose-950/95 border-rose-700/70 text-rose-100',
    icon: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />,
  },
  info: {
    container: 'bg-zinc-900/95 border-zinc-700/70 text-zinc-200',
    icon: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
  },
  success: {
    container: 'bg-emerald-950/95 border-emerald-700/70 text-emerald-100',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  },
};

export const Toasts: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}> = ({ toasts, onDismiss }) => (
  <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-xs pointer-events-none">
    {toasts.map((t) => {
      const style = KIND_STYLES[t.kind];
      return (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-lg border shadow-2xl text-xs ${style.container}`}
          role="status"
        >
          {style.icon}
          <span className="flex-1 leading-relaxed break-words">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    })}
  </div>
);
