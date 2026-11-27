"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { Avatar } from "@/domain/avatar";
import { useI18n } from "@/i18n/client";
import { saveAvatarAction } from "@/server/actions/account";
import { initial } from "./initial";
import { PortraitField } from "./portrait-field";
import { StaffAvatar } from "./staff-avatar";

/** Choosing asks first, then saves; the page refresh updates the avatar in the header. */
export function AvatarPicker({ current, ready, name }: { current: Avatar | null; ready: boolean; name: string }) {
  const { t } = useI18n();
  const pf = t.admin.people.profile;
  const toast = useToast();
  const [pending, start] = useTransition();
  const ask = useConfirm();
  const picture = (id: Avatar | null) => (id ? <StaffAvatar id={id} className="size-14 rounded-full" /> : <span>{pf.useLetter}</span>);
  const choose = async (next: Avatar | null) => {
    if (next === current) return;
    const answer = await ask({
      title: pf.confirm,
      details: [
        [
          pf.avatar,
          <span key="avatar" className="inline-flex items-center gap-3">
            {picture(current)} <span aria-hidden="true">→</span> {picture(next)}
          </span>,
        ],
      ],
    });
    if (!answer.ok) return;
    start(async () => {
      const r = await saveAvatarAction(next);
      if (r.ok) toast.success(r.message ?? t.admin.content.done);
      else toast.error(r.error);
    });
  };
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-soft text-3xl font-semibold text-brand-soft-ink" aria-hidden="true">
          {current ? <StaffAvatar id={current} className="size-full rounded-full" /> : initial(name)}
        </span>
        <div>
          <h2 className="font-semibold">{pf.avatar}</h2>
          <p className="text-sm text-ink-3">{ready ? pf.avatarHint : pf.notReady}</p>
        </div>
      </div>
      <PortraitField value={current} name={name} disabled={!ready || pending} onChange={choose} />
    </Card>
  );
}
