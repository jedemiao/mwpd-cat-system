"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_DESCRIPTIONS,
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategoryValue,
} from "@/lib/activityCategories";

type Option = { id: string; name: string };

type ActivityFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  redirectTo?: string; // where to navigate after a successful save; defaults to the list view
  initialData?: {
    date?: string;
    endDate?: string;
    activityName?: string;
    category?: ActivityCategoryValue;
    location?: string;
    remarks?: string;
    officeOrderUrl?: string;
    memoUrl?: string;
    inspectionReportUrl?: string;
    assigneeIds?: string[];
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function ActivityForm({ mode, id, users, redirectTo, initialData }: ActivityFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(initialData?.date ?? "");
  const [endDate, setEndDate] = useState(initialData?.endDate ?? "");
  const [activityName, setActivityName] = useState(initialData?.activityName ?? "");
  const [category, setCategory] = useState<ActivityCategoryValue>(initialData?.category ?? "OTHERS");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [remarks, setRemarks] = useState(initialData?.remarks ?? "");
  const [officeOrderUrl, setOfficeOrderUrl] = useState(initialData?.officeOrderUrl ?? "");
  const [memoUrl, setMemoUrl] = useState(initialData?.memoUrl ?? "");
  const [inspectionReportUrl, setInspectionReportUrl] = useState(initialData?.inspectionReportUrl ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialData?.assigneeIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (assigneeIds.length === 0) {
      setError("Select at least one person incharge.");
      return;
    }

    if (endDate && endDate < date) {
      setError("End date can't be before the start date.");
      return;
    }

    setLoading(true);

    const body = {
      date,
      endDate: endDate || (mode === "create" ? undefined : null),
      activityName,
      category,
      location: location || (mode === "create" ? undefined : null),
      remarks: remarks || (mode === "create" ? undefined : null),
      officeOrderUrl: officeOrderUrl || (mode === "create" ? undefined : null),
      memoUrl: memoUrl || (mode === "create" ? undefined : null),
      inspectionReportUrl: inspectionReportUrl || (mode === "create" ? undefined : null),
      assigneeIds,
    };

    const res = await fetch(mode === "create" ? "/api/activities" : `/api/activities/${id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ? JSON.stringify(data.error) : "Something went wrong. Please try again.");
      return;
    }

    router.push(redirectTo ?? "/activities");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="date">
            Start date
          </label>
          <input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="endDate">
            End date
          </label>
          <input
            id="endDate"
            type="date"
            min={date || undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">Leave blank for a single-day activity.</p>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="activityName">
          Activity
        </label>
        <input
          id="activityName"
          type="text"
          required
          placeholder="Inspection of Overseas Corporations"
          value={activityName}
          onChange={(e) => setActivityName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="category">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ActivityCategoryValue)}
            className={inputClass}
          >
            {ACTIVITY_CATEGORIES.map((value) => {
              const description = ACTIVITY_CATEGORY_DESCRIPTIONS[value];
              return (
                <option key={value} value={value}>
                  {ACTIVITY_CATEGORY_LABELS[value]}
                  {description ? ` — ${description}` : ""}
                </option>
              );
            })}
          </select>
          {/* On Leave is absent on purpose: leave is filed in the Leave module
              and drawn onto the calendar from there. */}
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
            For leave, file it under <a href="/leave" className="text-info hover:underline">Leave</a> — it appears on the
            calendar automatically.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="location">
            Location
          </label>
          <input
            id="location"
            type="text"
            placeholder="Butuan City Hall"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Person(s) incharge</span>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-ink-400/30 p-3 dark:border-white/15">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70">
              <input type="checkbox" className="field-checkbox" checked={assigneeIds.includes(u.id)} onChange={() => toggleAssignee(u.id)} />
              {u.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="remarks">
          Remarks
        </label>
        <input id="remarks" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FileUploadField label="Office Order" value={officeOrderUrl} onChange={setOfficeOrderUrl} />
        <FileUploadField label="Memorandum" value={memoUrl} onChange={setMemoUrl} />
        <FileUploadField label="Inspection Report" value={inspectionReportUrl} onChange={setInspectionReportUrl} />
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
