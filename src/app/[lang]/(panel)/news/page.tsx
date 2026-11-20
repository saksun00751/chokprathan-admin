import { Suspense } from "react";
import { NewsEditor } from "@/components/admin/forms";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { formatDate } from "@/i18n/format";
import { getI18n, titled } from "@/i18n/rsc";
import { getAdminNews } from "@/server/data/admin";

export const generateMetadata = () => titled((t) => t.admin.content.news.title);

export default async function AdminNewsPage() {
  const nw = (await getI18n()).t.admin.content.news;
  return (
    <>
      <PageHeader title={nw.title} description={nw.description} actions={<NewsEditor item={null} />} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <NewsBody />
      </Suspense>
    </>
  );
}

async function NewsBody() {
  const [news, { lang, t }] = await Promise.all([getAdminNews(), getI18n()]);
  const nw = t.admin.content.news;
  return (
    <Card className="divide-y divide-line">
      {news.map((n) => (
        <article key={n.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {n.title}
              {n.pinned === 1 && <Badge tone="brand">{nw.pinned}</Badge>}
              {n.published === 0 && <Badge tone="outline">{nw.draft}</Badge>}
            </p>
            <p className="text-xs text-ink-3">{formatDate(n.created_at, lang, "long")}</p>
            <p className="mt-1 text-sm text-ink-2">{n.body}</p>
          </div>
          <NewsEditor item={n} />
        </article>
      ))}
    </Card>
  );
}
