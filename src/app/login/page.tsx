"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { signIn, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/incoming";
  const disabled = searchParams.get("disabled") === "1";
  const stale = searchParams.get("stale") === "1";

  // The dashboard layout bounces both cases here with the cookie still in the
  // browser. Clear it so they land on a clean sign-in rather than bouncing off
  // the dashboard on every click.
  useEffect(() => {
    if (disabled || stale) void signOut({ redirect: false });
  }, [disabled, stale]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", { username, password, redirect: false });

    setLoading(false);

    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="relative flex items-center justify-center p-6 sm:p-10">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        {/* Compact brand lockup for narrow screens where the side panel is hidden */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-ink-400/15 bg-white dark:border-white/10">
            <Image src="/dmw_logo.png" alt="DMW logo" width={48} height={48} priority className="h-10 w-10" />
          </span>
          <p className="font-display text-base font-bold leading-tight text-ink-900 dark:text-white">
            DMW Regional
            <br />
            Office XIII
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <h2 className="font-display text-[26px] font-extrabold tracking-tight text-ink-900 dark:text-white">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-ink-500 dark:text-white/50">Enter your credentials to continue.</p>

          {disabled && (
            <div className="mb-4 rounded-md border border-warning/30 bg-warning-50 px-4 py-3 text-sm text-ink-700 dark:border-warning/20 dark:bg-warning/10 dark:text-white/70">
              This account has been deactivated. Contact your Division Chief if you think this is a mistake.
            </div>
          )}

          {stale && (
            <div className="mb-4 rounded-md border border-info/30 bg-info-50 px-4 py-3 text-sm text-ink-700 dark:border-info/20 dark:bg-info/10 dark:text-white/70">
              Your previous sign-in has expired. Please sign in again.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 dark:text-white/30 dark:hover:text-white/70"
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowReset((v) => !v)}
                className="text-[13px] text-primary underline decoration-1 underline-offset-2 hover:text-primary-600"
              >
                Forgot password?
              </button>
            </div>
            {showReset && (
              <p className="text-xs text-ink-500 dark:text-white/50">
                Ask your Division Chief to reset your password — they can set a new one for you from Settings.
              </p>
            )}

            {error && <p className="text-sm text-danger-600">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary mt-2 h-11 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>

          <hr className="my-5 border-ink-400/15 dark:border-white/10" />
          <p className="text-xs text-ink-500 dark:text-white/40">
            Authorized use only. All access is logged and monitored.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-surface dark:bg-ink-900 lg:grid-cols-[minmax(320px,420px)_1fr]">
      {/* Brand panel — the register's civic identity. Wears the office's dress
          code for the day (src/lib/dressCode.ts), set as data-day by the server
          layout beside this file; on Monday it inverts to dark text on piña
          cream, exactly as the sidebar does. Hidden on narrow screens (see the
          compact lockup in the form column). */}
      <aside className="hidden flex-col justify-between bg-day dress-surface p-10 text-dayfg lg:flex xl:p-12">
        <div className="flex items-center gap-4">
          <Image
            src="/dmw_logo.png"
            alt="Department of Migrant Workers seal"
            width={40}
            height={40}
            priority
            className="h-10 w-10 shrink-0 rounded-full bg-white"
          />
          {/* Just the department here — the regional office is the headline
              below, and repeating it in both places reads as a mistake. */}
          <p className="text-[12px] uppercase leading-tight tracking-[0.04em] text-dayfg/90">
            <span className="whitespace-nowrap">Department of Migrant Workers</span>
          </p>
        </div>

        <div>
          {/* Named for the regional office, not a division: all four divisions
              share this one instance, so nobody has signed in yet at this point
              and there is no office to personalise the page with. Sized a step
              down from the old two-word name — this one is 24 characters and
              would otherwise overflow the panel at the narrow end of lg. */}
          <h1 className="max-w-[12ch] font-display text-4xl font-extrabold leading-[1.05] text-dayfg xl:text-5xl">
            DMW Regional Office XIII
          </h1>
          <div className="my-5 h-0.5 w-16 bg-dayfg/40" />
          <p className="max-w-[34ch] text-dayfg/85">
            Caraga — communication and activity records tracker.
          </p>
        </div>

        <p className="text-xs tracking-[0.06em] text-dayfg/60">REPUBLIC OF THE PHILIPPINES</p>
      </aside>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
