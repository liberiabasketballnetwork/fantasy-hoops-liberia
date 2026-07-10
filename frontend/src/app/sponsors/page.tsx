"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Sponsor {
  sponsor_id: string;
  name: string;
  logo_url?: string;
  website_url?: string;
  created_at: string;
}

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    api.get("/sponsors").then((res) => setSponsors(res.data.sponsors || []));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">🤝 Sponsors & Partners</h1>
      <p className="text-gray-400 text-sm">
        Sponsor-backed prizes are awarded manually each week by the admin team.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sponsors.length === 0 && (
          <p className="text-gray-500 text-sm">No sponsors added yet.</p>
        )}

        {sponsors.map((s) => (
          <div key={s.sponsor_id} className="card p-5 flex flex-col gap-3">
            {s.logo_url && (
              <img
                src={s.logo_url}
                alt={s.name}
                className="h-12 object-contain"
              />
            )}

            <p className="font-bold text-base">{s.name}</p>

            {s.website_url && (
              <a
                href={s.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-court-orange hover:opacity-80 w-fit"
              >
                Visit Website →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
