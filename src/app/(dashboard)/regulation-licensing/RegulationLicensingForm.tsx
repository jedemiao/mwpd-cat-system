"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientSex, RegulationLicensingService } from "@prisma/client";
import { RL_SERVICES, RL_SERVICE_LABELS } from "@/lib/regulationLicensing";

type Option = { id: string; name: string };

type RegulationLicensingFormProps = {
  mode: "create" | "edit";
  id?: string;
  staff: Option[];
  initialData?: {
    serviceDate?: string;
    personnelId?: string;
    requestingParty?: string;
    sex?: ClientSex;
    services?: RegulationLicensingService[];
    othersDetail?: string;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function RegulationLicensingForm({
  mode,
  id,
  staff,
  initialData,
}: RegulationLicensingFormProps) {
  const router = useRouter();
  const [serviceDate, setServiceDate] = useState(initialData?.serviceDate ?? "");
  const [personnelId, setPersonnelId] = useState(initialData?.personnelId ?? "");
  const [requestingParty, setRequestingParty] = useState(initialData?.requestingParty ?? "");
  // No blank default: every row on the register has one of the two ticked, and
  // an empty option would let a row be saved that the sheet cannot represent.
  const [sex, setSex] = useState<ClientSex>(initialData?.sex ?? "MALE");
  const [services, setServices] = useState<RegulationLicensingService[]>(
    initialData?.services ?? [],
  );
  const [othersDetail, setOthersDetail] = useState(initialData?.othersDetail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleService(service: RegulationLicensingService) {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(
      mode === "create" ? "/api/regulation-licensing" : `/api/regulation-licensing/${id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceDate,
          personnelId,
          requestingParty,
          sex,
          services,
          // Sent as typed; the API drops it unless OTHERS is actually
          // ticked, so the two can never disagree about whether the row
          // claims an "other".
          othersDetail: othersDetail || null,
        }),
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

    router.push("/regulation-licensing");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="serviceDate">
            Date
          </label>
          <input
            id="serviceDate"
            type="date"
            required
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="personnelId">
            Personnel
          </label>
          <select
            id="personnelId"
            required
            value={personnelId}
            onChange={(e) => setPersonnelId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="requestingParty">
            Requesting party
          </label>
          <input
            id="requestingParty"
            type="text"
            required
            value={requestingParty}
            onChange={(e) => setRequestingParty(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <span className={labelClass}>Sex</span>
          {/* Radios, not two checkboxes: the register has no way to mean both
              or neither, and the control should not offer what the record
              cannot hold. */}
          <div className="flex items-center gap-6 pt-2">
            {(["MALE", "FEMALE"] as const).map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70"
              >
                <input
                  type="radio"
                  name="sex"
                  value={value}
                  checked={sex === value}
                  onChange={() => setSex(value)}
                  className="field-checkbox"
                />
                {value === "MALE" ? "M" : "F"}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <span className={labelClass}>Service rendered</span>
        <p className="mb-2 text-xs text-ink-500 dark:text-white/40">
          Tick everything given — one caller is often served on more than one.
        </p>
        {/* One per line rather than a grid: these headings are full sentences,
            and columns would either wrap them badly or cut them off. */}
        <div className="space-y-2 rounded-md border border-ink-400/30 p-3 dark:border-white/15">
          {RL_SERVICES.map((service) => (
            <label
              key={service}
              className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70"
            >
              <input
                type="checkbox"
                className="field-checkbox"
                checked={services.includes(service)}
                onChange={() => toggleService(service)}
              />
              {RL_SERVICE_LABELS[service]}
            </label>
          ))}
        </div>

        {/* Only asked for once the tick is on: an always-visible box would
            invite a description of an "other" the row does not claim. Not
            required — the office's own column is a bare tick-box, so a row
            that ticks it and says no more is still one they can file. */}
        {services.includes("OTHERS") && (
          <div className="mt-3">
            <label className={labelClass} htmlFor="othersDetail">
              Specify the other service rendered
            </label>
            <input
              id="othersDetail"
              type="text"
              value={othersDetail}
              onChange={(e) => setOthersDetail(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
