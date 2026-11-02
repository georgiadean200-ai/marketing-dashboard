import { LoginForm } from "@/components/LoginForm";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <span aria-hidden className="grid grid-cols-2 gap-[2px] w-[26px] h-[26px] p-[2px] rounded-[3px] bg-[var(--line)]">
            <i className="bg-[var(--ink)]" /><i className="bg-[var(--lime)]" /><i className="bg-[var(--ink)]" /><i className="bg-[var(--ink)]" />
          </span>
          <span style={{ fontFamily: '"Glancyr","Fraunces",Georgia,serif' }} className="text-[19px] text-[var(--ink)]">Marketing Studio</span>
        </div>
        <h1 style={{ fontFamily: '"Glancyr","Fraunces",Georgia,serif' }} className="text-[32px] leading-tight text-[var(--ink)] mb-2">Sign in</h1>
        <p className="text-[var(--muted)] text-sm mb-6">We&apos;ll email you a secure sign-in link. Access is by invitation.</p>
        {error && <p className="text-sm mb-4 text-[#C0392B]">That link has expired or was already used. Request a new one.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
