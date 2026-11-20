import { LogoMark } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Provide } from "@/i18n/provide";
import { getI18n } from "@/i18n/rsc";

/** The employee sign-in: its own plain page, outside the back-office shell. */
export default async function LoginLayout({ children }: LayoutProps<"/[lang]/login">) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <div className="flex h-16 items-center justify-end px-5">
        <LanguageSwitcher tone="dark" />
      </div>
      <main className="flex flex-1 items-start justify-center px-5 pt-6 pb-16 sm:items-center">
        <div className="w-full max-w-[400px] rounded-card bg-surface p-7 text-ink shadow-float">
          <div className="mb-1 flex items-center gap-2.5">
            <LogoMark className="size-8" />
            <span className="text-lg font-semibold">{t.console.heading}</span>
          </div>
          <Provide ns={["console"]}>{children}</Provide>
        </div>
      </main>
    </div>
  );
}
