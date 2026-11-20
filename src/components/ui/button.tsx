import Link, { type LinkProps } from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const VARIANT = {
  primary: "bg-brand text-white hover:bg-brand-hover active:bg-brand-press",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-panel active:bg-line",
  ghost: "text-ink-2 hover:bg-panel hover:text-ink active:bg-line",
  danger: "bg-danger text-white hover:brightness-95 active:brightness-90",
  dangerGhost: "text-danger hover:bg-danger-soft",
  gold: "bg-gold text-ink hover:brightness-[0.97] active:brightness-95",
  onDeep: "bg-white text-brand-deep hover:bg-brand-soft active:bg-line",
  onDeepGhost: "border border-white/35 text-white hover:bg-white/10 active:bg-white/15",
} as const;

const SIZE = {
  lg: "h-12 gap-2 px-5 text-base",
  md: "h-11 gap-2 px-4 text-base",
  sm: "h-9 gap-1.5 px-3 text-sm",
  icon: "size-11",
  iconSm: "size-9",
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-semibold",
    "transition-[background-color,color,filter,transform] duration-150 ease-out-quart active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: LinkProps & Omit<ComponentProps<"a">, "href"> & { variant?: ButtonVariant; size?: ButtonSize; children: ReactNode }) {
  return (
    <Link {...props} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
