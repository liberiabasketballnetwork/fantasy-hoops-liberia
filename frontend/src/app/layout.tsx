import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: {
    default: "Fantasy Hoops Liberia",
    template: "%s | Fantasy Hoops Liberia",
  },
  description:
    "Pick. Compete. Dominate. Build your ultimate Liberian basketball fantasy team.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico",  sizes: "any" },
      { url: "/favicon.svg",  type: "image/svg+xml" },
      { url: "/icon-16.png",  sizes: "16x16",  type: "image/png" },
      { url: "/icon-32.png",  sizes: "32x32",  type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fantasy Hoops",
  },
  applicationName: "Fantasy Hoops Liberia",
  keywords: ["fantasy basketball", "Liberia", "NPA", "sports"],
  openGraph: {
    title: "Fantasy Hoops Liberia",
    description:
      "Pick. Compete. Dominate. Build your ultimate Liberian basketball fantasy team.",
    siteName: "Fantasy Hoops Liberia",
    type: "website",
    images: [{ url: "/icon-512.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F97316",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6 min-h-[80vh]">{children}</main>
          <footer className="text-center text-xs text-gray-500 py-6 border-t border-[#1f2733]">
            🇱🇷 Built for Liberian basketball fans — Fantasy Hoops Liberia © {new Date().getFullYear()}
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
