import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { dayStartMs } from "@/core/rules/time";
import { formatDate } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getWhatsNew } from "@/server/data/whats-new";

export const generateMetadata = () => titled((t) => t.admin.ops.whatsNew.title);

export default async function WhatsNewPage() {
  const w = (await getI18n()).t.admin.ops.whatsNew;
  return (
    <>
      <PageHeader title={w.title} description={w.description} />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <Releases />
      </Suspense>
    </>
  );
}

async function Releases() {
  const [releases, { lang, t }] = await Promise.all([getWhatsNew(), getI18n()]);
  const w = t.admin.ops.whatsNew;
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {releases.map((r) => (
        <section key={r.day} aria-labelledby={`release-${r.day}`}>
          <SectionTitle id={`release-${r.day}`}>{formatDate(dayStartMs(r.day), lang, "long")}</SectionTitle>
          <div className="mt-3 flex flex-col gap-3">
            {r.areas.map((a) => (
              <Card key={a.area} className="p-4 sm:p-5">
                <h3 className="font-semibold">{w.areas[a.area]}</h3>
                {a.kinds.map((k) => (
                  <div key={k.kind} className="mt-3">
                    <h4 className="text-sm font-semibold text-ink-2">{w.kinds[k.kind]}</h4>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {k.items.map((i) => (
                        <li key={i.key} className="py-0.5">
                          {i.href ? (
                            <Link href={i.href} className="text-brand hover:underline">
                              {w.items[i.key]}
                            </Link>
                          ) : (
                            w.items[i.key]
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
