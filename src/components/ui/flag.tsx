import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Simplified circular flags, drawn as plain SVG (no emoji, which renders inconsistently). */
const RED = "oklch(0.55 0.21 27)";
const BLUE = "oklch(0.38 0.15 262)";
const NAVY = "oklch(0.3 0.12 262)";
const WHITE = "oklch(1 0 0)";
const YELLOW = "oklch(0.86 0.17 92)";
const GREEN = "oklch(0.5 0.14 150)";
const SAFFRON = "oklch(0.74 0.17 58)";
const BLACK = "oklch(0.2 0 0)";
const GOLD = "oklch(0.8 0.15 85)";

const star = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`);
  }
  return pts.join(" ");
};

const H3 = (a: string, b: string, c: string) => (
  <>
    <rect width="24" height="8" fill={a} />
    <rect y="8" width="24" height="8" fill={b} />
    <rect y="16" width="24" height="8" fill={c} />
  </>
);

const FLAGS: Record<string, ReactNode> = {
  TH: (
    <>
      <rect width="24" height="24" fill={RED} />
      <rect y="4" width="24" height="16" fill={WHITE} />
      <rect y="8" width="24" height="8" fill={BLUE} />
    </>
  ),
  LA: (
    <>
      <rect width="24" height="24" fill={RED} />
      <rect y="6" width="24" height="12" fill={BLUE} />
      <circle cx="12" cy="12" r="4" fill={WHITE} />
    </>
  ),
  VN: (
    <>
      <rect width="24" height="24" fill={RED} />
      <polygon points={star(12, 12.5, 6.5)} fill={YELLOW} />
    </>
  ),
  JP: (
    <>
      <rect width="24" height="24" fill={WHITE} />
      <circle cx="12" cy="12" r="5.5" fill={RED} />
    </>
  ),
  CN: (
    <>
      <rect width="24" height="24" fill={RED} />
      <polygon points={star(8, 9, 4.5)} fill={YELLOW} />
      <polygon points={star(14.5, 5.5, 1.4)} fill={YELLOW} />
      <polygon points={star(16.5, 9, 1.4)} fill={YELLOW} />
      <polygon points={star(16, 13, 1.4)} fill={YELLOW} />
    </>
  ),
  HK: (
    <>
      <rect width="24" height="24" fill={RED} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="12" cy="7.6" rx="2.2" ry="4.2" fill={WHITE} transform={`rotate(${a} 12 12)`} />
      ))}
    </>
  ),
  TW: (
    <>
      <rect width="24" height="24" fill={RED} />
      <rect width="13" height="12" fill={BLUE} />
      <circle cx="6.5" cy="6" r="3" fill={WHITE} />
    </>
  ),
  KR: (
    <>
      <rect width="24" height="24" fill={WHITE} />
      <path d="M6.5 12a5.5 5.5 0 0 1 11 0z" fill={RED} />
      <path d="M6.5 12a5.5 5.5 0 0 0 11 0z" fill={BLUE} />
    </>
  ),
  SG: (
    <>
      <rect width="24" height="12" fill={RED} />
      <rect y="12" width="24" height="12" fill={WHITE} />
      <circle cx="8" cy="6.5" r="3.6" fill={WHITE} />
      <circle cx="9.4" cy="6.5" r="3.4" fill={RED} />
    </>
  ),
  IN: (
    <>
      {H3(SAFFRON, WHITE, GREEN)}
      <circle cx="12" cy="12" r="2.6" fill="none" stroke={NAVY} strokeWidth="1" />
    </>
  ),
  EG: (
    <>
      {H3(RED, WHITE, BLACK)}
      <circle cx="12" cy="12" r="2" fill={GOLD} />
    </>
  ),
  RU: H3(WHITE, BLUE, RED),
  DE: H3(BLACK, RED, GOLD),
  GB: (
    <>
      <rect width="24" height="24" fill={NAVY} />
      <path d="M0 0 24 24M24 0 0 24" stroke={WHITE} strokeWidth="4" />
      <path d="M0 0 24 24M24 0 0 24" stroke={RED} strokeWidth="1.5" />
      <path d="M12 0v24M0 12h24" stroke={WHITE} strokeWidth="6" />
      <path d="M12 0v24M0 12h24" stroke={RED} strokeWidth="3.5" />
    </>
  ),
  US: (
    <>
      <rect width="24" height="24" fill={WHITE} />
      {[0, 4, 8, 12, 16, 20].map((y) => (
        <rect key={y} y={y} width="24" height="2" fill={RED} />
      ))}
      <rect width="12" height="12" fill={NAVY} />
    </>
  ),
  MY: (
    <>
      <rect width="24" height="24" fill={WHITE} />
      {[0, 4, 8, 12, 16, 20].map((y) => (
        <rect key={y} y={y} width="24" height="2" fill={RED} />
      ))}
      <rect width="13" height="12" fill={NAVY} />
      <circle cx="5.5" cy="6" r="3.2" fill={YELLOW} />
      <circle cx="6.6" cy="6" r="2.7" fill={NAVY} />
    </>
  ),
  YK: (
    <>
      <rect width="24" height="24" fill="var(--color-brand)" />
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill={WHITE} />
      <circle cx="9.5" cy="9.5" r="1.3" fill="var(--color-brand)" />
      <circle cx="14.5" cy="14.5" r="1.3" fill="var(--color-brand)" />
      <circle cx="12" cy="12" r="1.3" fill="var(--color-brand)" />
    </>
  ),
};

export function Flag({ code, className }: { code: string | null; className?: string }) {
  const art = (code && FLAGS[code]) || FLAGS.TH;
  return (
    <span className={cn("inline-block size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-ink/10", className)} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-full" preserveAspectRatio="xMidYMid slice">
        {art}
      </svg>
    </span>
  );
}
