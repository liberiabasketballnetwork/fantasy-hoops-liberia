"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastType = "success" | "warning" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

const TYPE_CONFIG: Record<
  ToastType,
  { icon: string; bg: string; border: string; text: string }
> = {
  success: {
    icon: "✓",
    bg: "bg-[#121821]",
    border: "border-court-green",
    text: "text-court-green",
  },
  warning: {
    icon: "⚠",
    bg: "bg-[#121821]",
    border: "border-yellow-500",
    text: "text-yellow-400",
  },
  error: {
    icon: "✕",
    bg: "bg-[#121821]",
    border: "border-red-600",
    text: "text-red-400",
  },
  info: {
    icon: "i",
    bg: "bg-[#121821]",
    border: "border-blue-500",
    text: "text-blue-400",
  },
};

// Single toast item component.
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = TYPE_CONFIG[toast.type];
  const duration = toast.duration ?? 4000;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-3 w-full max-w-sm px-4 py-3 rounded-xl shadow-lg
        border ${config.border} ${config.bg}
        animate-[toastIn_0.25s_cubic-bezier(0.34,1.56,0.64,1)]`}
    >
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
          text-xs font-bold ${config.text} bg-[#0b0f14] border ${config.border}`}
        aria-hidden="true"
      >
        {config.icon}
      </span>
      <p className="text-sm text-gray-200 flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors text-xs mt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

// The container that renders all active toasts.
export function ToastContainer({ toasts, onDismiss }: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Hook for managing toasts — import and use in any page/layout.
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const id = `toast-${Date.now()}-${counterRef.current++}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    []
  );

  return { toasts, toast, dismiss };
}
