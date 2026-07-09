"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/players", label: "Players" },
    { href: "/market", label: "Market" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/history", label: "History" },
    { href: "/sponsors", label: "Sponsors" },
    { href: "/rules", label: "Rules" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-court-panel border-b border-[#1f2733]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-extrabold text-lg tracking-tight">
          🏀 Fantasy Hoops <span className="text-court-orange">Liberia</span>
        </Link>

        <button
          className="md:hidden text-2xl"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          ☰
        </button>

        <div className="hidden md:flex items-center gap-5 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-court-orange">
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/profile" className="hover:text-court-orange">
                {user.full_name?.split(" ")[0] || "Profile"}
              </Link>
              <button onClick={logout} className="btn-primary text-xs">
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary text-xs">
              Login
            </Link>
          )}
        </div>
      </div>

      {open && (
        <div className="md:hidden flex flex-col gap-3 px-4 pb-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/profile" onClick={() => setOpen(false)}>
                Profile
              </Link>
              <button onClick={logout} className="btn-primary text-xs w-fit">
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="btn-primary text-xs w-fit">
              Login
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
