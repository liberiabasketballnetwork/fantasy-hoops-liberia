"use client";

export type FormRating = "hot" | "good" | "average" | "cold";

export interface FormBadgeProps {
  form: FormRating;
  /** "pill" = compact label (default), "icon" = emoji only */
  variant?: "pill" | "icon";
}

const FORM_CONFIG: Record<FormRating, { emoji: string; label: string; bg: string; text: string }> = {
  hot:     { emoji: "🔥", label: "HOT",     bg: "bg-red-500/15",     text: "text-red-400"       },
  good:    { emoji: "🟢", label: "GOOD",    bg: "bg-court-green/15", text: "text-court-green"   },
  average: { emoji: "🟡", label: "AVERAGE", bg: "bg-yellow-500/15",  text: "text-yellow-400"    },
  cold:    { emoji: "🔵", label: "COLD",    bg: "bg-blue-500/15",    text: "text-blue-400"      },
};

export function FormBadge({ form, variant = "pill" }: FormBadgeProps) {
  const config = FORM_CONFIG[form];

  if (variant === "icon") {
    return (
      <span title={config.label} aria-label={`Form: ${config.label}`}>
        {config.emoji}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold
        ${config.bg} ${config.text}`}
      aria-label={`Form: ${config.label}`}
    >
      {config.emoji} {config.label}
    </span>
  );
}
