"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { ROLE_LABELS, ASSIGNABLE_ROLES } from "@/lib/roleLabels";
import { PASSWORD_RULE_TEXT } from "@/lib/passwordPolicy";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

// Division Chief / Admin tool: create a sign-in for a new staff member. The
// account always lands in the creator's own office — officeId is taken from
// the session server-side and is not a field here.
//
// Unlike the PHP tracker's equivalent screen, full name is required: that
// form captured only username and email, which is why every row in their
// account list reads "N/A" for personnel info.
export function CreateAccountForm({ currentUserRole }: { currentUserRole: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only an Admin can mint another Admin; the route enforces this too, this
  // just avoids offering an option that would be rejected.
  const roles = ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" || currentUserRole === "ADMIN");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, email, role, password }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
      return;
    }

    setSuccess(`Account created for ${name}. Share the username and password with them — they can change it from their own Settings.`);
    setName("");
    setUsername("");
    setEmail("");
    setRole("STAFF");
    setPassword("");
    setConfirmPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-sm space-y-4 p-6">
      <div>
        <h2 className="card-title">Create account</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-white/50">
          Set up sign-in access for a new member of this office.
        </p>
      </div>

      <div>
        <label className="field-label" htmlFor="newName">
          Full name
        </label>
        <input
          id="newName"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Juan Dela Cruz"
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="newUsername">
          Username
        </label>
        <input
          id="newUsername"
          type="text"
          required
          minLength={3}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="juan.delacruz"
          autoComplete="off"
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="newEmail">
          Email <span className="normal-case text-ink-400 dark:text-white/30">(optional)</span>
        </label>
        <input
          id="newEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="juan.delacruz@dmw.gov.ph"
          autoComplete="off"
          className="field-input"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="newRole">
          Role
        </label>
        <select id="newRole" value={role} onChange={(e) => setRole(e.target.value as Role)} className="field-input">
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="newPassword2">
          Temporary password
        </label>
        <div className="relative">
          <input
            id="newPassword2"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="field-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-500 dark:text-white/40">{PASSWORD_RULE_TEXT}</p>
      </div>

      <div>
        <label className="field-label" htmlFor="newConfirmPassword">
          Confirm password
        </label>
        <input
          id="newConfirmPassword"
          type={showPassword ? "text" : "password"}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="field-input"
        />
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}
      {success && <p className="text-sm text-success-600">{success}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
