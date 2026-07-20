"use client";

import { FormEvent, Suspense, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/incoming";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <form onSubmit={handleSubmit} className="card w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-ink-400/15 bg-white dark:border-white/10">
          <Image src="/dmw_logo.png" alt="DMW logo" width={64} height={64} priority className="h-16 w-16" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-ink-900 dark:text-white">MWPtD Tracker</p>
          <p className="text-xs text-ink-500 dark:text-white/40">Sign in to continue</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
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
              type={showPassword ? "text" : "password"}
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
        {error && <p className="badge-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-surface p-8 dark:bg-ink-900">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
