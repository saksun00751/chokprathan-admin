import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getI18n } from "@/i18n/rsc";

export default async function NotFound() {
  const { t } = await getI18n();
  const n = t.site.notFound;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Link href="/" aria-label={t.site.nav.items.home}>
        <Logo />
      </Link>
      <p className="tnum mt-10 text-5xl font-semibold tracking-[0.1em] text-brand">404</p>
      <h1 className="mt-3 text-xl font-semibold">{n.title}</h1>
      <p className="mt-2 max-w-sm text-ink-2">{n.body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/">{n.home}</ButtonLink>
      </div>
    </main>
  );
}
