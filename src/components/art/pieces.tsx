/**
 * Illustration pieces: gold coins, lottery balls, ticket, gift, red envelope, trophy,
 * phone, friends, coupon, chat bubble, stock chart, light rays, glints.
 * Pure SVG on the shared gradients in ArtDefs. All decorative (aria-hidden).
 */
type P = { className?: string };
const svg = { "aria-hidden": true, focusable: "false" } as const;
const INK = "oklch(0.22 0.03 285)";

export function Coin({ className, symbol = "฿" }: P & { symbol?: string }) {
  return (
    <svg viewBox="0 0 100 104" className={className} {...svg}>
      <circle cx="50" cy="54" r="46" fill="url(#cp-gold-edge)" />
      <circle cx="50" cy="49" r="46" fill="url(#cp-gold)" />
      <circle cx="50" cy="49" r="38" fill="url(#cp-gold-face)" stroke="oklch(0.7 0.14 74)" strokeWidth="2" />
      <circle cx="50" cy="49" r="31" fill="none" stroke="oklch(0.97 0.06 92 / 0.8)" strokeWidth="1.5" strokeDasharray="2 3" />
      <text x="48.5" y="61.5" textAnchor="middle" fontSize="40" fontWeight="700" fill="oklch(0.97 0.06 93)" opacity="0.7">
        {symbol}
      </text>
      <text x="50" y="63" textAnchor="middle" fontSize="40" fontWeight="700" fill="oklch(0.58 0.13 68)">
        {symbol}
      </text>
      <ellipse cx="33" cy="27" rx="16" ry="8" fill="url(#cp-gloss)" opacity="0.8" transform="rotate(-30 33 27)" />
    </svg>
  );
}

/** A coin seen at an angle, for flying coins. */
export function CoinTilt({ className }: P) {
  return (
    <svg viewBox="0 0 100 60" className={className} {...svg}>
      <path d="M6 26v8a44 20 0 0 0 88 0v-8z" fill="url(#cp-gold-edge)" />
      <ellipse cx="50" cy="26" rx="44" ry="20" fill="url(#cp-gold)" />
      <ellipse cx="50" cy="26" rx="35" ry="15" fill="url(#cp-gold-face)" stroke="oklch(0.72 0.14 74)" strokeWidth="1.5" />
      <ellipse cx="36" cy="18" rx="15" ry="4" fill="url(#cp-gloss)" opacity="0.75" />
    </svg>
  );
}

export function CoinStack({ className, count = 5 }: P & { count?: number }) {
  return (
    <svg viewBox={`0 0 100 ${36 + count * 11}`} className={className} {...svg}>
      {Array.from({ length: count }, (_, i) => {
        const y = 22 + (count - 1 - i) * 11;
        return (
          <g key={i}>
            <path d={`M6 ${y}v9a44 17 0 0 0 88 0v-9z`} fill="url(#cp-gold-edge)" />
            {Array.from({ length: 11 }, (_, k) => (
              <path key={k} d={`M${14 + k * 7.2} ${y + 5}v${7 - Math.abs(5 - k) * 0.4}`} stroke="oklch(0.42 0.1 60 / 0.35)" strokeWidth="1.2" />
            ))}
            <ellipse cx="50" cy={y} rx="44" ry="17" fill="url(#cp-gold)" />
            <ellipse cx="50" cy={y} rx="35" ry="12.5" fill="url(#cp-gold-face)" />
          </g>
        );
      })}
      <ellipse cx="36" cy="16" rx="14" ry="3.5" fill="url(#cp-gloss)" opacity="0.7" />
    </svg>
  );
}

export type BallTone = "violet" | "gold" | "red" | "green" | "blue";

export function LottoBall({ n, tone = "violet", className }: P & { n: string; tone?: BallTone }) {
  return (
    <svg viewBox="0 0 100 100" className={className} {...svg}>
      <circle cx="50" cy="50" r="46" fill={`url(#cp-ball-${tone})`} />
      <circle cx="50" cy="51" r="22" fill="oklch(0.99 0 0)" />
      <circle cx="50" cy="51" r="22" fill="none" stroke="oklch(0.2 0.05 285 / 0.12)" strokeWidth="2" />
      <text x="50" y="60.5" textAnchor="middle" fontSize="27" fontWeight="700" fill={INK}>
        {n}
      </text>
      <ellipse cx="33" cy="26" rx="15" ry="9" fill="url(#cp-gloss)" transform="rotate(-28 33 26)" />
    </svg>
  );
}

