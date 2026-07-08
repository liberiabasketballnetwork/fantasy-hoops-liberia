"use client";

import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  loadingText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message,
  confirmText = "Confirm", cancelText = "Cancel",
  danger = true, loading = false, loadingText = "Processing...",
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) cancelRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="alertdialog" aria-modal="true" aria-labelledby="fhds-confirm-title" aria-describedby="fhds-confirm-msg">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.15s_ease]" onClick={loading ? undefined : onCancel} aria-hidden="true" />
      <div className={`relative card w-full max-w-sm p-6 shadow-2xl border-2 ${danger ? "border-red-700" : "border-[#1f2733]"} animate-[modalIn_0.2s_cubic-bezier(0.34,1.56,0.64,1)]`}>
        {danger ? (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-400 text-xl" aria-hidden="true">⚠</span>
            <h2 id="fhds-confirm-title" className="font-bold text-red-400 text-base">{title}</h2>
          </div>
        ) : (
          <h2 id="fhds-confirm-title" className="font-bold text-base mb-3">{title}</h2>
        )}
        <p id="fhds-confirm-msg" className="text-sm text-gray-300 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button ref={cancelRef} onClick={onCancel} disabled={loading} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold hover:bg-[#2a3441] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{cancelText}</button>
          <button onClick={onConfirm} disabled={loading} className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${danger ? "bg-red-700 hover:bg-red-600" : "bg-court-orange hover:opacity-90"}`}>
            {loading ? loadingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
