"use client";

import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { useEffect, useSyncExternalStore } from "react";
import { formatClock, splitCountdown } from "chokprathan-core/rules/time";
import { cn } from "@/lib/cn";

/**
 * One shared 1-second clock for every countdown on the page, corrected to server time.
 * Server render and hydration use the server's timestamp so the HTML already shows real values.
 */
let offset = 0;
let current = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();

function tickNow() {
  current = Date.now() + offset;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    tickNow();
    timer = window.setInterval(tickNow, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(serverNow: number): number {
  return useSyncExternalStore(
    subscribe,
    () => current || serverNow,
    () => serverNow,
  );
}

/** Call once per page with the server's Date.now() so client clocks agree with the server. */
export function ServerTimeSync({ serverNow }: { serverNow: number }) {
  useEffect(() => {
    offset = serverNow - Date.now();
    tickNow();
  }, [serverNow]);
  return null;
}

export type Urgency = "calm" | "soon" | "urgent" | "closed";

export function urgencyOf(remaining: number): Urgency {
  if (remaining <= 0) return "closed";
  if (remaining <= 5 * 60_000) return "urgent";
  if (remaining <= 15 * 60_000) return "soon";
  return "calm";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "02:15:09", or with days "3 วัน 02:15:09" (the day word comes from the dictionary). */
export function formatRemaining(ms: number, dayWord = "d"): string {
  const { d, h, m, s } = splitCountdown(ms);
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d} ${dayWord} ${clock}` : clock;
}

const TONE: Record<Urgency, string> = {
  calm: "text-ink",
  soon: "text-warning",
  urgent: "text-danger",
  closed: "text-ink-3",
};

export function Countdown({
  closesAt,
  serverNow,
  className,
  closedLabel,
}: {
  closesAt: number;
  serverNow: number;
  className?: string;
  closedLabel?: string;
}) {
  const { t } = useI18n();
  const c = t.common.countdown;
  const now = useNow(serverNow);
  const remaining = closesAt - now;
  const urgency = urgencyOf(remaining);
  const closed = closedLabel ?? c.closed;
  return (
    <time
      dateTime={new Date(closesAt).toISOString()}
      aria-label={urgency === "closed" ? closed : fmt(c.aria, { time: formatClock(closesAt), left: formatRemaining(remaining, c.days) })}
      className={cn("tnum font-semibold", TONE[urgency], className)}
    >
      {urgency === "closed" ? closed : formatRemaining(remaining, c.days)}
    </time>
  );
}

export function UrgencyLabel({ closesAt, serverNow }: { closesAt: number; serverNow: number }) {
  const { t } = useI18n();
  const now = useNow(serverNow);
  const remaining = closesAt - now;
  const urgency = urgencyOf(remaining);
  if (urgency === "urgent") {
    return <span className="text-xs font-semibold text-danger">{fmt(t.common.countdown.closesIn, { n: Math.max(1, Math.ceil(remaining / 60_000)) })}</span>;
  }
  if (urgency === "soon") return <span className="text-xs font-semibold text-warning">{t.common.countdown.soon}</span>;
  return null;
}

/** Live Bangkok wall clock, e.g. for the lobby header. */
export function LiveClock({ serverNow, className }: { serverNow: number; className?: string }) {
  const now = useNow(serverNow);
  const d = new Date(now + 7 * 3_600_000);
  return (
    <span className={cn("tnum", className)}>
      {pad(d.getUTCHours())}:{pad(d.getUTCMinutes())}:{pad(d.getUTCSeconds())}
    </span>
  );
}
