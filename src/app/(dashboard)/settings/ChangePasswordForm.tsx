"use client";

import { FormEvent, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-sm space-y-4 p-6">
      <h2 className="card-title">Change password</h2>
      <div>
        <label className="field-label" htmlFor="currentPassword">
          Current password
        </label>
        <div className="relative">
          <input
            id="currentPassword"
            type={showCurrent ? "text" : "password"}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showCurrent ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showCurrent ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="newPassword">
          New password
        </label>
        <div className="relative">
          <input
            id="newPassword"
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
        <label className="field-label" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
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
      {success && <p className="text-sm text-success-600">Password changed successfully.</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
