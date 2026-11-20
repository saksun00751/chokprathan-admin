"use client";

import { useTransition, type ReactNode } from "react";
import type { AnyActionResult } from "@/lib/action";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { useToast } from "./toast";
import { useI18n } from "@/i18n/client";

/** A button that runs a server action and reports the result as a toast. */
export function ActionButton({
  action,
  children,
  variant = "primary",
  size = "md",
  disabled,
  className,
}: {
  action: () => Promise<AnyActionResult>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) toast.success(r.message ?? t.common.done);
          else toast.error(r.error);
        })
      }
    >
      {children}
    </Button>
  );
}

export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  const { t } = useI18n();
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success(t.common.copied);
        } catch {
          toast.error(t.common.copyFailed);
        }
      }}
    >
      {label ?? t.common.copy}
    </Button>
  );
}
