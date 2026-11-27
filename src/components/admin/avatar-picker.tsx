"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { AVATAR_GROUPS, type Avatar } from "@/domain/avatar";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { saveAvatarAction } from "@/server/actions/account";
import { initial } from "./initial";

/** Choosing saves at once; the page refresh updates the avatar in the header. */
export function AvatarPicker({ current, ready, name }: { current: Avatar | null; ready: boolean; name: string }) {
  const { t } = useI18n();
  const pf = t.admin.people.profile;
  const toast = useToast();
  const [pending, start] = useTransition();
  const choose = (next: Avatar | null) => {
    if (next === current) return;
    start(async () => {
      const r = await saveAvatarAction(next);
      if (r.ok) toast.success(r.message ?? t.admin.content.done);
      else toast.error(r.error);
    });
  };
  const option = (on: boolean) =>
    cn(
      "grid size-12 place-items-center rounded-full border-2 text-2xl transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      on ? "border-brand bg-brand-soft" : "border-transparent hover:bg-panel",
    );

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-soft text-3xl font-semibold text-brand-soft-ink" aria-hidden="true">
          {current ?? initial(name)}
        </span>
        <div>
          <h2 className="font-semibold">{pf.avatar}</h2>
          <p className="text-sm text-ink-3">{ready ? pf.avatarHint : pf.notReady}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!ready || pending} aria-pressed={current === null} onClick={() => choose(null)} className={cn(option(current === null), "text-lg font-semibold")}>
          {initial(name)}
        </button>
        <span className="text-sm text-ink-2">{pf.useLetter}</span>
      </div>
      {AVATAR_GROUPS.map((g) => (
        <fieldset key={g.key}>
          <legend className="mb-1.5 text-xs text-ink-3">{pf.groups[g.key]}</legend>
          <div className="flex flex-wrap gap-1.5">
            {g.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={!ready || pending}
                aria-pressed={current === emoji}
                onClick={() => choose(emoji)}
                className={option(current === emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </Card>
  );
}
