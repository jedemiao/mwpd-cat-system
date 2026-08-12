"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

type DtrFormProps = {
  mode: "create" | "edit";
  id?: string;
  /** Active staff roster — the sheet's Name dropdown. */
  users: Option[];
  initialData?: {
    periodMonth?: string;
    dateReceived?: string;
    dateFiled?: string;
    dateSubmittedToHr?: string;
    personnelId?: string;
    submittedAndChecked?: boolean;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function DtrForm({ mode, id, users, initialData }: DtrFormProps) {
  const router = useRouter();
  const [periodMonth, setPeriodMonth] = useState(initialData?.periodMonth ?? "");
  const [dateReceived, setDateReceived] = useState(initialData?.dateReceived ?? "");
  const [dateFiled, setDateFiled] = useState(initialData?.dateFiled ?? "");
  const [dateSubmittedToHr, setDateSubmittedToHr] = useState(initialData?.dateSubmittedToHr ?? "");
  const [personnelId, setPersonnelId] = useState(initialData?.personnelId ?? "");
  const [submittedAndChecked, setSubmittedAndChecked] = useState(initialData?.submittedAndChecked ?? false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = {
      periodMonth,
      personnelId,
      submittedAndChecked,
      // Empty means "not yet", which is a real state here — a DTR can be filed
      // before it reaches HR. On edit those clear the stored value rather than
      // being omitted, so a date entered by mistake can be taken back out.
      dateReceived: dateReceived || (mode === "edit" ? null : undefined),
      dateFiled: dateFiled || (mode === "edit" ? null : undefined),
      dateSubmittedToHr: dateSubmittedToHr || (mode === "edit" ? null : undefined),
    };

    const res = await fetch(mode === "create" ? "/api/dtr" : `/api/dtr/${id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      // The duplicate-month message from the API is written for a person to
      // read ("X already has a DTR recorded for that month"), so it is shown
      // as-is rather than stringified like a validation blob.
      setError(
        typeof data?.error === "string"
          ? data.error
          : data?.error
            ? JSON.stringify(data.error)
            : "Something went wrong. Please try again.",
      );
      return;
    }

    router.push(`/dtr?month=${periodMonth}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="periodMonth">
            For the month of
          </label>
          <input
            id="periodMonth"
            type="month"
            required
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
            The month the DTR covers, not the month it was filed.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="dateReceived">
            Date received
          </label>
          <input
            id="dateReceived"
            type="date"
            value={dateReceived}
            onChange={(e) => setDateReceived(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="personnelId">
          Name
        </label>
        <select
          id="personnelId"
          required
          value={personnelId}
          onChange={(e) => setPersonnelId(e.target.value)}
          className={inputClass}
        >
          <option value="">— Select staff —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="dateFiled">
            Date filed
          </label>
          <input
            id="dateFiled"
            type="date"
            value={dateFiled}
            onChange={(e) => setDateFiled(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="dateSubmittedToHr">
            Date submitted to HR
          </label>
          <input
            id="dateSubmittedToHr"
            type="date"
            value={dateSubmittedToHr}
            onChange={(e) => setDateSubmittedToHr(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70">
        <input
          type="checkbox"
          className="field-checkbox"
          checked={submittedAndChecked}
          onChange={(e) => setSubmittedAndChecked(e.target.checked)}
        />
        Submitted and checked
      </label>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Record" : "Save changes"}
      </button>
    </form>
  );
}
