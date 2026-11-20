"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { useI18n } from "@/i18n/client";
import { loginAction, verifyLoginCodeAction, type LoginState, type TotpState } from "@/server/actions/auth";

/** Second step for employees who turned on an authenticator app. */
function CodeStep({ onRestart }: { onRestart: () => void }) {
  const c = useI18n().t.console;
  const [state, action, pending] = useActionState<TotpState, FormData>(verifyLoginCodeAction, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
      <p className="text-ink-2">{c.codePrompt}</p>
      <FormError message={state.error} />
      {state.expired ? (
        <button type="button" onClick={onRestart} className="self-start font-semibold text-brand hover:underline">
          {c.again}
        </button>
      ) : (
        <>
          <Field label={c.code} htmlFor="code">
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required className="tnum text-center text-lg tracking-[0.4em]" />
          </Field>
          <Button type="submit" size="lg" loading={pending}>
            {c.verify}
          </Button>
        </>
      )}
    </form>
  );
}

/** Employee sign-in with username and password. Starting over after an expired code step remounts both steps. */
export function LoginForm({ next }: { next: string }) {
  const [attempt, setAttempt] = useState(0);
  return <PasswordStep key={attempt} next={next} onRestart={() => setAttempt((n) => n + 1)} />;
}

function PasswordStep({ next, onRestart }: { next: string; onRestart: () => void }) {
  const c = useI18n().t.console;
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [show, setShow] = useState(false);
  if (state.challenge) return <CodeStep onRestart={onRestart} />;
  return (
    <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <Field label={c.username} htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={state.identifier} required aria-invalid={!!state.error || undefined} />
      </Field>
      <Field label={c.password} htmlFor="password">
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="pr-12" aria-invalid={!!state.error || undefined} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-control text-ink-3 hover:text-ink"
            aria-label={show ? c.hidePassword : c.showPassword}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        {c.submit}
      </Button>
    </form>
  );
}
