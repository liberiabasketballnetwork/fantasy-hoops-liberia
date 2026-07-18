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
  canInstall: boolean;          // browser captured beforeinstallprompt
  isInstalled: boolean;         // running in standalone mode or appinstalled fired
  isIOS: boolean;               // iOS Safari — manual install flow
  triggerInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  deferredPrompt: BeforeInstallPromptEvent | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PWAContext = createContext<PWAContextType>({
  canInstall: false,
  isInstalled: false,
  isIOS: false,
  triggerInstall: async () => "unavailable",
  deferredPrompt: null,
});

export function usePWA() {
  return useContext(PWAContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PWAProvider({ children }: { children: ReactNode }) {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // ── Detect iOS Safari ───────────────────────────────────────────────────
    const ua = navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iosDevice);

    // ── Detect already installed ────────────────────────────────────────────
    const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
    const standaloneNav   = (navigator as any).standalone === true;
    if (standaloneMedia || standaloneNav) {
      setIsInstalled(true);
      return; // no need to capture install prompt
    }

    // ── Capture beforeinstallprompt ─────────────────────────────────────────
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress default browser prompt
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    // ── Detect when install completes ───────────────────────────────────────
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
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

  return (
    <PWAContext.Provider
      value={{
        canInstall,
        isInstalled,
        isIOS,
        triggerInstall,
        deferredPrompt: deferredPromptRef.current,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}
