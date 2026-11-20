"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { THEMES, type ThemeId } from "@/domain/themes";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { saveThemeAction } from "@/server/actions/admin";

/** Each card renders a small slice of the real UI inside data-theme-preview, so what you see is what applies. */
export function ThemePicker({ current }: { current: ThemeId }) {
  const { t: d } = useI18n();
  const sh = d.admin.shell;
  const toast = useToast();
  const ask = useConfirm();
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState<ThemeId | null>(null);
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {THEMES.map((t) => {
        const on = t.id === current;
        return (
          <li key={t.id}>
            <article
              data-theme-preview={t.id}
              className={cn(
                "flex h-full flex-col overflow-hidden rounded-card border bg-surface shadow-card",
                on ? "border-brand ring-2 ring-brand/30" : "border-line",
              )}
            >
              <div className="bg-canvas p-3" aria-hidden="true">
                <div
                  className="relative overflow-hidden rounded-[10px] bg-brand-deep p-3 text-white"
                  style={{
                    background:
                      "radial-gradient(90% 120% at 90% 40%, var(--slide-glow) 0%, transparent 60%), linear-gradient(118deg, var(--slide-from), var(--slide-to))",
                  }}
                >
                  <p className="text-[11px] text-on-deep-2">{d.site.home.balance}</p>
                  <p className="tnum text-xl font-semibold">฿12,480.00</p>
                  <span className="mt-2 inline-flex h-6 items-center rounded-full bg-gold px-2.5 text-[11px] font-semibold text-ink">
                    {d.site.home.govSlide.depositBonus}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-line bg-surface p-2.5">
                  <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-ink">25</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-ink">{d.lotto.betTypes.top2.label} ×95</span>
                    <span className="block text-[11px] text-ink-3">{sh.theme.previewLotto}</span>
                  </span>
                  <span className="inline-flex h-7 items-center rounded-[8px] bg-brand px-2.5 text-[11px] font-semibold text-white">{sh.theme.previewBet}</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex shrink-0 -space-x-1.5 pt-0.5">
                    {t.swatch.map((c) => (
                      <span key={c} className="size-5 rounded-full border-2 border-surface" style={{ background: c }} />
                    ))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-ink">
                      {sh.themes[t.id].name} {t.id === "royal" && <span className="text-xs font-normal text-ink-3">{sh.theme.original}</span>}
                    </h2>
                    <p className="text-sm text-ink-2">{sh.themes[t.id].description}</p>
                  </div>
                </div>
                <div className="mt-auto">
                  {on ? (
                    <p className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand">
                      <Check className="size-4" aria-hidden="true" />
                      {sh.theme.active}
                    </p>
                  ) : (
                    <Button
                      variant="secondary"
                      loading={pending && saving === t.id}
                      disabled={pending}
                      onClick={async () => {
                        const answer = await ask({
                          title: sh.confirm.changeTheme,
                          details: [[sh.theme.active, `${sh.themes[current].name} → ${sh.themes[t.id].name}`]],
                          note: sh.confirm.changeThemeNote,
                          confirmLabel: fmt(sh.theme.use, { name: sh.themes[t.id].name }),
                        });
                        if (!answer.ok) return;
                        setSaving(t.id);
                        start(async () => {
                          const r = await saveThemeAction(t.id);
                          if (r.ok) toast.success(r.message ?? sh.theme.changed);
                          else toast.error(r.error);
                        });
                      }}
                    >
                      {fmt(sh.theme.use, { name: sh.themes[t.id].name })}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
