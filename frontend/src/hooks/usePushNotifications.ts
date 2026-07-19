/**
 * usePushNotifications — PWA-003
 *
 * Manages the complete push subscription lifecycle:
 *  - Fetches VAPID public key from the backend
 *  - Calls PushManager.subscribe() with the key
 *  - Registers the subscription with POST /push/subscribe
 *  - Stores subscription state in localStorage
 *  - Handles unsubscribe and permission denial
 */

"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS_PUSH_DENIED    = "pwa_push_denied";
const LS_PUSH_ASKED_AT  = "pwa_push_asked_at";
const LS_PUSH_SUBSCRIBED = "pwa_push_subscribed";

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* private browsing */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const [permission,    setPermission]    = useState<NotificationPermission>("default");
  const [isSubscribed,  setIsSubscribed]  = useState(false);
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    setIsSubscribed(lsGet(LS_PUSH_SUBSCRIBED) === "true");
  }, []);

  /** Returns true if the soft primer should be shown */
  function shouldShowPrimer(): boolean {
    if (typeof window === "undefined") return false;
    if (!("Notification" in window))     return false;
    if (!("serviceWorker" in navigator)) return false;
    if (Notification.permission === "granted") return false;
    if (Notification.permission === "denied")  return false;
    if (lsGet(LS_PUSH_DENIED) === "true")      return false;
    if (isSubscribed)                          return false;

    const askedAt = lsGet(LS_PUSH_ASKED_AT);
    if (askedAt) {
      const daysSince = (Date.now() - Number(askedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < 14) return false;
    }
    return true;
  }

  /** Convert VAPID base64url public key to Uint8Array for PushManager */
  function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding  = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64   = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData  = window.atob(base64);
    const arr = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
    return arr.buffer;
  }

  /** Full subscribe flow: request permission → subscribe → register with backend */
  async function subscribe(deviceLabel?: string): Promise<boolean> {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Request browser notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      lsSet(LS_PUSH_ASKED_AT, String(Date.now()));

      if (perm !== "granted") {
        if (perm === "denied") lsSet(LS_PUSH_DENIED, "true");
        return false;
      }

      // 2. Fetch VAPID public key from backend
      const keyRes  = await api.get("/push/vapid-key");
      const vapidKey = keyRes.data.vapidPublicKey as string;

      // 3. Get active service worker registration
      const reg = await navigator.serviceWorker.ready;

      // 4. Create push subscription
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // 5. Register with backend
      await api.post("/push/subscribe", {
        subscription:  pushSub.toJSON(),
        device_label:  deviceLabel || detectDeviceLabel(),
      });

      lsSet(LS_PUSH_SUBSCRIBED, "true");
      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Subscription failed.";
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  /** Unsubscribe from push on this device */
  async function unsubscribe(): Promise<void> {
    setIsLoading(true);
    try {
      const reg     = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await api.delete("/push/unsubscribe", { data: { endpoint: pushSub.endpoint } });
        await pushSub.unsubscribe();
      }
      lsSet(LS_PUSH_SUBSCRIBED, "false");
      setIsSubscribed(false);
    } catch (err: any) {
      setError(err?.message || "Unsubscribe failed.");
    } finally {
      setIsLoading(false);
    }
  }

  /** Record "Maybe Later" primer dismissal */
  function dismissPrimer(): void {
    lsSet(LS_PUSH_ASKED_AT, String(Date.now()));
  }

  /** Record permanent "Don't ask" dismissal */
  function neverAsk(): void {
    lsSet(LS_PUSH_DENIED, "true");
  }

  return {
    permission,
    isSubscribed,
    isLoading,
    error,
    shouldShowPrimer,
    subscribe,
    unsubscribe,
    dismissPrimer,
    neverAsk,
  };
}

function detectDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))  return "iPhone";
  if (/iPad/.test(ua))    return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua))     return "Mac";
  if (/Win/.test(ua))     return "Windows PC";
  return "Browser";
}
