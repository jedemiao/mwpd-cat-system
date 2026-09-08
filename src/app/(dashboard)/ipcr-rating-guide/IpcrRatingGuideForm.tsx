"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { IpcrRatingDimension } from "@prisma/client";
import type { DipcrSemesterValue } from "@/lib/dipcr";
import {
  DIMENSION_LABELS,
  RATING_DIMENSIONS,
  RATING_LEVELS,
  levelHeading,
  type RatingLevel,
} from "@/lib/ipcrRatingGuide";

type Option = { id: string; name: string };

type DescriptorState = Record<IpcrRatingDimension, Record<RatingLevel, string>>;

type IpcrRatingGuideFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  initialData?: {
    year?: number;
    semester?: DipcrSemesterValue;
    section?: string;
    pap?: string;
    successIndicator?: string;
    meansOfVerification?: string;
    sortOrder?: number;
    accountableIds?: string[];
    descriptors?: {
      dimension: IpcrRatingDimension;
      level5: string | null;
      level4: string | null;
      level3: string | null;
      level2: string | null;
      level1: string | null;
    }[];
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

/** Every dimension × every level, so a box always has a string behind it. */
function emptyDescriptors(): DescriptorState {
  return Object.fromEntries(
    RATING_DIMENSIONS.map((d) => [
      d,
      Object.fromEntries(RATING_LEVELS.map((l) => [l, ""])) as Record<RatingLevel, string>,
    ]),
  ) as DescriptorState;
}

export function IpcrRatingGuideForm({ mode, id, users, initialData }: IpcrRatingGuideFormProps) {
  const router = useRouter();
  const [year, setYear] = useState(initialData?.year ?? new Date().getFullYear());
  const [semester, setSemester] = useState<DipcrSemesterValue>(initialData?.semester ?? "SECOND");
  const [section, setSection] = useState(initialData?.section ?? "CORE FUNCTIONS");
  const [pap, setPap] = useState(initialData?.pap ?? "");
  const [successIndicator, setSuccessIndicator] = useState(initialData?.successIndicator ?? "");
  const [meansOfVerification, setMeansOfVerification] = useState(
    initialData?.meansOfVerification ?? "",
  );
  const [sortOrder, setSortOrder] = useState(initialData?.sortOrder ?? 0);
  const [accountableIds, setAccountableIds] = useState<string[]>(initialData?.accountableIds ?? []);
  // Held as the full 3 × 5 grid even where the stored row has only one
  // dimension, so typing into an unused dimension needs no "add" step. The
  // server drops whatever is still blank on save.
  const [descriptors, setDescriptors] = useState<DescriptorState>(() => {
    const state = emptyDescriptors();
    for (const d of initialData?.descriptors ?? []) {
      for (const level of RATING_LEVELS) {
        state[d.dimension][level] = d[`level${level}` as const] ?? "";
      }
    }
    return state;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleAccountable(userId: string) {
    setAccountableIds((prev) =>
      prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId],
    );
  }

  function setDescriptor(dimension: IpcrRatingDimension, level: RatingLevel, value: string) {
    setDescriptors((prev) => ({
      ...prev,
      [dimension]: { ...prev[dimension], [level]: value },
    }));
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
      meansOfVerification: meansOfVerification.trim() ? meansOfVerification : null,
      sortOrder: Number(sortOrder) || 0,
      accountableIds,
      // All three dimensions are always sent. A dimension whose five boxes are
      // empty is dropped server-side, which is how "not rated on this" is
      // expressed — see usedDescriptors.
      descriptors: RATING_DIMENSIONS.map((dimension) => ({
        dimension,
        level5: descriptors[dimension][5],
        level4: descriptors[dimension][4],
        level3: descriptors[dimension][3],
        level2: descriptors[dimension][2],
        level1: descriptors[dimension][1],
      })),
    };

    const res = await fetch(
      mode === "create" ? "/api/ipcr-rating-guide" : `/api/ipcr-rating-guide/${id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

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

    router.push(`/ipcr-rating-guide?year=${year}&semester=${semester}`);
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
            placeholder="MOU/MOA partnerships forged with LGUs"
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
          placeholder="One (1) MOU/MOA forged with LGUs and other stakeholders on or before December 15, 2026."
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="meansOfVerification">
          Means of verification
        </label>
        <textarea
          id="meansOfVerification"
          rows={2}
          value={meansOfVerification}
          onChange={(e) => setMeansOfVerification(e.target.value)}
          placeholder="signed MOA, Attendance Sheet, FB post"
          className={inputClass}
        />
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
        <span className={labelClass}>Rating guide</span>
        <p className="mb-3 text-xs text-ink-500 dark:text-white/40">
          What each score will be taken to mean for this indicator. Leave a whole dimension blank
          where the indicator is not rated on it — the sheet does this for Timeliness on most rows.
        </p>

        <div className="space-y-5">
          {RATING_DIMENSIONS.map((dimension) => (
            <fieldset
              key={dimension}
              className="rounded-md border border-ink-400/30 p-3 dark:border-white/15"
            >
              <legend className="px-1 text-sm font-semibold text-ink-900 dark:text-white">
                {DIMENSION_LABELS[dimension]}
              </legend>
              <div className="space-y-2">
                {RATING_LEVELS.map((level) => (
                  <div key={level}>
                    <label className={labelClass} htmlFor={`${dimension}-${level}`}>
                      {levelHeading(level)}
                    </label>
                    <textarea
                      id={`${dimension}-${level}`}
                      rows={2}
                      value={descriptors[dimension][level]}
                      onChange={(e) => setDescriptor(dimension, level, e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
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
