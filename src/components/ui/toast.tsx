"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };
type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const TONE = { success: "text-success", error: "text-danger", info: "text-brand" } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const layer = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  // Re-enter the top layer on every change so toasts stack above any open <dialog>.
  useEffect(() => {
    const el = layer.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (items.length > 0) el.showPopover();
  }, [items]);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div ref={layer} popover="manual" aria-live="polite" className="toast-layer">
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const Icon = ICON[item.kind];
            return (
              <div
                key={item.id}
                role={item.kind === "error" ? "alert" : "status"}
                className="flex animate-toast-in items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-float"
              >
                <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[item.kind]}`} aria-hidden="true" />
                <p className="min-w-0 flex-1 text-sm text-ink">{item.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="-m-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-panel hover:text-ink"
                  aria-label={t.common.closeNotification}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
