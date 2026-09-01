"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SENA_STATUSES,
  SENA_STATUS_LABELS,
  CONFERENCE_TIME_SLOTS,
  formatConferenceTime,
  conferenceOrdinal,
  statusCarriesAmount,
  type SenaStatusValue,
} from "@/lib/senaSchedule";

type Option = { id: string; name: string };
type PriorConference = { id: string; label: string };

type SenaFormProps = {
  mode: "create" | "edit";
  id?: string;
  /** Active staff roster — the sheet's Mediator/Conciliator dropdown. */
  users: Option[];
  /**
   * Conferences this one can be filed as a follow-up to. Already excludes the
   * record being edited, so a conference cannot be offered itself.
   */
  priorConferences: PriorConference[];
  initialData?: {
    conferenceDate?: string;
    conferenceTime?: string;
    conferenceNumber?: number;
    mediatorId?: string;
    complainant?: string;
    respondent?: string;
    status?: SenaStatusValue;
    amountSettled?: string;
    previousConferenceId?: string;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function SenaForm({ mode, id, users, priorConferences, initialData }: SenaFormProps) {
  const router = useRouter();
  const [conferenceDate, setConferenceDate] = useState(initialData?.conferenceDate ?? "");
  const [conferenceTime, setConferenceTime] = useState(initialData?.conferenceTime ?? "10:00");
  const [conferenceNumber, setConferenceNumber] = useState(initialData?.conferenceNumber ?? 1);
  const [mediatorId, setMediatorId] = useState(initialData?.mediatorId ?? "");
  const [complainant, setComplainant] = useState(initialData?.complainant ?? "");
  const [respondent, setRespondent] = useState(initialData?.respondent ?? "");
  const [status, setStatus] = useState<SenaStatusValue>(initialData?.status ?? "SCHEDULED");
  const [amountSettled, setAmountSettled] = useState(initialData?.amountSettled ?? "");
  const [previousConferenceId, setPreviousConferenceId] = useState(
    initialData?.previousConferenceId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The amount box only appears for a settlement — the API clears the figure
  // for every other status anyway, and showing a peso field beside "Withdrawn"
  // invites someone to fill it in and wonder where it went.
  const showAmount = statusCarriesAmount(status);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = {
      conferenceDate,
      conferenceTime,
      conferenceNumber,
      mediatorId,
      complainant,
      respondent,
      status,
      amountSettled: showAmount ? amountSettled || null : null,
      // Empty clears the link on edit rather than being left alone, so a row
      // mistakenly filed under the wrong first conference can be detached.
      previousConferenceId: previousConferenceId || (mode === "edit" ? null : undefined),
    };

    const res = await fetch(mode === "create" ? "/api/sena" : `/api/sena/${id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(
        typeof data?.error === "string"
          ? data.error
          : data?.error
            ? JSON.stringify(data.error)
            : "Something went wrong. Please try again.",
      );
      return;
    }

    router.push("/sena");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass} htmlFor="conferenceDate">
            Date
          </label>
          <input
            id="conferenceDate"
            type="date"
            required
            value={conferenceDate}
            onChange={(e) => setConferenceDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="conferenceTime">
            Time
          </label>
          <select
            id="conferenceTime"
            required
            value={conferenceTime}
            onChange={(e) => setConferenceTime(e.target.value)}
            className={inputClass}
          >
            {CONFERENCE_TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {formatConferenceTime(slot)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="conferenceNumber">
            Conference
          </label>
          <select
            id="conferenceNumber"
            required
            value={conferenceNumber}
            onChange={(e) => setConferenceNumber(Number(e.target.value))}
            className={inputClass}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {conferenceOrdinal(n)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="mediatorId">
          Mediator / Conciliator
        </label>
        <select
          id="mediatorId"
          required
          value={mediatorId}
          onChange={(e) => setMediatorId(e.target.value)}
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
          <label className={labelClass} htmlFor="complainant">
            Complainant
          </label>
          <input
            id="complainant"
            type="text"
            required
            value={complainant}
            onChange={(e) => setComplainant(e.target.value)}
            className={inputClass}
            placeholder="Worker's name"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="respondent">
            Respondent
          </label>
          <input
            id="respondent"
            type="text"
            required
            value={respondent}
            onChange={(e) => setRespondent(e.target.value)}
            className={inputClass}
            placeholder="Agency or employer"
          />
        </div>
      </div>

      <div className={showAmount ? "grid grid-cols-2 gap-4" : ""}>
        <div>
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SenaStatusValue)}
            className={inputClass}
          >
            {SENA_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SENA_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {showAmount && (
          <div>
            <label className={labelClass} htmlFor="amountSettled">
              Amount settled
            </label>
            <input
              id="amountSettled"
              type="number"
              step="0.01"
              min="0"
              value={amountSettled}
              onChange={(e) => setAmountSettled(e.target.value)}
              className={inputClass}
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      {/* The link the sheet cannot express. Optional on purpose: a first
          conference has nothing to point at, and a follow-up whose original
          predates the system has nothing to find. */}
      {conferenceNumber > 1 && (
        <div>
          <label className={labelClass} htmlFor="previousConferenceId">
            Follows on from
          </label>
          <select
            id="previousConferenceId"
            value={previousConferenceId}
            onChange={(e) => setPreviousConferenceId(e.target.value)}
            className={inputClass}
          >
            <option value="">— Not linked —</option>
            {priorConferences.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
            Links this conference to the earlier one for the same case, so the
            register can show the case's full history and count a settlement once.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-50 px-4 py-3 text-sm text-danger-600 dark:border-danger/20 dark:bg-danger/10">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Saving…" : mode === "create" ? "Record conference" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
