"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { Badge } from "@/components/Badge";
import { ROLE_LABELS, ASSIGNABLE_ROLES } from "@/lib/roleLabels";
import { PASSWORD_RULE_TEXT } from "@/lib/passwordPolicy";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export type ManagedUser = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  isActive: boolean;
};

// The office roster: role changes, deactivation, and password resets, each on
// the row of the person it applies to.
//
// There is no Delete: Leave, AuditLog, IncomingRoutedStaff and ActivityAssignee
// all reference User, so a departed staff member is deactivated instead —
// access ends, their history stays readable. Every rule below is also enforced
// in /api/users/[id] and /api/account/reset-password; hiding a control here is
// convenience, not the boundary.
export function ManageAccountsTable({
  users,
  currentUserId,
  currentUserRole,
}: {
  users: ManagedUser[];
  currentUserId: string;
  currentUserRole: Role;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Which row has its reset panel open, and that panel's state. Kept as a
  // single open row rather than per-row state so a half-typed password can't
  // linger unnoticed on a row that's scrolled out of view.
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function openReset(id: string) {
    setResettingId(id);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setError(null);
    setNotice(null);
  }

  function closeReset() {
    setResettingId(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function patch(id: string, body: { role?: Role; isActive?: boolean }) {
    setBusyId(id);
    setError(null);
    setNotice(null);

    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  async function submitReset(user: ManagedUser) {
    setError(null);
    setNotice(null);

    if (password !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }

    setBusyId(user.id);
    const res = await fetch("/api/account/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, newPassword: password }),
    });
    setBusyId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
      return;
    }

    closeReset();
    setNotice(`Password reset for ${user.name}. Share it with them — they can change it from their own Settings.`);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Manage accounts</h2>
        <span className="text-xs text-ink-400 dark:text-white/30">
          {users.filter((u) => u.isActive).length} active of {users.length}
        </span>
      </div>

      {error && (
        <p className="border-b border-ink-400/10 px-5 py-3 text-sm text-danger-600 dark:border-white/10">{error}</p>
      )}
      {notice && (
        <p className="border-b border-ink-400/10 px-5 py-3 text-sm text-success-600 dark:border-white/10">{notice}</p>
      )}

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              // A Chief can't touch an Admin, and nobody edits their own row
              // here — changing your own role or status mid-session is how you
              // lock yourself out of this very screen, and your own password
              // is changed above (which requires the current one).
              const locked = isSelf || (currentUserRole !== "ADMIN" && user.role === "ADMIN");
              const busy = busyId === user.id;
              const isResetting = resettingId === user.id;

              return (
                <Fragment key={user.id}>
                  <tr className={user.isActive ? "" : "opacity-60"}>
                    <td>
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs text-ink-400 dark:text-white/30">(you)</span>}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">{user.username}</td>
                    <td className="text-xs">{user.email ?? "—"}</td>
                    <td>
                      {locked ? (
                        ROLE_LABELS[user.role]
                      ) : (
                        <select
                          value={user.role}
                          disabled={busy}
                          onChange={(e) => patch(user.id, { role: e.target.value as Role })}
                          className="field-input w-auto py-1 text-xs"
                          aria-label={`Role for ${user.name}`}
                        >
                          {ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" || currentUserRole === "ADMIN").map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {user.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Deactivated</Badge>}
                    </td>
                    <td>
                      {!locked && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => (isResetting ? closeReset() : openReset(user.id))}
                            className="btn-secondary btn-sm"
                          >
                            {isResetting ? "Cancel" : "Reset password"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patch(user.id, { isActive: !user.isActive })}
                            className={user.isActive ? "btn-danger-outline btn-sm" : "btn-secondary btn-sm"}
                          >
                            {busy ? "…" : user.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {isResetting && (
                    <tr>
                      <td colSpan={6} className="bg-surface dark:bg-white/[0.03]">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitReset(user);
                          }}
                          className="flex flex-wrap items-end gap-3 py-1"
                        >
                          <div className="w-56">
                            <label className="field-label" htmlFor={`pw-${user.id}`}>
                              New password for {user.name}
                            </label>
                            <div className="relative">
                              <input
                                id={`pw-${user.id}`}
                                type={showPassword ? "text" : "password"}
                                required
                                autoFocus
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
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
                          </div>

                          <div className="w-56">
                            <label className="field-label" htmlFor={`pw2-${user.id}`}>
                              Confirm password
                            </label>
                            <input
                              id={`pw2-${user.id}`}
                              type={showPassword ? "text" : "password"}
                              required
                              autoComplete="new-password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="field-input"
                            />
                          </div>

                          <button type="submit" disabled={busy} className="btn-primary btn-sm">
                            {busy ? "Resetting…" : "Set password"}
                          </button>

                          <p className="w-full text-xs text-ink-500 dark:text-white/40">{PASSWORD_RULE_TEXT}</p>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-ink-400/10 px-5 py-3 text-xs text-ink-500 dark:border-white/10 dark:text-white/40">
        Deactivating an account blocks sign-in but keeps every record, activity and audit entry that account created.
      </p>
    </div>
  );
}
