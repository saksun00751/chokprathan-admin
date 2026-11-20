/**
 * Shared gradients and filters for every illustration on the page.
 * Mounted once in the root layout; pieces reference them with url(#cp-…).
 * Kept out of display:none so Firefox still renders the gradients.
 */
const BALLS: Record<string, [string, string, string]> = {
  // "violet" is the brand ball: it follows the active colour theme (globals.css --art-*).
  violet: ["var(--art-ball-a)", "var(--art-ball-b)", "var(--art-ball-c)"],
  gold: ["oklch(0.98 0.06 95)", "oklch(0.85 0.16 85)", "oklch(0.58 0.14 66)"],
  red: ["oklch(0.86 0.1 25)", "oklch(0.62 0.22 27)", "oklch(0.4 0.17 25)"],
  green: ["oklch(0.9 0.09 155)", "oklch(0.64 0.16 155)", "oklch(0.4 0.12 155)"],
  blue: ["oklch(0.87 0.08 240)", "oklch(0.6 0.17 248)", "oklch(0.36 0.14 258)"],
};

export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", overflow: "hidden" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cp-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.97 0.07 95)" />
          <stop offset="0.45" stopColor="oklch(0.86 0.15 85)" />
          <stop offset="1" stopColor="oklch(0.62 0.14 68)" />
        </linearGradient>
        <linearGradient id="cp-gold-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.74 0.15 76)" />
          <stop offset="1" stopColor="oklch(0.47 0.11 62)" />
        </linearGradient>
        <radialGradient id="cp-gold-face" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="oklch(0.99 0.05 95)" />
          <stop offset="0.5" stopColor="oklch(0.88 0.15 86)" />
          <stop offset="1" stopColor="oklch(0.68 0.15 72)" />
        </radialGradient>
        <linearGradient id="cp-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--art-brand-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--art-brand-b)" }} />
        </linearGradient>
        <linearGradient id="cp-violet-light" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--art-brand-light-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--art-brand-light-b)" }} />
        </linearGradient>
        <linearGradient id="cp-red" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.67 0.22 28)" />
          <stop offset="1" stopColor="oklch(0.47 0.19 25)" />
        </linearGradient>
        <linearGradient id="cp-red-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.55 0.2 26)" />
          <stop offset="1" stopColor="oklch(0.4 0.16 23)" />
        </linearGradient>
        <linearGradient id="cp-ink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.34 0.04 285)" />
          <stop offset="1" stopColor="oklch(0.17 0.03 285)" />
        </linearGradient>
        <linearGradient id="cp-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.72 0.16 155)" />
          <stop offset="1" stopColor="oklch(0.5 0.13 155)" />
        </linearGradient>
        <radialGradient id="cp-gloss" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="oklch(1 0 0)" stopOpacity="0.9" />
          <stop offset="1" stopColor="oklch(1 0 0)" stopOpacity="0" />
        </radialGradient>
        {Object.entries(BALLS).map(([tone, [a, b, c]]) => (
          <radialGradient key={tone} id={`cp-ball-${tone}`} cx="0.36" cy="0.3" r="0.78">
            <stop offset="0" style={{ stopColor: a }} />
            <stop offset="0.55" style={{ stopColor: b }} />
            <stop offset="1" style={{ stopColor: c }} />
          </radialGradient>
        ))}
        <filter id="cp-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="oklch(0.14 0.05 285)" floodOpacity="0.45" />
        </filter>
        <filter id="cp-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
    </svg>
  );
}