/** `label` is drawn as text (pass it in the page's language); without one, a plain bar stands in. */
export function TicketArt({ className, numbers = "925", label }: P & { numbers?: string; label?: string }) {
  return (
    <svg viewBox="0 0 220 132" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <path d="M18 8H64A6 6 0 0 0 70 14V114A6 6 0 0 0 64 120H18A12 12 0 0 1 6 108V20A12 12 0 0 1 18 8Z" fill="url(#cp-violet)" />
        <path d="M76 8H202A12 12 0 0 1 214 20V108A12 12 0 0 1 202 120H76A6 6 0 0 1 70 114V14A6 6 0 0 1 76 8Z" fill="oklch(1 0 0)" />
      </g>
      <path d="M70 18V110" style={{ stroke: "color-mix(in oklch, var(--color-brand) 50%, transparent)" }} strokeWidth="2" strokeDasharray="3 4" />
      <circle cx="38" cy="44" r="13" fill="url(#cp-gold)" />
      <text x="38" y="49.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="oklch(0.55 0.13 68)">
        ฿
      </text>
      <rect x="22" y="70" width="32" height="5" rx="2.5" fill="oklch(1 0 0 / 0.55)" />
      <rect x="26" y="81" width="24" height="5" rx="2.5" fill="oklch(1 0 0 / 0.35)" />
      {label ? (
        <text x="88" y="38" fontSize="12" fill="oklch(0.53 0.02 285)">
          {label}
        </text>
      ) : (
        <rect x="88" y="29" width="62" height="7" rx="3.5" fill="oklch(0.53 0.02 285 / 0.3)" />
      )}
      <text x="86" y="82" fontSize="40" fontWeight="700" letterSpacing="6" style={{ fill: "var(--color-brand-soft-ink)" }}>
        {numbers}
      </text>
      {[0, 3, 5, 9, 11, 14, 18, 20, 23, 27, 30].map((x, i) => (
        <rect key={i} x={140 + x * 1.9} y="96" width={i % 3 === 0 ? 2.6 : 1.4} height="13" fill="oklch(0.3 0.03 285)" />
      ))}
      <circle cx="190" cy="40" r="13" fill="none" stroke="oklch(0.84 0.13 84)" strokeWidth="3" />
      <circle cx="190" cy="40" r="7" fill="oklch(0.84 0.13 84)" />
    </svg>
  );
}

export function GiftBox({ className }: P) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <rect x="20" y="54" width="80" height="56" rx="7" fill="url(#cp-violet)" />
        <rect x="20" y="58" width="80" height="6" fill="oklch(0.22 0.09 284 / 0.35)" />
        <rect x="13" y="40" width="94" height="20" rx="6" fill="url(#cp-violet-light)" />
        <rect x="53" y="40" width="14" height="70" fill="url(#cp-gold)" />
        <path d="M60 41C52 27 33 21 31 32C29 42 46 44 60 41Z" fill="url(#cp-gold)" />
        <path d="M60 41C68 27 87 21 89 32C91 42 74 44 60 41Z" fill="url(#cp-gold)" />
        <path d="M60 41C55 33 44 29 40 33" fill="none" stroke="oklch(0.6 0.13 66 / 0.6)" strokeWidth="1.5" />
        <path d="M60 41C65 33 76 29 80 33" fill="none" stroke="oklch(0.6 0.13 66 / 0.6)" strokeWidth="1.5" />
        <rect x="54" y="35" width="12" height="11" rx="4" fill="url(#cp-gold-edge)" />
      </g>
      <rect x="22" y="44" width="28" height="3.5" rx="1.75" fill="oklch(1 0 0 / 0.4)" />
      <rect x="25" y="70" width="4" height="30" rx="2" fill="oklch(1 0 0 / 0.18)" />
    </svg>
  );
}

export function RedEnvelope({ className }: P) {
  return (
    <svg viewBox="0 0 100 132" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <rect x="10" y="10" width="80" height="112" rx="9" fill="url(#cp-red)" />
        <path d="M10 19a9 9 0 0 1 9-9h62a9 9 0 0 1 9 9v22Q50 70 10 41Z" fill="url(#cp-red-dark)" />
      </g>
      <rect x="16" y="16" width="68" height="100" rx="6" fill="none" stroke="oklch(0.86 0.15 86 / 0.55)" strokeWidth="1.3" />
      <circle cx="50" cy="56" r="16" fill="url(#cp-gold)" />
      <circle cx="50" cy="56" r="11.5" fill="none" stroke="oklch(0.68 0.14 72)" strokeWidth="1.3" />
      <text x="50" y="62.5" textAnchor="middle" fontSize="17" fontWeight="700" fill="oklch(0.55 0.13 66)">
        ฿
      </text>
      <rect x="24" y="92" width="52" height="5" rx="2.5" fill="oklch(0.86 0.15 86 / 0.45)" />
      <rect x="32" y="102" width="36" height="4" rx="2" fill="oklch(0.86 0.15 86 / 0.3)" />
      <ellipse cx="28" cy="30" rx="8" ry="16" fill="url(#cp-gloss)" opacity="0.35" transform="rotate(20 28 30)" />
    </svg>
  );
}

