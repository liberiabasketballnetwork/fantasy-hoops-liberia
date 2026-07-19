"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAContextType {
  canInstall:      boolean;
  isInstalled:     boolean;
  isIOS:           boolean;
  isOnline:        boolean;
  updateAvailable: boolean;
  triggerInstall:  () => Promise<"accepted" | "dismissed" | "unavailable">;
  applyUpdate:     () => void;
  deferredPrompt:  BeforeInstallPromptEvent | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PWAContext = createContext<PWAContextType>({
  canInstall:      false,
  isInstalled:     false,
  isIOS:           false,
  isOnline:        true,
  updateAvailable: false,
  triggerInstall:  async () => "unavailable",
  applyUpdate:     () => {},
  deferredPrompt:  null,
});

export function usePWA() {
  return useContext(PWAContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PWAProvider({ children }: { children: ReactNode }) {
  const [canInstall,      setCanInstall]      = useState(false);
  const [isInstalled,     setIsInstalled]     = useState(false);
  const [isIOS,           setIsIOS]           = useState(false);
  const [isOnline,        setIsOnline]        = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // ── Online / offline detection ──────────────────────────────────────────
    setIsOnline(navigator.onLine);
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    // ── Detect iOS Safari ───────────────────────────────────────────────────
    const ua = navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iosDevice);

    // ── Detect already installed ────────────────────────────────────────────
    const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
    const standaloneNav   = (navigator as any).standalone === true;
    if (standaloneMedia || standaloneNav) {
      setIsInstalled(true);
    }

    // ── Register Service Worker ─────────────────────────────────────────────
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then((registration) => {
          swRegistrationRef.current = registration;

          // If a new SW is already waiting on page load, surface it immediately
          if (registration.waiting) {
            setUpdateAvailable(true);
          }

          // Listen for a new SW entering the waiting state
          registration.addEventListener("updatefound", () => {
            const newSW = registration.installing;
            if (!newSW) return;
            newSW.addEventListener("statechange", () => {
              if (newSW.state === "installed" && navigator.serviceWorker.controller) {
                // New SW installed, old SW still controlling — update available
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch((err) => {
          console.warn("[PWAContext] Service worker registration failed:", err);
        });

      // Listen for messages from the SW (UPDATE_AVAILABLE, SW_ACTIVATED)
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "UPDATE_AVAILABLE") setUpdateAvailable(true);
        if (event.data?.type === "SW_ACTIVATED")    setUpdateAvailable(false);
      });

      // Detect when the controlling SW changes (after skipWaiting + claim)
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // ── Install prompt ──────────────────────────────────────────────────────
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // ── Trigger native install prompt ─────────────────────────────────────────

  async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferredPromptRef.current) return "unavailable";
    try {
      await deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;
      deferredPromptRef.current = null;
      setCanInstall(false);
      if (outcome === "accepted") setIsInstalled(true);
      return outcome;
    } catch {
      return "unavailable";
    }
  }

  // ── Apply update (tell waiting SW to take control) ────────────────────────

  function applyUpdate() {
    const reg = swRegistrationRef.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  return (
    <PWAContext.Provider
      value={{
        canInstall,
        isInstalled,
        isIOS,
        isOnline,
        updateAvailable,
        triggerInstall,
        applyUpdate,
        deferredPrompt: deferredPromptRef.current,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}
