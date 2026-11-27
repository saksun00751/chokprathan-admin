import { ChevronDown, LogOut, ShieldCheck, SquareUserRound, UserRound } from "lucide-react";
import { Suspense } from "react";
import { initial } from "@/components/admin/initial";
import { ProfileLink } from "@/components/admin/profile-link";
import { StaffAvatar } from "@/components/admin/staff-avatar";
import { getI18n } from "@/i18n/rsc";
import { logoutAction } from "@/server/actions/auth";
import { readAvatar } from "@/server/services/profile";
import { getEmployee } from "@/server/session";

const ID = "profile-menu";

/** The chosen portrait, else the first letter, with the name for screen readers. */
async function Avatar() {
  const viewer = await getEmployee();
  const name = viewer ? viewer.name || viewer.username : "";
  const avatar = viewer ? (await readAvatar(viewer.id)).avatar : null;
  const letter = initial(name);
  if (!avatar && !letter) return <PlainAvatar />;
  return (
    <>
      {avatar ? <StaffAvatar id={avatar} className="size-full rounded-full" /> : <span aria-hidden="true">{letter}</span>}
      <span className="sr-only">{name}</span>
    </>
  );
}

const PlainAvatar = () => <UserRound className="size-5" aria-hidden="true" />;

/** The signed-in employee's name and role. */
async function Who() {
  const [viewer, { t }] = await Promise.all([getEmployee(), getI18n()]);
  if (!viewer) return null;
  return (
    <div className="border-b border-line px-3 pt-1.5 pb-2.5">
      <p className="truncate text-sm font-medium text-ink">{viewer.name || viewer.username}</p>
      <p className="truncate text-xs text-ink-3">{viewer.roleName ?? t.admin.shell.staff}</p>
    </div>
  );
}

/**
 * Top-right avatar menu, holding the name, profile, account security and sign-out. A native popover, so it works before any script runs.
 * Only the letter and the name wait for the database: the button and the menu items are always there.
 */
export async function ProfileMenu() {
  const { t } = await getI18n();
  return (
    <>
      {/* The chevron says there is a menu behind the picture. */}
      <button
        type="button"
        popoverTarget={ID}
        className="group inline-flex h-12 shrink-0 items-center gap-1 rounded-full border border-line py-1 pr-2 pl-1 hover:border-line-strong hover:bg-panel"
      >
        <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-base font-semibold text-brand-soft-ink">
          <Suspense fallback={<PlainAvatar />}>
            <Avatar />
          </Suspense>
        </span>
        <ChevronDown className="size-4 text-ink-2 group-hover:text-ink" aria-hidden="true" />
      </button>
      <div id={ID} popover="auto" className="fixed inset-auto top-14 right-4 m-0 w-56 rounded-card border border-line bg-surface p-1.5 text-ink shadow-float">
        <Suspense fallback={null}>
          <Who />
        </Suspense>
        {/* Open to every employee, including one who must still set a password or 2-step sign-in. */}
        <div className="pt-1">
          <ProfileLink href="/profile" menuId={ID}>
            <SquareUserRound className="size-4" aria-hidden="true" />
            {t.admin.shell.items.profile}
          </ProfileLink>
          <ProfileLink href="/security" menuId={ID}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t.admin.shell.items.security}
          </ProfileLink>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium text-danger hover:bg-danger-soft">
            <LogOut className="size-4" aria-hidden="true" />
            {t.admin.shell.logout}
          </button>
        </form>
      </div>
    </>
  );
}