export function Trophy({ className }: P) {
  return (
    <svg viewBox="0 0 100 120" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <path d="M28 22H16C16 42 25 50 34 52" fill="none" stroke="url(#cp-gold-edge)" strokeWidth="7" strokeLinecap="round" />
        <path d="M72 22H84C84 42 75 50 66 52" fill="none" stroke="url(#cp-gold-edge)" strokeWidth="7" strokeLinecap="round" />
        <path d="M27 12H73V40C73 59 62 70 50 70C38 70 27 59 27 40Z" fill="url(#cp-gold)" />
        <rect x="44" y="68" width="12" height="16" fill="url(#cp-gold-edge)" />
        <path d="M32 96H68L64 84H36Z" fill="url(#cp-gold)" />
        <rect x="26" y="96" width="48" height="14" rx="3.5" fill="url(#cp-ink)" />
      </g>
      <rect x="38" y="101" width="24" height="4" rx="2" fill="oklch(0.84 0.13 84 / 0.7)" />
      <ellipse cx="39" cy="30" rx="5" ry="13" fill="url(#cp-gloss)" opacity="0.65" />
    </svg>
  );
}

export function PhoneArt({ className, screen = "check" }: P & { screen?: "check" | "share" | "balance" }) {
  return (
    <svg viewBox="0 0 90 164" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <rect x="5" y="5" width="80" height="152" rx="15" fill="url(#cp-ink)" />
        <rect x="10" y="12" width="70" height="138" rx="10" fill="oklch(0.975 0.006 285)" />
      </g>
      <rect x="34" y="16" width="22" height="5" rx="2.5" fill="oklch(0.25 0.03 285)" />
      <rect x="16" y="28" width="58" height="34" rx="6" fill="url(#cp-violet)" />
      <rect x="22" y="36" width="22" height="4" rx="2" fill="oklch(0.86 0.05 285)" opacity="0.8" />
      <text x="22" y="55" fontSize="11.5" fontWeight="700" fill="oklch(1 0 0)">
        ฿12,450
      </text>
      {screen === "check" && (
        <>
          <circle cx="45" cy="96" r="17" fill="url(#cp-green)" />
          <path d="M37 96l6 6 11-12" stroke="oklch(1 0 0)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="22" y="121" width="46" height="7" rx="3.5" fill="oklch(0.88 0.02 285)" />
          <rect x="29" y="133" width="32" height="5" rx="2.5" fill="oklch(0.92 0.01 285)" />
        </>
      )}
      {screen === "share" && (
        <>
          <circle cx="30" cy="92" r="9" fill="url(#cp-violet-light)" />
          <circle cx="60" cy="82" r="9" fill="url(#cp-gold)" />
          <circle cx="60" cy="108" r="9" fill="url(#cp-red)" />
          <path d="M38 88l14-4M38 96l14 8" style={{ stroke: "var(--art-brand-light-b)" }} strokeWidth="2.5" strokeLinecap="round" />
          <rect x="18" y="126" width="54" height="12" rx="6" fill="url(#cp-violet)" />
        </>
      )}
      {screen === "balance" && (
        <>
          {[0, 1, 2].map((i) => (
            <rect key={i} x="16" y={74 + i * 22} width="58" height="16" rx="4" fill="oklch(1 0 0)" stroke="oklch(0.9 0.01 285)" />
          ))}
          <rect x="20" y="80" width="24" height="4" rx="2" fill="oklch(0.8 0.02 285)" />
          <rect x="54" y="80" width="16" height="4" rx="2" fill="oklch(0.6 0.15 155)" />
          <rect x="20" y="102" width="20" height="4" rx="2" fill="oklch(0.8 0.02 285)" />
          <rect x="52" y="102" width="18" height="4" rx="2" fill="oklch(0.84 0.13 84)" />
        </>
      )}
    </svg>
  );
}

