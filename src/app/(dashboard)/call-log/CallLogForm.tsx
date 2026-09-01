"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CallLogFormProps = {
  mode: "create" | "edit";
  id?: string;
  initialData?: {
    callDate?: string;
    phoneNumber?: string;
    callerName?: string;
    concern?: string;
    remarks?: string;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function CallLogForm({ mode, id, initialData }: CallLogFormProps) {
  const router = useRouter();
  // Defaults to today: calls are logged as they come in, so the common case is
  // the one that needs no typing.
  const [callDate, setCallDate] = useState(
    initialData?.callDate ?? new Date().toISOString().slice(0, 10),
  );
  const [phoneNumber, setPhoneNumber] = useState(initialData?.phoneNumber ?? "");
  const [callerName, setCallerName] = useState(initialData?.callerName ?? "");
  const [concern, setConcern] = useState(initialData?.concern ?? "");
  const [remarks, setRemarks] = useState(initialData?.remarks ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = {
      callDate,
      phoneNumber,
      callerName,
      concern,
      remarks: remarks || (mode === "edit" ? null : undefined),
    };

    const res = await fetch(mode === "create" ? "/api/call-log" : `/api/call-log/${id}`, {
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

    router.push("/call-log");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="callDate">
            Date
          </label>
          <input
            id="callDate"
            type="date"
            required
            value={callDate}
            onChange={(e) => setCallDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="phoneNumber">
            Number
          </label>
          {/* type="text", not "tel" or "number": a leading zero is part of the
              number here, and a numeric input drops it. */}
          <input
            id="phoneNumber"
            type="text"
            inputMode="numeric"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="09xxxxxxxxx"
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="callerName">
          Name
        </label>
        <input
          id="callerName"
          type="text"
          required
          value={callerName}
          onChange={(e) => setCallerName(e.target.value)}
          className={inputClass}
          placeholder="Caller's name, or UNKNOWN"
        />
        <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
          UNKNOWN is a normal entry — the call still happened, the caller just
          didn&apos;t give a name.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="concern">
          Concern
        </label>
        <input
          id="concern"
          type="text"
          required
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          className={inputClass}
          placeholder="What the call was about"
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="remarks">
          Remarks
        </label>
        <input
          id="remarks"
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className={inputClass}
          placeholder="What was done — advice given, forwarded, endorsed…"
        />
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-50 px-4 py-3 text-sm text-danger-600 dark:border-danger/20 dark:bg-danger/10">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Saving…" : mode === "create" ? "Log call" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
