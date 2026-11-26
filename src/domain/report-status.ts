import type { Dict } from "@/i18n/dictionaries";

/** A stored round status in the words reports use. */
export function reportRoundStatus(status: string, t: Dict): string {
  const words: Record<string, string> = {
    scheduled: t.lotto.phase.closed,
    pending_confirm: t.admin.shell.phase.confirming,
    resulted: t.lotto.phase.resulted,
    cancelled: t.lotto.phase.cancelled,
  };
  return words[status] ?? status;
}
