"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<any[]>([]);

  useEffect(() => {
    api.get("/sponsors").then((res) => setSponsors(res.data.sponsors || []));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">🤝 Sponsors & Prizes</h1>
      <p className="text-gray-400 text-sm">
        Sponsor-backed prizes are awarded manually each week by the admin team.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sponsors.length === 0 && (
          <p className="text-gray-500 text-sm">No sponsors added yet.</p>
        )}
        {sponsors.map((s) => (
          <div key={s.sponsor_id} className="card p-4">
            <p className="font-bold">{s.company_name}</p>
            <p className="text-sm text-court-orange">{s.prize}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
