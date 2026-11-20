"use client";

import { RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";

export function ErrorView({ error, retry, help = true }: { error: Error & { digest?: string }; retry: () => void; help?: boolean }) {
  const e = useI18n().t.common.error;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <h1 className="text-xl font-semibold">{e.title}</h1>
      <p className="mt-2 text-ink-2">{e.body}</p>
      {error.digest && <p className="tnum mt-3 rounded-control bg-panel px-3 py-1.5 text-xs text-ink-3">{fmt(e.code, { code: error.digest })}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {e.retry}
        </Button>
        {help && (
          <ButtonLink href="/contact" variant="secondary">
            {e.contact}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
