"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { usePWA } from "@/context/PWAContext";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Notification {
  notification_id: string;
  type:            string;
  title:           string;
  message:         string;
  link:            string | null;
  status:          "unread" | "read" | "archived";
  priority:        "high" | "normal" | "low";
  created_at:      string;
  metadata:        any;
}

// ─── Type icon mapping ──────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  ACHIEVEMENT: "🏅",
  REPORT:      "📊",
  WATCHLIST:   "👁️",
  PRICE:       "💰",
  LEAGUE:      "🏆",
  REFERRAL:    "🤝",
  ADVISOR:     "💡",
  SYSTEM:      "⚙️",
  ADMIN:       "📢",
};

function typeIcon(type: string): string {
  return TYPE_ICON[type] ?? "🔔";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline }   = usePWA();
  const { queueAction } = useOfflineSync();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread,   setTotalUnread]   = useState(0);
  const [hasMore,       setHasMore]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [page,          setPage]          = useState(0);
  const [filter,        setFilter]        = useState<"all" | "unread">("all");
  const PAGE_SIZE = 20;

  const load = useCallback(async (reset = false) => {
    const offset = reset ? 0 : page * PAGE_SIZE;
    if (!reset) setLoadingMore(true); else setLoading(true);
    try {
      const res = await api.get(
        `/notifications?limit=${PAGE_SIZE}&offset=${offset}&status=${filter === "unread" ? "unread" : ""}`
      );
      const data = res.data;
      setTotalUnread(data.total_unread ?? 0);
      setHasMore(data.has_more ?? false);
      if (reset) {
        setNotifications(data.notifications ?? []);
        setPage(1);
      } else {
        setNotifications((prev) => [...prev, ...(data.notifications ?? [])]);
        setPage((p) => p + 1);
      }
    } catch { /* graceful */ }
    finally { setLoading(false); setLoadingMore(false); }
  }, [filter, page]);

  useEffect(() => {
    if (!authLoading && user) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, filter]);

  async function markRead(id: string) {
    // Optimistic
    setNotifications((prev) =>
      prev.map((n) => n.notification_id === id ? { ...n, status: "read" as const } : n)
    );
    setTotalUnread((c) => Math.max(0, c - 1));

    if (!isOnline) {
      await queueAction("NOTIFICATION_READ", `/notifications/${id}/read`, "PATCH");
      return;
    }
    api.patch(`/notifications/${id}/read`).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, status: "read" as const })));
    setTotalUnread(0);
    if (!isOnline) {
      await queueAction("NOTIFICATION_READ_ALL", "/notifications/read-all", "PATCH");
      return;
    }
    api.patch("/notifications/read-all").catch(() => {});
  }

  async function archive(id: string) {
    setNotifications((prev) => prev.filter((n) => n.notification_id !== id));
    if (!isOnline) {
      await queueAction("NOTIFICATION_ARCHIVE", `/notifications/${id}/archive`, "PATCH");
      return;
    }
    api.patch(`/notifications/${id}/archive`).catch(() => {});
  }

  if (!authLoading && !user) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto">
        <p className="mb-4">Log in to view your notifications.</p>
        <Link href="/login" className="btn-primary">Log in</Link>
      </div>
    );
  }

  const visible = filter === "unread"
    ? notifications.filter((n) => n.status === "unread")
    : notifications;

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🔔 Notifications</h1>
          {totalUnread > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">{totalUnread} unread</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "unread"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as "all" | "unread")}
              className={`px-3 py-1.5 rounded text-xs font-semibold capitalize ${
                filter === f ? "btn-primary" : "bg-[#1f2733] text-gray-400"
              }`}
            >
              {f}
            </button>
          ))}
          {totalUnread > 0 && (
            <button
              onClick={markAllRead}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[#1f2733] text-gray-400 hover:text-gray-200"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4 flex gap-3 animate-pulse">
              <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center flex flex-col items-center gap-3">
          <span className="text-4xl">🔔</span>
          <p className="font-bold">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="text-sm text-gray-400 max-w-sm">
            {filter === "unread"
              ? "You're all caught up."
              : "Notifications will appear here when you earn badges, your players change price, or league activity happens."}
          </p>
          {filter === "unread" && (
            <button onClick={() => setFilter("all")} className="text-sm text-court-orange">
              View all notifications →
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((n) => (
            <div
              key={n.notification_id}
              className={`card p-4 flex items-start gap-3 transition-colors ${
                n.status === "unread" ? "border-l-2 border-court-orange" : "opacity-75"
              }`}
            >
              {/* Icon */}
              <span className="text-2xl flex-shrink-0 mt-0.5">{typeIcon(n.type)}</span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className={`text-sm font-semibold leading-tight ${
                    n.status === "unread" ? "text-gray-100" : "text-gray-400"
                  }`}>
                    {n.title}
                  </p>
                  <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(n.created_at)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{n.message}</p>
                {n.link && (
                  <Link
                    href={n.link}
                    onClick={() => n.status === "unread" && markRead(n.notification_id)}
                    className="text-xs text-court-orange hover:opacity-80 mt-1 inline-block"
                  >
                    View →
                  </Link>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                {n.status === "unread" && (
                  <button
                    onClick={() => markRead(n.notification_id)}
                    title="Mark as read"
                    className="w-6 h-6 rounded-full bg-court-orange/20 hover:bg-court-orange/40 flex items-center justify-center transition-colors"
                    aria-label="Mark as read"
                  >
                    <span className="w-2 h-2 rounded-full bg-court-orange block" />
                  </button>
                )}
                <button
                  onClick={() => archive(n.notification_id)}
                  title="Archive"
                  className="text-gray-600 hover:text-gray-400 text-xs leading-none p-1 transition-colors"
                  aria-label="Archive notification"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => load(false)}
              disabled={loadingMore}
              className="w-full py-3 rounded-lg bg-[#1f2733] hover:bg-[#2a3441] text-sm text-gray-400 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
