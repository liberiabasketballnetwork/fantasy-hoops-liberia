"use client";

export interface LoadingOverlayProps {
  visible: boolean;
  title?: string;
  message?: string;
}

export function LoadingOverlay({ visible, title = "Processing...", message = "Please wait." }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease]" role="status" aria-live="polite" aria-label={title}>
      <div className="card p-8 flex flex-col items-center gap-5 max-w-xs w-full text-center border-[#1f2733]">
        <div className="w-12 h-12 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" aria-hidden="true" />
        <div>
          <p className="font-bold text-base">{title}</p>
          {message && <p className="text-sm text-gray-400 mt-1">{message}</p>}
        </div>
      </div>
    </div>
  );
}
