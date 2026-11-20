"use client";

import { useI18n } from "@/i18n/client";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/admin/confirm";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { changeStaffPasswordAction, confirmTotpSetupAction, disableTotpAction, startTotpSetupAction } from "@/server/actions/account";

export function PasswordForm({ forced }: { forced: boolean }) {
  const sc = useI18n().t.admin.people.security;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changeStaffPasswordAction(v.current, v.next, v.confirm);
          if (!r.ok) {
            setError(r.error);
            setErrors(r.fieldErrors ?? {});
            return;
          }
          setError(null);
          setErrors({});
          setV({ current: "", next: "", confirm: "" });
          toast.success(r.message ?? sc.changed);
          if (forced) router.replace("/");
        });
      }}
    >
      <FormError message={error} />
      <Field label={forced ? sc.tempPassword : sc.current} htmlFor="pw-current" error={errors.current}>
        <Input id="pw-current" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />
      </Field>
      <Field label={sc.newPassword} htmlFor="pw-next" hint={sc.hint} error={errors.next}>
        <Input id="pw-next" type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />
      </Field>
      <Field label={sc.confirm} htmlFor="pw-confirm" error={errors.confirm}>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {sc.submit}
      </Button>
    </form>
  );
}

export function TotpSetup({
  enabled,
  required = false,
}: {
  enabled: boolean;
  /** the site requires 2-step for all staff: no turning it off */ required?: boolean;
}) {
  const { t } = useI18n();
  const sc = t.admin.people.security;
  const ask = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  if (enabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="inline-flex items-center gap-2 font-medium text-success">
          <ShieldCheck className="size-5" aria-hidden="true" />
          {sc.enabledNote}
        </p>
        {required ? (
          <p className="text-sm text-ink-2">{sc.lockedOn}</p>
        ) : (
          <Field label={sc.turnOff} htmlFor="totp-off" hint={sc.turnOffHint}>
            <div className="flex gap-2">
              <Input id="totp-off" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button
                variant="dangerGhost"
                loading={pending}
                onClick={async () => {
                  const k = t.admin.shell.confirm;
                  const answer = await ask({ title: k.disableTotp, tone: "danger", note: k.disableTotpNote, confirmLabel: sc.off });
                  if (!answer.ok) return;
                  start(async () => {
                    const r = await disableTotpAction(password);
                    if (!r.ok) return toast.error(r.error);
                    toast.success(r.message ?? sc.turnedOff);
                    // Turning it off signs out every session; the employee signs back in at /login.
                    router.replace("/login?next=/");
                  });
                }}
              >
                {sc.off}
              </Button>
            </div>
          </Field>
        )}
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-2">{sc.intro}</p>
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await startTotpSetupAction();
              if (r.ok) setSetup(r.data);
              else toast.error(r.error);
            })
          }
        >
          {sc.start}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await confirmTotpSetupAction(setup.secret, code);
          if (!r.ok) return toast.error(r.error);
          toast.success(r.message ?? sc.turnedOn);
          setSetup(null);
          router.refresh();
        });
      }}
    >
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-ink-2">
        <li>
          {sc.scan}
          <Image src={setup.qr} alt={sc.qrAlt} width={180} height={180} unoptimized className="mt-2 rounded-control border border-line bg-white p-1" />
          <span className="mt-2 block">
            {sc.orType} <code className="tnum rounded bg-panel px-1.5 py-0.5 text-xs break-all text-ink">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </span>
        </li>
        <li>{sc.enterCode}</li>
      </ol>
      <div className="flex gap-2">
        <Input
          aria-label={sc.codeLabel}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="max-w-40 tracking-[0.3em]"
        />
        <Button type="submit" loading={pending} disabled={code.length !== 6}>
          {sc.confirmOn}
        </Button>
      </div>
    </form>
  );
}
