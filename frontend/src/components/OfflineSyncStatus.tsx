"use client";

import { useState, useEffect } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import * as Q from "@/lib/offlineQueue";

// ─── Human-readable action descriptions ──────────────────────────────────────

function describeAction(op: Q.QueueOperation): string {
  switch (op.action) {
    case "WATCHLIST_ADD":       return "Added player to watchlist";
    case "WATCHLIST_REMOVE":    return "Removed player from watchlist";
    case "NOTIFICATION_READ":   return "Marked notification as read";
    case "NOTIFICATION_READ_ALL": return "Marked all notifications as read";
    case "NOTIFICATION_ARCHIVE": return "Archived notification";
    case "PUSH_PREFERENCES":    return "Saved notification preferences";
    case "DISPLAY_NAME_CHANGE": {
      const name = (op.payload as any)?.display_name;
      return name ? `Display name → "${name}"` : "Updated display name";
    }
    default: return op.action;
  }
}

// ─── Status pill config ───────────────────────────────────────────────────────

type SyncStatus = "idle" | "syncing" | "synced" | "failed";

const PILL: Record<SyncStatus, { label: string; cls: string } | null> = {
  idle:    null,
  syncing: { label: "⟳ Syncing...",      cls: "bg-[#1f2733] text-gray-300 border border-[#2a3441]" },
  synced:  { label: "✓ Synced",          cls: "bg-court-green/15 text-court-green border border-court-green/30" },
  failed:  { label: "⚠ Changes pending", cls: "bg-yellow-500/15 text-yellow-400 border border-yellow-600/30" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OfflineSyncStatus() {
  const { syncStatus, pendingCount, triggerSync } = useOfflineSync();
  const [open,   setOpen]   = useState(false);
  const [ops,    setOps]    = useState<Q.QueueOperation[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Refresh operation list when panel opens or status changes
  useEffect(() => {
    if (open || syncStatus !== "idle") {
      Q.getAll().then((all) => {
        setOps(all.filter((o) => o.status !== "done"));
        if (syncStatus === "synced") setLastSync(new Date().toLocaleTimeString());
      });
    }
  }, [open, syncStatus]);

  async function cancelFailed(id: string) {
    await Q.remove(id);
    setOps((prev) => prev.filter((o) => o.id !== id));
  }

  async function retryAll() {
    // Reset permanent_failure → pending so they'll be retried
    for (const op of ops.filter((o) => o.status === "failed" || o.status === "permanent_failure")) {
      await Q.update(op.id, { status: "pending", attempts: 0, error: null });
    }
    setOpen(false);
    triggerSync();
  }

  const pill = PILL[syncStatus];

  // Show pill when there are pending ops OR sync is in progress/done/failed
  const showPill = pendingCount > 0 || syncStatus === "syncing" || syncStatus === "synced" || syncStatus === "failed";

  if (!showPill) return null;

  return (
    <>
      {/* Status pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-16 right-4 z-40 px-3 py-1.5 rounded-full text-xs font-semibold
                    shadow-lg flex items-center gap-1.5 transition-all
                    ${pill?.cls ?? "bg-[#1f2733] text-gray-400 border border-[#2a3441]"}
                    animate-[fadeSlideIn_300ms_ease-out]`}
        aria-label="Offline sync status"
      >
        {syncStatus === "syncing" && (
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {pill?.label ?? (pendingCount > 0 ? `☁ ${pendingCount} pending` : "")}
        {pendingCount > 0 && syncStatus === "idle" && (
          <span className="ml-1 bg-court-orange text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Expandable panel */}
      {open && (
        <div
          className="fixed bottom-28 right-4 z-40 w-80 card p-4 shadow-2xl
                     animate-[fadeSlideIn_200ms_ease-out] flex flex-col gap-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Offline Changes</p>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
          </div>

          {lastSync && (
            <p className="text-xs text-gray-500">Last sync: {lastSync}</p>
          )}

          {/* Operation list */}
          {ops.length === 0 ? (
            <p className="text-xs text-gray-400">No pending changes.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              {ops.map((op) => (
                <div key={op.id} className="flex items-start justify-between gap-2 text-xs py-1.5 border-b border-[#1f2733] last:border-0">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={`font-medium truncate ${
                      op.status === "permanent_failure" || op.status === "failed"
                        ? "text-red-400"
                        : "text-gray-200"
                    }`}>
                      {describeAction(op)}
                    </span>
                    {op.error && (
                      <span className="text-red-500 text-[10px] truncate">{op.error}</span>
                    )}
                    <span className="text-gray-600 text-[10px]">
                      {new Date(op.queued_at).toLocaleTimeString()} · {op.attempts} attempt{op.attempts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {(op.status === "permanent_failure" || op.status === "failed") && (
                    <button
                      onClick={() => cancelFailed(op.id)}
                      className="text-gray-500 hover:text-red-400 text-xs flex-shrink-0"
                      title="Discard this change"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={retryAll}
              className="btn-primary text-xs py-1.5 flex-1"
            >
              🔄 Retry All
            </button>
          </div>
        </div>
      )}
    </>
  );
}
