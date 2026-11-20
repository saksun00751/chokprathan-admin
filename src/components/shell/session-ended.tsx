import { Info, ShieldAlert } from "lucide-react";
import type { SessionEnd } from "@/domain/sessions";
import type { Dict } from "@/i18n/dictionaries";

type Words = Dict["common"]["session"];

/** Title and explanation for why this device's session ended. */
export function endedText(s: Words, reason: SessionEnd): { title: string; body: string } {
  switch (reason) {
    case "replaced":
      return { title: s.replacedTitle, body: s.replacedBody };
    case "revoked":
      return { title: s.revokedTitle, body: s.revokedBody };
    case "idle":
      return { title: s.idleTitle, body: s.idleBody };
    default:
      return { title: s.expiredTitle, body: s.expiredBody };
  }
}

/** The note above a sign-in form after a session ended, e.g. "this account signed in on another device". */
export function SessionEndedNotice({ reason, s }: { reason: SessionEnd; s: Words }) {
  const { title, body } = endedText(s, reason);
  const warn = reason === "replaced";
  const Icon = warn ? ShieldAlert : Info;
  return (
    <div
      role="status"
      className={`mt-5 flex items-start gap-2.5 rounded-control px-3.5 py-3 text-sm ${warn ? "bg-warning-soft text-ink" : "bg-panel text-ink-2"}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${warn ? "text-warning" : "text-ink-3"}`} aria-hidden="true" />
      <p>
        <span className="block font-semibold text-ink">{title}</span>
        {body}
      </p>
    </div>
  );
}
