"use client";

import { Component, ReactNode } from "react";

interface Props  { children: ReactNode; }
interface State  { hasError: boolean; errorMessage: string; }

/**
 * ErrorBoundary — PWA-005
 * Catches unhandled React render errors and shows a styled recovery page
 * instead of a white screen. Mounted at the root in layout.tsx.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-4"
           style={{ background: "#0b0f14" }}>
        <div className="card p-8 max-w-md w-full text-center flex flex-col gap-5">
          <p className="text-4xl">🏀</p>
          <div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400">
              An unexpected error occurred. This has been noted. Reloading
              usually fixes it.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary w-full"
          >
            Reload App
          </button>
          <p className="text-xs text-gray-600">
            🇱🇷 Fantasy Hoops Liberia
          </p>
        </div>
      </div>
    );
  }
}
