"use client";

import { LogIn } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionEnd } from "@/domain/sessions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { fmt, formatDateTime } from "@/i18n/format";
import { endedText } from "./session-ended";

type Ended = { reason: SessionEnd; at: number | null; ip: string | null };

/** Back-office screens are checked every 30 s: there are few of them and they matter. */
const EVERY = 30_000;

/**
 * One session per account means a device can lose its session at any moment (the account signed
 * in somewhere else, a password or 2-step change, an idle session). This checks every 30 s and
 * whenever the tab comes back into view, and says what happened instead of leaving a page that
 * looks signed in but no longer works.
 */
export function SessionWatch() {
  const { lang, t } = useI18n();
  const s = t.common.session;
  const router = useRouter();
  const pathname = usePathname();
  const [ended, setEnded] = useState<Ended | null>(null);

  useEffect(() => {
    let stopped = false;
    let last = 0;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible" || Date.now() - last < 10_000) return;
      last = Date.now();
      try {
        const r = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
        if (!r.ok) return;
        const body = (await r.json()) as { state: string } & Partial<Ended>;
        if (!stopped && body.state === "ended" && body.reason) setEnded({ reason: body.reason, at: body.at ?? null, ip: body.ip ?? null });
      } catch {
        // Offline or the server is restarting: the next check tries again.
      }
    };
    const timer = window.setInterval(check, EVERY);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!ended) return null;
  const { title, body } = endedText(s, ended.reason);
  const signIn = () => router.push(`/login?next=${encodeURIComponent(pathname)}`);
  // The back office is closed to a dead session: closing the notice means signing in again.
  const close = signIn;
  return (
    <Sheet
      open
      onClose={close}
      title={title}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={signIn}>
            <LogIn className="size-4" aria-hidden="true" />
            {s.signInAgain}
          </Button>
        </div>
      }
    >
      <p className="text-ink-2">{body}</p>
      {ended.at && (
        <p className="mt-3 text-sm text-ink-3">
          {ended.ip ? fmt(s.atFrom, { time: formatDateTime(ended.at, lang), ip: ended.ip }) : fmt(s.at, { time: formatDateTime(ended.at, lang) })}
        </p>
      )}
    </Sheet>
  );
}
