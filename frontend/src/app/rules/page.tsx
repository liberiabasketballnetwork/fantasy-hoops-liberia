export default function RulesPage() {
  const rules = [
    { label: "Point scored", value: "1 fantasy point" },
    { label: "Rebound", value: "1.5 fantasy points" },
    { label: "Assist", value: "2 fantasy points" },
    { label: "Steal", value: "3 fantasy points" },
    { label: "Block", value: "3 fantasy points" },
    { label: "Turnover", value: "-1 fantasy point" },
    { label: "Captain", value: "All points x2" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">📋 Rules & Scoring</h1>
      <ol className="list-decimal list-inside text-gray-300 text-sm flex flex-col gap-1">
        <li>Every gameweek, pick 5 real Liberian basketball players.</li>
        <li>
          You have a <strong>100-credit budget</strong>. Every player has a price based on how
          strong they are — star players cost more, so you can't just stack the 5 best players
          on every team. Build wisely.
        </li>
        <li>Choose one of your 5 as Captain — their score is doubled.</li>
        <li>Submit your lineup before the weekly submission deadline.</li>
        <li>Once games are played, admins enter real stats.</li>
        <li>Fantasy points are calculated automatically and the leaderboard updates.</li>
        <li>You cannot edit or resubmit a lineup once the week is locked.</li>
      </ol>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0b0f14] text-gray-400">
            <tr>
              <th className="text-left p-3">Stat</th>
              <th className="text-right p-3">Fantasy Value</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.label} className="border-t border-[#1f2733]">
                <td className="p-3">{r.label}</td>
                <td className="p-3 text-right font-bold text-court-orange">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
