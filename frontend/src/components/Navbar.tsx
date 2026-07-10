"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// ─── Navigation config ────────────────────────────────────────────────────────
// Single source of truth — every dropdown section defined once.

interface NavItem {
  href: string;
  label: string;
  disabled?: boolean;
  badge?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "my-team",
    label: "My Team",
    icon: "🏀",
    items: [
      { href: "/players",      label: "Pick Players"  },
      { href: "/team-advisor", label: "Advisor"       },
      { href: "/planner",      label: "Planner"       },
      { href: "/optimizer",    label: "Optimizer"     },
    ],
  },
  {
    id: "market",
    label: "Market",
    icon: "📈",
    items: [
      { href: "/market",   label: "Market Dashboard" },
      { href: "/compare",  label: "Compare Players"  },
    ],
  },
  {
    id: "community",
    label: "Community",
    icon: "🏆",
    items: [
      { href: "/leaderboard", label: "Leaderboard"   },
      { href: "/history",     label: "History"       },
      {
        href: "/mini-leagues",
        label: "Mini Leagues",
        disabled: true,
        badge: "Soon",
      },
    ],
  },
  {
    id: "more",
    label: "More",
    icon: "ℹ️",
    items: [
      { href: "/sponsors", label: "Sponsors" },
      { href: "/rules",    label: "Rules"    },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the group that owns the current path, if any. */
function activeGroupId(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => !item.disabled && pathname.startsWith(item.href)))
      return group.id;
  }
  return null;
}

// ─── Desktop dropdown ──────────────────────────────────────────────────────────

