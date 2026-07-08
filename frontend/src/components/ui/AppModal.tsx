"use client";

import { useEffect, useRef } from "react";

export type ModalType = "success" | "warning" | "error" | "info";

export interface AppModalProps {
  open: boolean;
  type: ModalType;
  title: string;
  message: string;
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  closeOnEsc?: boolean;
}

const TYPE_CONFIG: Record<ModalType, { icon: string; accent: string; border: string; iconBg: string }> = {
  success: { icon: "✓", accent: "text-court-green",  border: "border-court-green",  iconBg: "bg-court-green/10"  },
  warning: { icon: "⚠", accent: "text-yellow-400",   border: "border-yellow-500",   iconBg: "bg-yellow-400/10"   },
  error:   { icon: "✕", accent: "text-red-400",       border: "border-red-600",      iconBg: "bg-red-500/10"      },
  info:    { icon: "i", accent: "text-blue-400",       border: "border-blue-500",     iconBg: "bg-blue-400/10"     },
};

export function AppModal({
  open, type, title, message, details,
  confirmText = "OK", cancelText, onConfirm, onCancel, closeOnEsc = true,
}: AppModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const config = TYPE_CONFIG[type];

  useEffect(() => { if (open) confirmRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") (onCancel ?? onConfirm)(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeOnEsc, onCancel, onConfirm]);

  useEffect(() => {
    if (!open) return;
    const modal = document.getElementById("fhds-app-modal");
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="fhds-modal-title">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.15s_ease]" onClick={onCancel ?? onConfirm} aria-hidden="true" />
      <div id="fhds-app-modal" className={`relative card w-full max-w-md border-2 ${config.border} p-6 shadow-2xl animate-[modalIn_0.2s_cubic-bezier(0.34,1.56,0.64,1)]`}>
        <div className="flex items-start gap-4 mb-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center font-bold text-lg ${config.accent}`} aria-hidden="true">
            {config.icon}
          </div>
          <div>
            <h2 id="fhds-modal-title" className={`font-bold text-lg leading-tight ${config.accent}`}>{title}</h2>
            <p className="text-sm text-gray-300 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        {details && details.length > 0 && (
          <ul className="mb-4 space-y-1 text-xs text-gray-400 bg-[#0b0f14] rounded-lg p-3">
            {details.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 ${config.accent}`}>›</span><span>{d}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-3 mt-2">
          {cancelText && onCancel && (
            <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold hover:bg-[#2a3441] transition-colors">{cancelText}</button>
          )}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors
              ${type === "error" ? "bg-red-600 hover:bg-red-700"
                : type === "warning" ? "bg-yellow-600 hover:bg-yellow-700"
                : type === "success" ? "bg-court-green hover:opacity-90"
                : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
