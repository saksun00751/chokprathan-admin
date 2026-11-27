"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** A link inside a popover menu. The layout stays on screen while the page changes, so the menu closes itself. */
export function ProfileLink({ href, menuId, children }: { href: string; menuId: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={() => document.getElementById(menuId)?.hidePopover()}
      className="flex h-10 w-full items-center gap-2.5 rounded-control px-3 text-sm font-medium text-ink-2 hover:bg-panel hover:text-ink"
    >
      {children}
    </Link>
  );
}
