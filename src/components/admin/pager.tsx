import Link from "next/link";
import { fmt } from "@/i18n/format";

/** Newer / older links under a list that is paged, newest or highest first. */
export function Pager({ page, older, href, words }: { page: number; older: boolean; href: (page: number) => string; words: { newer: string; older: string; page: string } }) {
  if (page <= 1 && !older) return null;
  const link = "rounded-control px-3 py-2 font-medium text-brand hover:bg-brand-soft";
  return (
    <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
      {page > 1 && (
        <Link href={href(page - 1)} className={link}>
          {words.newer}
        </Link>
      )}
      <span className="tnum text-ink-3">{fmt(words.page, { n: page })}</span>
      {older && (
        <Link href={href(page + 1)} className={link}>
          {words.older}
        </Link>
      )}
    </nav>
  );
}
