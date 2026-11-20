"use client";

import { AlertTriangle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";

/**
 * One confirmation step for every important back-office action: it shows exactly what is about to
 * happen (amounts, accounts, numbers, the changes) before anything is saved. Focus starts on Cancel
 * (or on the reason field), so a double Enter or a held key can never confirm by accident.
 */
export interface ConfirmOptions {
  title: string;
  /** label → value rows describing what will be saved */
  details?: [string, ReactNode][];
  /** a warning under the details, e.g. "pays out at once and cannot be undone" */
  note?: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  /** a free-text field (a reason) whose value is returned on confirm */
  input?: { label: string; required?: boolean; placeholder?: string };
}

type Answer = { ok: true; text: string } | { ok: false };
type Ask = (options: ConfirmOptions) => Promise<Answer>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const c = useI18n().t.admin.shell.confirm;
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((a: Answer) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The Sheet opens the <dialog> in its own effect, which focuses the first control (the close
  // button). This effect runs after it and moves focus to where a stray key press is harmless.
  useEffect(() => {
    if (!options) return;
    (options.input ? inputRef.current : cancelRef.current)?.focus();
  }, [options]);

  const ask = useCallback<Ask>(
    (next) =>
      new Promise<Answer>((resolve) => {
        resolver.current?.({ ok: false });
        resolver.current = resolve;
        setText("");
        setOptions(next);
      }),
    [],
  );

  const finish = (answer: Answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  };

  const danger = options?.tone === "danger";
  const blocked = !!options?.input?.required && text.trim().length < 3;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Sheet
        open={options !== null}
        onClose={() => finish({ ok: false })}
        title={options?.title ?? ""}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button ref={cancelRef} variant="secondary" onClick={() => finish({ ok: false })}>
              {c.cancel}
            </Button>
            <Button variant={danger ? "danger" : "primary"} disabled={blocked} onClick={() => finish({ ok: true, text: text.trim() })}>
              {options?.confirmLabel ?? c.confirm}
            </Button>
          </div>
        }
      >
        {options && (
          <div className="flex flex-col gap-4">
            {options.details && options.details.length > 0 && (
              <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                {options.details.map(([label, value], i) => (
                  <div key={i} className="contents">
                    <dt className="text-ink-3">{label}</dt>
                    <dd className="font-medium break-words text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {options.note && (
              <p className={`flex items-start gap-2 rounded-control px-3 py-2.5 text-sm ${danger ? "bg-danger-soft text-danger" : "bg-panel text-ink-2"}`}>
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {options.note}
              </p>
            )}
            {options.input && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-ink-3">{options.input.label}</span>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={options.input.placeholder}
                  maxLength={200}
                  className="h-10 rounded-control border border-line-strong bg-surface px-3"
                />
              </label>
            )}
          </div>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

/** `const ask = useConfirm(); if (!(await ask({...})).ok) return;` */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  // Outside the back office (no provider) fall back to the browser's own dialog.
  return ask ?? (async (o) => (window.confirm(o.title) ? { ok: true, text: "" } : { ok: false }));
}