export function Friends({ className }: P) {
  return (
    <svg viewBox="0 0 120 100" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <circle cx="38" cy="34" r="16" fill="url(#cp-gold)" />
        <path d="M10 92C10 66 22 56 38 56S66 66 66 92Z" fill="url(#cp-gold)" />
        <circle cx="80" cy="30" r="18" fill="url(#cp-violet-light)" />
        <path d="M50 92C50 64 63 52 80 52S110 64 110 92Z" fill="url(#cp-violet)" />
      </g>
      <ellipse cx="73" cy="22" rx="7" ry="4" fill="url(#cp-gloss)" opacity="0.7" />
      <ellipse cx="32" cy="27" rx="6" ry="3.5" fill="url(#cp-gloss)" opacity="0.7" />
    </svg>
  );
}

export function Coupon({ className }: P) {
  return (
    <svg viewBox="0 0 120 80" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <path d="M14 10H106A6 6 0 0 1 112 16V31A9 9 0 0 0 112 49V64A6 6 0 0 1 106 70H14A6 6 0 0 1 8 64V49A9 9 0 0 0 8 31V16A6 6 0 0 1 14 10Z" fill="url(#cp-gold)" />
      </g>
      <path d="M78 16V64" stroke="oklch(0.6 0.13 66 / 0.6)" strokeWidth="2" strokeDasharray="3 3" />
      <text x="42" y="50" textAnchor="middle" fontSize="26" fontWeight="700" fill="oklch(0.42 0.1 62)">
        %
      </text>
      <circle cx="95" cy="40" r="8" fill="url(#cp-violet)" />
      <ellipse cx="34" cy="20" rx="16" ry="3.5" fill="url(#cp-gloss)" opacity="0.7" />
    </svg>
  );
}

export function ChatBubble({ className }: P) {
  return (
    <svg viewBox="0 0 110 100" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <path d="M18 12H92A12 12 0 0 1 104 24V62A12 12 0 0 1 92 74H48L28 90V74H18A12 12 0 0 1 6 62V24A12 12 0 0 1 18 12Z" fill="url(#cp-green)" />
      </g>
      {[34, 55, 76].map((x) => (
        <circle key={x} cx={x} cy="43" r="6" fill="oklch(1 0 0)" />
      ))}
      <ellipse cx="30" cy="22" rx="16" ry="4" fill="url(#cp-gloss)" opacity="0.6" />
    </svg>
  );
}

export function ChartArt({ className }: P) {
  const bars: [number, number, number, boolean][] = [
    [18, 52, 22, true],
    [34, 40, 30, false],
    [50, 44, 20, true],
    [66, 26, 34, true],
    [82, 18, 28, false],
  ];
  return (
    <svg viewBox="0 0 100 90" className={className} {...svg}>
      <g filter="url(#cp-shadow)">
        <rect x="4" y="6" width="92" height="78" rx="12" fill="url(#cp-ink)" />
      </g>
      {bars.map(([x, y, h, up]) => (
        <g key={x}>
          <path d={`M${x} ${y - 6}V${y + h + 6}`} stroke={up ? "oklch(0.72 0.16 155)" : "oklch(0.65 0.2 27)"} strokeWidth="1.5" />
          <rect x={x - 4} y={y} width="8" height={h} rx="1.5" fill={up ? "oklch(0.72 0.16 155)" : "oklch(0.65 0.2 27)"} />
        </g>
      ))}
      <path d="M12 66C30 62 40 50 54 48S76 30 90 22" fill="none" stroke="oklch(0.84 0.13 84)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Rays({ className, count = 18 }: P & { count?: number }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} {...svg}>
      {Array.from({ length: count }, (_, i) => (
        <path key={i} d="M0 0L-8 -100L8 -100Z" transform={`rotate(${(360 / count) * i})`} fill="oklch(1 0 0 / 0.07)" />
      ))}
    </svg>
  );
}

export function Glints({ className }: P) {
  const dots: [number, number, number][] = [
    [12, 20, 3],
    [40, 8, 2],
    [176, 14, 3.5],
    [190, 70, 2],
    [150, 100, 3],
    [24, 96, 2.5],
    [100, 6, 2],
  ];
  return (
    <svg viewBox="0 0 200 120" className={className} {...svg}>
      {dots.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r * 2.6} fill="url(#cp-gloss)" opacity="0.55" />
          <circle cx={x} cy={y} r={r * 0.7} fill="oklch(1 0 0)" />
        </g>
      ))}
    </svg>
  );
}
