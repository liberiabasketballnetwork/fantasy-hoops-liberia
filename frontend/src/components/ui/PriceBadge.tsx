"use client";

export type PriceTrend = "up" | "down" | "same";

export interface PriceBadgeProps {
  current_price: number;
  previous_price?: number;
  price_change?: number;
  price_trend?: PriceTrend;
  /** "inline" = compact badge beside the price (player card default)
   *  "detail"  = full three-row block for player detail views */
  variant?: "inline" | "detail";
  /** Show the tooltip hint about price updates. Default false. */
  showTooltip?: boolean;
}

const TREND_CONFIG: Record<PriceTrend, { arrow: string; colorClass: string; label: string }> = {
  up:   { arrow: "▲", colorClass: "text-court-green",  label: "Price Increased" },
  down: { arrow: "▼", colorClass: "text-red-400",       label: "Price Decreased" },
  same: { arrow: "—", colorClass: "text-gray-400",      label: "No Change"       },
};

export function PriceBadge({
  current_price,
  previous_price,
  price_change = 0,
  price_trend = "same",
  variant = "inline",
  showTooltip = false,
}: PriceBadgeProps) {
  const config = TREND_CONFIG[price_trend];
  const hasMoved = price_trend !== "same";
  const changeLabel = hasMoved
    ? `${price_change > 0 ? "+" : ""}${price_change} This Week`
    : "No Change";

  if (variant === "detail") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Current Price</span>
          <span className="font-bold">{current_price} Credits</span>
        </div>
        {previous_price !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Previous Price</span>
            <span className="text-gray-300">{previous_price} Credits</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Weekly Change</span>
          <span className={`font-semibold ${config.colorClass}`}>
            {config.arrow} {hasMoved ? `${price_change > 0 ? "+" : ""}${price_change} Credits` : "No Change"}
          </span>
        </div>
        {showTooltip && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Player prices update after every completed gameweek based on fantasy performance.
          </p>
        )}
      </div>
    );
  }

  // inline variant
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xs font-bold text-court-orange">{current_price} cr</span>
      <span
        className={`text-xs font-semibold flex items-center gap-0.5 ${config.colorClass}`}
        title={config.label}
        aria-label={config.label}
      >
        {config.arrow}
        {hasMoved ? ` ${price_change > 0 ? "+" : ""}${price_change}` : ""}
      </span>
    </div>
  );
}
