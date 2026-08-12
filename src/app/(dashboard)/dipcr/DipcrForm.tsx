"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { monthName, semesterMonths, type DipcrSemesterValue } from "@/lib/dipcr";

type Option = { id: string; name: string };

type DipcrFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  initialData?: {
    year?: number;
    semester?: DipcrSemesterValue;
    section?: string;
    pap?: string;
    successIndicator?: string;
    allottedBudget?: string;
    remarks?: string;
    sortOrder?: number;
    accountableIds?: string[];
    accomplishments?: { month: number; narrative: string }[];
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function DipcrForm({ mode, id, users, initialData }: DipcrFormProps) {
  const router = useRouter();
  const [year, setYear] = useState(initialData?.year ?? new Date().getFullYear());
  const [semester, setSemester] = useState<DipcrSemesterValue>(initialData?.semester ?? "SECOND");
  const [section, setSection] = useState(initialData?.section ?? "CORE FUNCTIONS");
  const [pap, setPap] = useState(initialData?.pap ?? "");
  const [successIndicator, setSuccessIndicator] = useState(initialData?.successIndicator ?? "");
  const [allottedBudget, setAllottedBudget] = useState(initialData?.allottedBudget ?? "");
  const [remarks, setRemarks] = useState(initialData?.remarks ?? "");
  const [sortOrder, setSortOrder] = useState(initialData?.sortOrder ?? 0);
  const [accountableIds, setAccountableIds] = useState<string[]>(initialData?.accountableIds ?? []);
  // Keyed by calendar month so switching semester re-labels the boxes without
  // moving what has already been typed onto the wrong month.
  const [cells, setCells] = useState<Record<number, string>>(() =>
    Object.fromEntries((initialData?.accomplishments ?? []).map((a) => [a.month, a.narrative])),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const months = semesterMonths(semester);

  function toggleAccountable(userId: string) {
    setAccountableIds((prev) =>
      prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = {
      year: Number(year),
      semester,
      section,
      pap,
      successIndicator,
      // The API wants a plain money string or null. Commas typed out of habit
      // are stripped rather than rejected — "247,437.00" is how the sheet
      // writes it and how anyone copying from it will type it.
      allottedBudget: allottedBudget.trim() ? allottedBudget.replace(/,/g, "").trim() : null,
      remarks: remarks.trim() ? remarks : null,
      sortOrder: Number(sortOrder) || 0,
      accountableIds,
      // Only the months of the chosen semester are sent: a narrative left
      // behind by switching semester mid-edit is not part of this row.
      accomplishments: months.map((m) => ({ month: m, narrative: cells[m] ?? "" })),
    };

    const res = await fetch(mode === "create" ? "/api/dipcr" : `/api/dipcr/${id}`, {
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

    router.push(`/dipcr?year=${year}&semester=${semester}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-3xl space-y-4 p-6">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass} htmlFor="year">
            Year
          </label>
          <input
            id="year"
            type="number"
            required
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="semester">
            Semester
          </label>
          <select
            id="semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value as DipcrSemesterValue)}
            className={inputClass}
          >
            <option value="FIRST">1st (Jan–Jun)</option>
            <option value="SECOND">2nd (Jul–Dec)</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="sortOrder">
            Order within PAP
          </label>
          <input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">Lower numbers sit higher.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="section">
            Section
          </label>
          <input
            id="section"
            type="text"
            required
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pap">
            Organizational outcome / PAP
          </label>
          <input
            id="pap"
            type="text"
            required
            value={pap}
            onChange={(e) => setPap(e.target.value)}
            placeholder="Forging of MOU/MOA Partnerships"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="successIndicator">
          Success indicator (target + measure)
        </label>
        <textarea
          id="successIndicator"
          required
          rows={2}
          value={successIndicator}
          onChange={(e) => setSuccessIndicator(e.target.value)}
          placeholder="3 AIRTIP trainings and seminars conducted, as scheduled"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="allottedBudget">
            Allotted budget
          </label>
          <input
            id="allottedBudget"
            type="text"
            inputMode="decimal"
            value={allottedBudget}
            onChange={(e) => setAllottedBudget(e.target.value)}
            placeholder="247,437.00"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
            Leave blank where the sheet has no figure.
          </p>
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
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Division / individuals accountable</span>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-ink-400/30 p-3 dark:border-white/15">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70">
              <input
                type="checkbox"
                className="field-checkbox"
                checked={accountableIds.includes(u.id)}
                onChange={() => toggleAccountable(u.id)}
              />
              {u.name}
            </label>
          ))}
        </div>
      </div>

      <hr className="border-ink-400/15 dark:border-white/10" />

      <div>
        <span className={labelClass}>Actual accomplishments</span>
        <p className="mb-2 text-xs text-ink-500 dark:text-white/40">
          One box per month of the chosen semester. Leave a month blank until there is something to
          record.
        </p>
        <div className="space-y-3">
          {months.map((m) => (
            <div key={m}>
              <label className={labelClass} htmlFor={`month-${m}`}>
                {monthName(m)}
              </label>
              <textarea
                id={`month-${m}`}
                rows={2}
                value={cells[m] ?? ""}
                onChange={(e) => setCells((prev) => ({ ...prev, [m]: e.target.value }))}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
