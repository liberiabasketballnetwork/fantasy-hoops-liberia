/**
 * useOfflineSync — PWA-004
 *
 * Sync engine for the offline queue.
 * Processes operations sequentially in queued_at order.
 * Generates a sync_session_id for every run.
 * Attaches JWT at replay time — never stores it.
 *
 * Retry policy:
 *   Network / 503 / 504 → exponential backoff (1s, 2s, 4s, 8s, 16s), max 5 attempts
 *   400 / 403 / 404 / 422 → permanent_failure, no retry
 *   401 → keep pending, retry after auth
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Q from "@/lib/offlineQueue";
import { useAuth } from "@/context/AuthContext";
import { usePWA } from "@/context/PWAContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "synced" | "failed";

// ─── Backoff helper ───────────────────────────────────────────────────────────

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000]; // ms
const MAX_ATTEMPTS   = 5;

function backoffDelay(attempts: number): number {
  return BACKOFF_DELAYS[Math.min(attempts, BACKOFF_DELAYS.length - 1)];
}

// ─── Action whitelist validation ──────────────────────────────────────────────

const VALID_TRIPLES: Array<{
  action: Q.ActionType;
  methodPattern: RegExp;
  endpointPattern: RegExp;
}> = [
  { action: "WATCHLIST_ADD",       methodPattern: /^POST$/,   endpointPattern: /^\/watchlist$/ },
  { action: "WATCHLIST_REMOVE",    methodPattern: /^DELETE$/, endpointPattern: /^\/watchlist\/.+$/ },
  { action: "NOTIFICATION_READ",   methodPattern: /^PATCH$/,  endpointPattern: /^\/notifications\/.+\/read$/ },
  { action: "NOTIFICATION_READ_ALL", methodPattern: /^PATCH$/, endpointPattern: /^\/notifications\/read-all$/ },
  { action: "NOTIFICATION_ARCHIVE", methodPattern: /^PATCH$/, endpointPattern: /^\/notifications\/.+\/archive$/ },
  { action: "PUSH_PREFERENCES",    methodPattern: /^POST$/,   endpointPattern: /^\/push\/preferences$/ },
  { action: "DISPLAY_NAME_CHANGE", methodPattern: /^POST$/,   endpointPattern: /^\/set-display-name$/ },
];

function validateOperation(op: Q.QueueOperation): boolean {
  return VALID_TRIPLES.some(
    (t) =>
      t.action === op.action &&
      t.methodPattern.test(op.method) &&
      t.endpointPattern.test(op.endpoint)
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineSync() {
  const { token }    = useAuth();
  const { isOnline } = usePWA();

  const [syncStatus,   setSyncStatus]   = useState<SyncStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);

  const isSyncing  = useRef(false);
  const sessionRef = useRef<string | null>(null);

  // ── Refresh pending count ─────────────────────────────────────────────────

  const refreshCount = useCallback(async () => {
    try {
      const count = await Q.pendingCount();
      setPendingCount(count);
    } catch { /* IndexedDB may be unavailable in SSR */ }
  }, []);

  // ── Core sync loop ────────────────────────────────────────────────────────

  const triggerSync = useCallback(async () => {
    if (isSyncing.current) return;
    if (!isOnline)         return;
    if (!token)            return;

    isSyncing.current = true;
    // Generate a unique session ID for this sync run (for logging)
    const sync_session_id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}`;
    sessionRef.current = sync_session_id;

    console.log(`[OfflineSync] Session ${sync_session_id} — starting`);
    setSyncStatus("syncing");

    try {
      const ops = await Q.getAll("pending");
      if (ops.length === 0) {
        setSyncStatus("idle");
        isSyncing.current = false;
        return;
      }

      let anyFailed = false;

      for (const op of ops) {
        // Security: validate action/endpoint/method before replaying
        if (!validateOperation(op)) {
          console.warn(`[OfflineSync:${sync_session_id}] Rejected invalid operation`, op.id, op.action);
          await Q.update(op.id, { status: "permanent_failure", error: "Invalid operation — rejected by whitelist" });
          anyFailed = true;
          continue;
        }

        // Mark as syncing
        await Q.update(op.id, { status: "syncing" });

        let lastError: string | null = null;
        let succeeded = false;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, backoffDelay(attempt - 1)));
          }

          try {
            // Attach JWT at replay time — never store it
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              Authorization:  `Bearer ${token}`,
            };

            const BACKEND = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await fetch(`${BACKEND}${op.endpoint}`, {
              method:  op.method,
              headers,
              body:    op.method !== "DELETE" ? JSON.stringify(op.payload) : undefined,
            });

            if (res.ok) {
              await Q.update(op.id, {
                status:       "done",
                last_attempt: new Date().toISOString(),
                attempts:     attempt + 1,
                error:        null,
              });
              succeeded = true;
              console.log(`[OfflineSync:${sync_session_id}] ✓ ${op.action} (${op.id.slice(0, 8)})`);
              break;
            }

            const status = res.status;

            // Permanent failures — do not retry
            if ([400, 403, 404, 422].includes(status)) {
              const body = await res.json().catch(() => ({}));
              lastError = `HTTP ${status}: ${(body as any)?.error || res.statusText}`;
              await Q.update(op.id, {
                status:       "permanent_failure",
                attempts:     attempt + 1,
                last_attempt: new Date().toISOString(),
                error:        lastError,
              });
              anyFailed = true;
              console.warn(`[OfflineSync:${sync_session_id}] Permanent failure ${op.action}:`, lastError);
              succeeded = true; // break the retry loop
              break;
            }

            // Auth failure — keep pending, stop all syncing
            if (status === 401) {
              await Q.update(op.id, {
                status:       "pending",
                attempts:     attempt + 1,
                last_attempt: new Date().toISOString(),
                error:        "Authentication required",
              });
              console.warn(`[OfflineSync:${sync_session_id}] 401 — stopping sync, awaiting re-auth`);
              isSyncing.current = false;
              setSyncStatus("failed");
              await refreshCount();
              return;
            }

            // Transient failure — retry (503, 504, or other 5xx)
            lastError = `HTTP ${status}`;
          } catch (networkErr: any) {
            lastError = networkErr?.message || "Network error";
          }

          if (attempt === MAX_ATTEMPTS - 1) {
            // Exhausted retries — keep as pending for next sync cycle
            await Q.update(op.id, {
              status:       "pending",
              attempts:     attempt + 1,
              last_attempt: new Date().toISOString(),
              error:        lastError,
            });
            anyFailed = true;
          }
        }

        if (!succeeded && !anyFailed) {
          anyFailed = true;
        }
      }

      await Q.clearCompleted();
      await refreshCount();
      setSyncStatus(anyFailed ? "failed" : "synced");
      console.log(`[OfflineSync:${sync_session_id}] — complete. anyFailed=${anyFailed}`);

      // Reset "synced" back to idle after 3s
      if (!anyFailed) {
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    } catch (err: any) {
      console.error(`[OfflineSync:${sync_session_id}] Unexpected error:`, err?.message);
      setSyncStatus("failed");
    } finally {
      isSyncing.current = false;
    }
  }, [isOnline, token, refreshCount]);

  // ── Trigger on reconnect ──────────────────────────────────────────────────

  useEffect(() => {
    if (isOnline && token) {
      triggerSync();
    }
  }, [isOnline, token, triggerSync]);

  // ── Trigger on mount (app launch / page refresh) ──────────────────────────

  useEffect(() => {
    refreshCount();
    if (isOnline && token) {
      triggerSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for service worker background sync completion ──────────────────

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "BACKGROUND_SYNC_COMPLETE") {
        refreshCount();
        setSyncStatus("synced");
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [refreshCount]);

  // ── Register background sync tag after queue changes ─────────────────────

  async function registerBackgroundSync() {
    try {
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register("fhl-offline-sync");
      }
    } catch { /* Background Sync not supported — graceful fallback */ }
  }

  // ── Public enqueue helper (wraps queue + triggers background sync reg) ────

  async function queueAction(
    action: string,
    endpoint: string,
    method: Q.QueueOperation["method"],
    payload?: Record<string, unknown>
  ): Promise<Q.QueueOperation> {
    const op = await Q.enqueue(action, endpoint, method, payload);
    await refreshCount();
    await registerBackgroundSync();
    // Also attempt immediate sync if online
    if (isOnline && token) {
      triggerSync();
    }
    return op;
  }

  return {
    syncStatus,
    pendingCount,
    triggerSync,
    queueAction,
    refreshCount,
  };
}
