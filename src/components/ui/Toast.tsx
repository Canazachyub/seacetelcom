import { useEffect, type ReactElement } from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { clsx } from 'clsx';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
}

interface ToastStore {
  items: ToastItem[];
  push: (variant: ToastVariant, message: string, duration?: number) => string;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (variant, message, duration = 4000) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ items: [...s.items, { id, variant, message, duration }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

// API pública
export const toast = {
  success: (msg: string, duration?: number) =>
    useToastStore.getState().push('success', msg, duration),
  error: (msg: string, duration?: number) =>
    useToastStore.getState().push('error', msg, duration ?? 6000),
  warning: (msg: string, duration?: number) =>
    useToastStore.getState().push('warning', msg, duration),
  info: (msg: string, duration?: number) =>
    useToastStore.getState().push('info', msg, duration),
};

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; icon: ReactElement }> = {
  success: {
    bg: 'bg-emerald-50 text-emerald-900',
    border: 'border-emerald-300',
    icon: <CheckCircle2 size={18} className="text-emerald-600" />,
  },
  error: {
    bg: 'bg-red-50 text-red-900',
    border: 'border-red-300',
    icon: <XCircle size={18} className="text-red-600" />,
  },
  warning: {
    bg: 'bg-amber-50 text-amber-900',
    border: 'border-amber-300',
    icon: <AlertTriangle size={18} className="text-amber-600" />,
  },
  info: {
    bg: 'bg-blue-50 text-blue-900',
    border: 'border-blue-300',
    icon: <Info size={18} className="text-blue-600" />,
  },
};

function ToastItemRender({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const id = setTimeout(onClose, item.duration);
    return () => clearTimeout(id);
  }, [item.duration, onClose]);

  const s = VARIANT_STYLES[item.variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex items-start gap-3 min-w-[280px] max-w-[420px] px-4 py-3 rounded-lg shadow-lg border',
        'animate-in slide-in-from-right fade-in duration-200',
        s.bg,
        s.border
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{s.icon}</div>
      <p className="flex-1 text-sm leading-relaxed">{item.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-0.5 rounded hover:bg-black/5 transition"
        aria-label="Cerrar notificación"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-label="Notificaciones"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItemRender item={item} onClose={() => dismiss(item.id)} />
        </div>
      ))}
    </div>
  );
}
