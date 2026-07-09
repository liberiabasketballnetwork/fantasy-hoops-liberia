"use client";

export interface Last5SparklineProps {
  scores: number[];
}

export function Last5Sparkline({ scores }: Last5SparklineProps) {
  if (!scores || scores.length === 0) return null;

  const max = Math.max(...scores, 1);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-gray-400">Last {scores.length} Games</p>
      <div className="flex items-end gap-1 h-8">
        {scores.map((score, i) => {
          const heightPct = Math.max((score / max) * 100, 8); // min 8% so bar is visible
          const isFirst = i === 0;
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-0.5 flex-1"
              title={`${score.toFixed(1)} pts`}
            >
              <div
                className={`w-full rounded-sm transition-all ${
                  isFirst ? "bg-court-orange" : "bg-[#2a3441]"
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        {scores.map((score, i) => (
          <span
            key={i}
            className={`flex-1 text-center text-xs truncate ${
              i === 0 ? "text-court-orange font-semibold" : "text-gray-500"
            }`}
          >
            {score % 1 === 0 ? score : score.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
