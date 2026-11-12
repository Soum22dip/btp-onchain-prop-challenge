'use client';

import { useToastStore, type ToastType } from '@/store/toast';

const ICON_MAP: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const COLOR_MAP: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'bg-[#22C55E]/10',
    border: 'border-[#22C55E]/20',
    text: 'text-white',
    icon: 'text-[#22C55E]',
  },
  error: {
    bg: 'bg-[#EF4444]/10',
    border: 'border-[#EF4444]/20',
    text: 'text-white',
    icon: 'text-[#EF4444]',
  },
  info: {
    bg: 'bg-[#7C3AED]/10',
    border: 'border-[#7C3AED]/20',
    text: 'text-white',
    icon: 'text-[#7C3AED]',
  },
  warning: {
    bg: 'bg-[#F59E0B]/10',
    border: 'border-[#F59E0B]/20',
    text: 'text-white',
    icon: 'text-[#F59E0B]',
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const colors = COLOR_MAP[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg border backdrop-blur-xl shadow-xl animate-slide-in-right ${colors.bg} ${colors.border}`}
            style={{
              animation: 'slideInRight 0.25s ease-out',
              minWidth: '220px',
              maxWidth: '360px',
            }}
          >
            {/* Type icon */}
            <span className={`text-sm font-bold ${colors.icon} flex-shrink-0`}>
              {ICON_MAP[toast.type]}
            </span>

            {/* Message */}
            <span className={`text-[12px] font-medium ${colors.text} flex-1 leading-snug`}>
              {toast.message}
            </span>

            {/* Close */}
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0 ml-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