function DesktopDropdown({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard: Escape closes, arrow keys move focus
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); (ref.current?.querySelector("button") as HTMLElement)?.focus(); }
    if (e.key === "ArrowDown") { e.preventDefault(); const items = ref.current?.querySelectorAll<HTMLElement>("a:not([aria-disabled])"); items?.[0]?.focus(); }
  }

  function handleItemKey(e: React.KeyboardEvent, idx: number, total: number) {
    const items = ref.current?.querySelectorAll<HTMLElement>("a:not([aria-disabled])");
    if (!items) return;
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(idx + 1, total - 1)]?.focus(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); if (idx === 0) (ref.current?.querySelector("button") as HTMLElement)?.focus(); else items[idx - 1]?.focus(); }
    if (e.key === "Escape")    { setOpen(false); (ref.current?.querySelector("button") as HTMLElement)?.focus(); }
  }

  const activeItems = group.items.filter((i) => !i.disabled);

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`menu-${group.id}`}
        className={`flex items-center gap-1 text-sm hover:text-court-orange transition-colors py-1 ${
          isActive ? "text-court-orange font-semibold" : ""
        }`}
      >
        <span>{group.icon}</span>
        <span>{group.label}</span>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div
          id={`menu-${group.id}`}
          role="menu"
          className="absolute top-full left-0 mt-1 w-48 card border border-[#2a3441] shadow-xl
            animate-[fadeIn_0.12s_ease]"
          onMouseLeave={() => setOpen(false)}
        >
          {group.items.map((item, idx) => {
            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 cursor-not-allowed select-none"
                >
                  {item.label}
                  {item.badge && (
                    <span className="text-xs bg-[#1f2733] text-gray-500 px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </span>
              );
            }
            const isItemActive = pathname.startsWith(item.href);
            const nonDisabledIdx = activeItems.findIndex((i) => i.href === item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                onKeyDown={(e) => handleItemKey(e, nonDisabledIdx, activeItems.length)}
                className={`block px-4 py-2.5 text-sm transition-colors hover:bg-[#1f2733] hover:text-court-orange
                  ${isItemActive ? "text-court-orange font-semibold bg-court-orange/5" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mobile accordion section ─────────────────────────────────────────────────

function MobileSection({
  group,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(isActive);
  const pathname = usePathname();

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between py-2 text-sm font-semibold
          ${isActive ? "text-court-orange" : ""}`}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span>{group.icon}</span>
          <span>{group.label}</span>
        </span>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pl-6 pb-2 animate-[fadeIn_0.1s_ease]">
          {group.items.map((item) => {
            if (item.disabled) {
              return (
                <span key={item.href} className="flex items-center gap-2 py-2 text-sm text-gray-600 cursor-not-allowed">
                  {item.label}
                  {item.badge && (
                    <span className="text-xs bg-[#1f2733] text-gray-500 px-1.5 py-0.5 rounded-full">{item.badge}</span>
                  )}
                </span>
              );
            }
            const isItemActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`py-2 text-sm transition-colors hover:text-court-orange
                  ${isItemActive ? "text-court-orange font-semibold" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  const activeGrp = activeGroupId(pathname);
  const isDashboard = pathname === "/dashboard" || pathname === "/";

  // Close mobile menu on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 bg-court-panel border-b border-[#1f2733]"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="font-extrabold text-lg tracking-tight flex-shrink-0">
          🏀 Fantasy Hoops <span className="text-court-orange">Liberia</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-5 text-sm">
          {/* Dashboard — direct link */}
          <Link
            href="/dashboard"
            className={`text-sm hover:text-court-orange transition-colors ${
              isDashboard ? "text-court-orange font-semibold" : ""
            }`}
          >
            🏠 Dashboard
          </Link>

          {/* Dropdown groups */}
          {NAV_GROUPS.map((group) => (
            <DesktopDropdown
              key={group.id}
              group={group}
              isActive={activeGrp === group.id}
            />
          ))}

          {/* Admin link */}
          {user?.isAdmin && (
            <Link href="/admin" className={`text-sm hover:text-court-orange transition-colors ${pathname.startsWith("/admin") ? "text-court-orange font-semibold" : ""}`}>
              ⚙️ Admin
            </Link>
          )}

          {/* Auth */}
          {user ? (
            <div className="flex items-center gap-3 ml-2">
              <Link
                href="/profile"
                className={`text-sm hover:text-court-orange transition-colors ${pathname === "/profile" ? "text-court-orange" : "text-gray-400"}`}
              >
                {user.display_name || user.full_name?.split(" ")[0] || "Profile"}
              </Link>
              <button onClick={logout} className="btn-primary text-xs py-1 px-3">Logout</button>
            </div>
          ) : (
            <Link href="/login" className="btn-primary text-xs py-1 px-3 ml-2">Login</Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-xl p-1 hover:text-court-orange transition-colors"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          ref={mobileRef}
          className="md:hidden flex flex-col px-4 pb-5 gap-2 border-t border-[#1f2733]
            animate-[fadeIn_0.15s_ease]"
        >
          {/* Dashboard */}
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className={`py-2 text-sm font-semibold hover:text-court-orange transition-colors ${isDashboard ? "text-court-orange" : ""}`}
          >
            🏠 Dashboard
          </Link>

          {/* Accordion groups */}
          {NAV_GROUPS.map((group) => (
            <MobileSection
              key={group.id}
              group={group}
              isActive={activeGrp === group.id}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}

          {/* Admin */}
          {user?.isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className={`py-2 text-sm font-semibold hover:text-court-orange transition-colors ${pathname.startsWith("/admin") ? "text-court-orange" : ""}`}
            >
              ⚙️ Admin
            </Link>
          )}

          {/* Auth */}
          <div className="pt-3 border-t border-[#1f2733] flex flex-col gap-2">
            {user ? (
              <>
                <Link href="/profile" onClick={() => setMobileOpen(false)} className="text-sm text-gray-400 hover:text-white">
                  👤 {user.display_name || user.full_name?.split(" ")[0] || "Profile"}
                </Link>
                <button onClick={() => { logout(); setMobileOpen(false); }} className="btn-primary text-xs w-fit py-1 px-3">
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" onClick={() => setMobileOpen(false)} className="btn-primary text-xs w-fit py-1 px-3">
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
