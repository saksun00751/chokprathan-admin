"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { LangTabs } from "@/components/admin/lang-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { GROUP_ARTS, groupName, isBuiltinGroup, type LottoGroupInfo } from "@/domain/lotto-groups";
import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { AnyActionResult } from "@/lib/action";
import { deleteLottoGroupAction, moveLottoGroupAction, saveLottoGroupAction } from "@/server/actions/admin";

const box = "h-10 rounded-control border border-line-strong bg-surface px-3";

/** Add, rename, reorder and delete the groups lotteries are filed under. `used` holds each lottery's group code. */
export function LottoGroups({ groups, used }: { groups: LottoGroupInfo[]; used: string[] }) {
  const { lang, t } = useI18n();
  const lg = t.admin.ops.lottos.groups;
  const ask = useConfirm();
  const toast = useToast();
  const [pending, start] = useTransition();
  /** The group being edited, "" for a new one, null when no form is open. */
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    setEditing(null);
  };
  const run = (fn: () => Promise<AnyActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? lg.saved);
        after?.();
      } else toast.error(r.error);
    });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {lg.manage}
      </Button>
      <Sheet open={open} onClose={close} title={lg.manage} size="lg">
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-line">
            {groups.map((g, i) => {
              const count = used.filter((code) => code === g.code).length;
              const label = groupName(g, lang, t.lotto.groups);
              return (
                <li key={g.code} className="flex flex-col gap-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{label}</span> <span className="text-xs text-ink-3">{fmt(lg.count, { n: count })}</span>
                    </span>
                    {isBuiltinGroup(g.code) && <Badge tone="outline">{lg.builtin}</Badge>}
                    <Button size="sm" variant="secondary" aria-label={`${lg.moveUp}: ${label}`} disabled={pending || i === 0} onClick={() => run(() => moveLottoGroupAction(g.code, -1))}>
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="secondary" aria-label={`${lg.moveDown}: ${label}`} disabled={pending || i === groups.length - 1} onClick={() => run(() => moveLottoGroupAction(g.code, 1))}>
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(editing === g.code ? null : g.code)}>
                      {lg.edit}
                    </Button>
                    {!isBuiltinGroup(g.code) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending || count > 0}
                        title={count > 0 ? lg.removeBlocked : undefined}
                        onClick={async () => {
                          const answer = await ask({ title: lg.removeTitle, tone: "danger", details: [[lg.name, label]] });
                          if (answer.ok) run(() => deleteLottoGroupAction(g.code));
                        }}
                      >
                        {lg.remove}
                      </Button>
                    )}
                  </div>
                  {editing === g.code && (
                    <GroupForm group={g} pending={pending} onSave={(v) => run(() => saveLottoGroupAction(g.code, v), () => setEditing(null))} onCancel={() => setEditing(null)} />
                  )}
                </li>
              );
            })}
          </ul>
          {editing === "" ? (
            <GroupForm pending={pending} onSave={(v) => run(() => saveLottoGroupAction(null, v), () => setEditing(null))} onCancel={() => setEditing(null)} />
          ) : (
            <Button className="self-start" onClick={() => setEditing("")}>
              {lg.add}
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}

type Values = Pick<LottoGroupInfo, "name" | "i18n" | "art">;

function GroupForm({ group, pending, onSave, onCancel }: { group?: LottoGroupInfo; pending: boolean; onSave: (v: Values) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const lg = t.admin.ops.lottos.groups;
  const [tab, setTab] = useState<Locale>("th");
  const [v, setV] = useState<Values>({ name: group?.name ?? "", i18n: group?.i18n ?? {}, art: group?.art ?? "ticket" });
  const builtin = group !== undefined && isBuiltinGroup(group.code);
  return (
    <form
      className="flex flex-col gap-3 rounded-control bg-panel p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <LangTabs value={tab} onChange={setTab} label={lg.name} />
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{lg.name}</span>
          <input
            className={box}
            maxLength={60}
            value={tab === "th" ? v.name : (v.i18n[tab]?.name ?? "")}
            placeholder={builtin ? groupName({ ...group, name: "", i18n: {} }, tab, t.lotto.groups) : tab === "th" ? "" : v.name}
            onChange={(e) => setV(tab === "th" ? { ...v, name: e.target.value } : { ...v, i18n: { ...v.i18n, [tab]: { name: e.target.value } } })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-ink-3">{lg.art}</span>
          <select className={box} value={v.art} onChange={(e) => setV({ ...v, art: e.target.value })}>
            {GROUP_ARTS.map((a) => (
              <option key={a} value={a}>
                {lg.arts[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-ink-3">{builtin ? lg.builtinHint : lg.nameHint}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {lg.cancel}
        </Button>
        <Button type="submit" loading={pending}>
          {lg.save}
        </Button>
      </div>
    </form>
  );
}
