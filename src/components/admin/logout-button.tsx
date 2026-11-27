"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { useI18n } from "@/i18n/client";
import { logoutAction } from "@/server/actions/auth";

/** Sign-out asks first. Before the page's script runs, the form still signs out directly. */
export function LogoutButton() {
  const { t } = useI18n();
  const ask = useConfirm();
  const [pending, start] = useTransition();
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        disabled={pending}
        onClick={async (e) => {
          e.preventDefault();
          const k = t.admin.shell.confirm;
          const answer = await ask({ title: k.logout, note: k.logoutNote, tone: "danger", confirmLabel: t.admin.shell.logout });
          if (answer.ok) start(() => logoutAction());
        }}
        className="flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium text-danger hover:bg-danger-soft"
      >
        <LogOut className="size-4" aria-hidden="true" />
        {t.admin.shell.logout}
      </button>
    </form>
  );
}
