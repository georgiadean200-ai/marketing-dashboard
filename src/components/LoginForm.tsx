"use client";
import { useActionState } from "react";
import { sendLink } from "@/app/(site)/login/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(sendLink, { message: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">Work email
        <input name="email" type="email" required autoComplete="email"
          className="h-10 rounded-lg border border-[var(--line)] bg-white/80 dark:bg-white/5 px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--ink)]" />
      </label>
      <button disabled={pending} className="h-10 rounded-lg bg-[var(--ink)] text-[var(--bg)] text-sm font-medium disabled:opacity-50">
        {pending ? "Sending…" : "Email me a link"}
      </button>
      {state.message && <p role="status" className="text-sm text-[var(--muted)]">{state.message}</p>}
    </form>
  );
}
