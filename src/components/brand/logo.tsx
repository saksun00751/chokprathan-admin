import { getI18n } from "@/i18n/rsc";

/** Ticket silhouette with a perforated stub and a gold coin. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M6 7H26A4 4 0 0 1 30 11V13A3 3 0 0 0 30 19V21A4 4 0 0 1 26 25H6A4 4 0 0 1 2 21V19A3 3 0 0 0 2 13V11A4 4 0 0 1 6 7Z"
        fill="var(--color-brand)"
      />
      <path
        d="M10.5 9.5V22.5"
        stroke="oklch(1 0 0 / 0.55)"
        strokeWidth="1.4"
        strokeDasharray="1.6 1.8"
        strokeLinecap="round"
      />
      <circle cx="19.5" cy="16" r="4" fill="var(--color-gold)" />
      <circle cx="19.5" cy="16" r="1.6" fill="var(--color-brand-deep)" opacity="0.35" />
    </svg>
  );
}

/** Mark plus the brand name in the page's language (Server Component). */
export async function Logo({
  className = "",
  nameClassName = "",
  tone = "ink",
}: {
  className?: string;
  /** e.g. "max-sm:hidden" where a phone header needs the room */
  nameClassName?: string;
  tone?: "ink" | "white";
}) {
  const { t } = await getI18n();
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-8 shrink-0" />
      <span
        className={`whitespace-nowrap text-lg font-semibold tracking-tight ${tone === "white" ? "text-white" : "text-ink"} ${nameClassName}`}
      >
        {t.common.brand}
      </span>
    </span>
  );
}
