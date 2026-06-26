import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import AdBanner from "@/components/AdBanner";

export const metadata: Metadata = {
  title: "Fantasy Hoops Liberia",
  description: "Pick your fantasy basketball team. Compete with Liberian basketball fans every week.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0F14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6 min-h-[80vh]">{children}</main>
          <AdBanner />
          <footer className="text-center text-xs text-gray-500 py-6 border-t border-[#1f2733]">
            🇱🇷 Built for Liberian basketball fans — Fantasy Hoops Liberia © {new Date().getFullYear()}
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
