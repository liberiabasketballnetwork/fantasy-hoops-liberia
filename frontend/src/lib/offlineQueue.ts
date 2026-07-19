/**
 * Offline Queue — PWA-004
 *
 * Persists non-competitive user actions in IndexedDB so they can be
 * replayed when connectivity is restored.
 *
 * Database:    fhl-offline-queue
 * Store:       operations
 * Indexes:     status, queued_at
 *
 * Security:    Never store JWT, passwords, push keys, or sensitive PII.
 *              JWT is attached at replay time by the sync engine.
 * Competitive: Lineup, captain, league, scoring actions are rejected.
 */

// ─── Schema ───────────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;
export const DB_NAME        = "fhl-offline-queue";
export const STORE_NAME     = "operations";

export type ActionType =
  | "WATCHLIST_ADD"
  | "WATCHLIST_REMOVE"
  | "NOTIFICATION_READ"
  | "NOTIFICATION_READ_ALL"
  | "NOTIFICATION_ARCHIVE"
  | "PUSH_PREFERENCES"
  | "DISPLAY_NAME_CHANGE";

export type OperationStatus =
  | "pending"
  | "syncing"
  | "done"
  | "failed"
  | "permanent_failure";

export interface QueueOperation {
  schema_version: number;          // SCHEMA_VERSION constant
  id:             string;          // UUID
  action:         ActionType;
  endpoint:       string;
  method:         "POST" | "PATCH" | "DELETE";
  payload:        Record<string, unknown>;
  queued_at:      string;          // ISO timestamp
  attempts:       number;
  last_attempt:   string | null;
  status:         OperationStatus;
  error:          string | null;
}

// ─── Permitted action whitelist ───────────────────────────────────────────────

const ALLOWED_ACTIONS: Set<ActionType> = new Set([
  "WATCHLIST_ADD",
  "WATCHLIST_REMOVE",
  "NOTIFICATION_READ",
  "NOTIFICATION_READ_ALL",
  "NOTIFICATION_ARCHIVE",
  "PUSH_PREFERENCES",
  "DISPLAY_NAME_CHANGE",
]);

function assertValidAction(action: string): asserts action is ActionType {
  if (!ALLOWED_ACTIONS.has(action as ActionType)) {
    throw new Error(`[OfflineQueue] Rejected unknown action: "${action}"`);
  }
}

// ─── UUID helper ──────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── IndexedDB bootstrap ──────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    req.onupgradeneeded = (event) => {
      const db    = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status",    "status",    { unique: false });
        store.createIndex("queued_at", "queued_at", { unique: false });
      }
    };

    req.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db!);
    };

    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req   = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      })
  );
}

// ─── Coalescing rules ─────────────────────────────────────────────────────────

/**
 * Returns the key that identifies "the same logical operation" for coalescing.
 * Operations with the same coalesce key are deduplicated — the new one wins.
 * null = never coalesce (e.g. NOTIFICATION_READ on different IDs is independent).
 */
function coalesceKey(op: Pick<QueueOperation, "action" | "endpoint">): string | null {
  switch (op.action) {
    // Watchlist: same player endpoint — keep final intent
    case "WATCHLIST_ADD":
    case "WATCHLIST_REMOVE":
      return `watchlist:${op.endpoint}`;

    // Preferences: always replace — only final state matters
    case "PUSH_PREFERENCES":
      return "push_preferences";

    // Display name: only the last change matters
    case "DISPLAY_NAME_CHANGE":
      return "display_name";

    // Notification read-all: idempotent, collapse duplicates
    case "NOTIFICATION_READ_ALL":
      return "notification_read_all";

    // Per-notification actions: independent, do not coalesce
    case "NOTIFICATION_READ":
    case "NOTIFICATION_ARCHIVE":
      return null;

    default:
      return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add an operation to the queue.
 * Validates the action type, applies coalescing, and persists to IndexedDB.
 */
export async function enqueue(
  action: string,
  endpoint: string,
  method: QueueOperation["method"],
  payload: Record<string, unknown> = {}
): Promise<QueueOperation> {
  assertValidAction(action);

  const op: QueueOperation = {
    schema_version: SCHEMA_VERSION,
    id:             uuid(),
    action:         action as ActionType,
    endpoint,
    method,
    payload,
    queued_at:      new Date().toISOString(),
    attempts:       0,
    last_attempt:   null,
    status:         "pending",
    error:          null,
  };

  const key = coalesceKey(op);
  if (key !== null) {
    // Remove any existing pending operation with the same coalesce key
    const existing = await getAll("pending");
    for (const prev of existing) {
      if (coalesceKey(prev) === key) {
        await remove(prev.id);
      }
    }
  }

  await withStore("readwrite", (store) => store.add(op));
  return op;
}

/** Fetch a single operation by ID */
export async function get(id: string): Promise<QueueOperation | undefined> {
  return withStore("readonly", (store) => store.get(id));
}

/** Fetch all operations, optionally filtered by status */
export async function getAll(
  status?: OperationStatus
): Promise<QueueOperation[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req   = status
          ? store.index("status").getAll(status)
          : store.getAll();
        req.onsuccess = () =>
          resolve(
            (req.result as QueueOperation[]).sort(
              (a, b) =>
                new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime()
            )
          );
        req.onerror = () => reject(req.error);
      })
  );
}

/** Update fields on an existing operation */
export async function update(
  id: string,
  changes: Partial<QueueOperation>
): Promise<void> {
  const op = await get(id);
  if (!op) return;
  const updated = { ...op, ...changes };
  await withStore("readwrite", (store) => store.put(updated));
}

/** Remove a single operation by ID */
export async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/** Delete all operations with status "done" */
export async function clearCompleted(): Promise<void> {
  const done = await getAll("done");
  await Promise.all(done.map((op) => remove(op.id)));
}

/** Total count of pending operations */
export async function pendingCount(): Promise<number> {
  const ops = await getAll("pending");
  return ops.length;
}
