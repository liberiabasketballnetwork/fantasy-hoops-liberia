"use client";

import Link from "next/link";

/**
 * InviteCard — GEP-001
 * Dashboard teaser card. Links to the full /invite page.
 */
export default function InviteCard() {
  return (
    <div className="card border-l-4 border-court-orange p-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl flex-shrink-0">🏀</span>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight">Invite a Friend</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">
            Know someone who loves Liberian basketball? Bring them in!
          </p>
        </div>
      </div>
      <Link
        href="/invite"
        className="btn-primary text-sm flex-shrink-0 min-h-[44px] flex items-center px-4"
      >
        Invite Friends
      </Link>
    </div>
  );
}
