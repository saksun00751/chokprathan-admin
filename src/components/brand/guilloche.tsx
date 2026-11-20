/**
 * Banknote-style guilloche, the brand's single decorative motif.
 * Deterministic SVG paths (no randomness) so it renders identically on
 * server and client and can live in the static shell.
 */

function rosettePaths(rings: number, r0: number, step: number, amp: number, lobes: number) {
  const paths: string[] = [];
  const samples = 360;
  for (let i = 0; i < rings; i++) {
    const R = r0 + i * step;
    const phase = (i * Math.PI) / (rings / 2);
    let d = "";
    for (let s = 0; s <= samples; s++) {
      const t = (s / samples) * Math.PI * 2;
      const r = R + amp * Math.sin(lobes * t + phase);
      const x = 200 + r * Math.cos(t);
      const y = 200 + r * Math.sin(t);
      d += `${s === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push(d + "Z");
  }
  return paths;
}

function wavePaths(lines: number, width: number, height: number) {
  const paths: string[] = [];
  const gap = height / (lines + 1);
  for (let i = 0; i < lines; i++) {
    const base = gap * (i + 1);
    let d = "";
    for (let x = 0; x <= width; x += 4) {
      const y =
        base +
        Math.sin((x / width) * Math.PI * 6 + i * 0.55) * gap * 1.6 +
        Math.sin((x / width) * Math.PI * 2 + i * 0.2) * gap * 0.8;
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  return paths;
}

const ROSETTE = rosettePaths(18, 70, 6, 14, 12);
const WAVES = wavePaths(14, 800, 200);

export function Guilloche({
  variant = "rosette",
  className = "",
  strokeOpacity = 0.16,
}: {
  variant?: "rosette" | "waves";
  className?: string;
  strokeOpacity?: number;
}) {
  if (variant === "waves") {
    return (
      <svg
        viewBox="0 0 800 200"
        preserveAspectRatio="none"
        className={`pointer-events-none ${className}`}
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeWidth="0.7" strokeOpacity={strokeOpacity}>
          {WAVES.map((d, i) => (
            <path key={i} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 400 400" className={`pointer-events-none ${className}`} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="0.8" strokeOpacity={strokeOpacity}>
        {ROSETTE.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
