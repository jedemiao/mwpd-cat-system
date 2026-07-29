"use client";

import { FormEvent, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

type Staff = { id: string; name: string; role: string };

// Division Chief / Admin tool: set a new password for a staff member who
// forgot theirs. Sits in Settings, only rendered for authorized roles (the
// real gate is the 403 in /api/account/reset-password).
export function ResetStaffPasswordForm({ staff }: { staff: Staff[] }) {
  const [userId, setUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userId) {
      setError("Select a staff member.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/account/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, newPassword }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
      return;
    }

    const name = staff.find((s) => s.id === userId)?.name ?? "the staff member";
    setSuccess(`Password reset for ${name}. Share the new password with them; they can change it later from their own Settings.`);
    setUserId("");
    setNewPassword("");
    setConfirmPassword("");
  }

  if (staff.length === 0) {
    return (
      <div className="card max-w-sm space-y-2 p-6">
        <h2 className="card-title">Reset staff password</h2>
        <p className="text-sm text-ink-500 dark:text-white/50">No other staff accounts to manage yet.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-sm space-y-4 p-6">
      <div>
        <h2 className="card-title">Reset staff password</h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-white/50">
          Use this when a staff member forgets their password. Set a new one and share it with them.
        </p>
      </div>

      <div>
        <label className="field-label" htmlFor="staffId">
          Staff member
        </label>
        <select
          id="staffId"
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="field-input"
        >
          <option value="">— Select —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="resetNewPassword">
          New password
        </label>
        <div className="relative">
          <input
            id="resetNewPassword"
            type={showNew ? "text" : "password"}
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="field-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showNew ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showNew ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="resetConfirmPassword">
          Confirm new password
        </label>
        <div className="relative">
          <input
            id="resetConfirmPassword"
            type={showConfirm ? "text" : "password"}
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="field-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showConfirm ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}
      {success && <p className="text-sm text-success-600">{success}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
