"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientSex, LegalAssistanceForm as AssistanceForm } from "@prisma/client";
import { ASSISTANCE_FORMS, FORM_LABELS } from "@/lib/legalAssistance";
import { FileUploadField } from "@/components/FileUploadField";

type Option = { id: string; name: string };

type LegalAssistanceFormProps = {
  mode: "create" | "edit";
  id?: string;
  officers: Option[];
  initialData?: {
    assistanceDate?: string;
    legalOfficerId?: string;
    clientName?: string;
    sex?: ClientSex;
    forms?: AssistanceForm[];
    othersDetail?: string;
    scannedCopyUrl?: string;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function LegalAssistanceForm({ mode, id, officers, initialData }: LegalAssistanceFormProps) {
  const router = useRouter();
  const [assistanceDate, setAssistanceDate] = useState(initialData?.assistanceDate ?? "");
  const [legalOfficerId, setLegalOfficerId] = useState(initialData?.legalOfficerId ?? "");
  const [clientName, setClientName] = useState(initialData?.clientName ?? "");
  // No blank default: every row on the register has one of the two ticked, and
  // an empty option would let a row be saved that the sheet cannot represent.
  const [sex, setSex] = useState<ClientSex>(initialData?.sex ?? "MALE");
  const [forms, setForms] = useState<AssistanceForm[]>(initialData?.forms ?? []);
  const [othersDetail, setOthersDetail] = useState(initialData?.othersDetail ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleForm(form: AssistanceForm) {
    setForms((prev) => (prev.includes(form) ? prev.filter((f) => f !== form) : [...prev, form]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = {
      assistanceDate,
      legalOfficerId,
      clientName,
      sex,
      forms,
      // Sent as typed; the API drops it unless OTHERS is actually ticked, so
      // the two can never disagree about whether the row claims an "other".
      othersDetail: othersDetail || null,
      scannedCopyUrl: scannedCopyUrl || null,
    };

    const res = await fetch(
      mode === "create" ? "/api/legal-assistance" : `/api/legal-assistance/${id}`,
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

    router.push("/legal-assistance");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="assistanceDate">
            Date
          </label>
          <input
            id="assistanceDate"
            type="date"
            required
            value={assistanceDate}
            onChange={(e) => setAssistanceDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="legalOfficerId">
            Legal officer
          </label>
          <select
            id="legalOfficerId"
            required
            value={legalOfficerId}
            onChange={(e) => setLegalOfficerId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="clientName">
            Complainant / client
          </label>
          <input
            id="clientName"
            type="text"
            required
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
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
        <span className={labelClass}>Form of legal assistance</span>
        <p className="mb-2 text-xs text-ink-500 dark:text-white/40">
          Tick every kind given — a client is often assisted on more than one.
        </p>
        <div className="grid grid-cols-4 gap-2 rounded-md border border-ink-400/30 p-3 dark:border-white/15">
          {ASSISTANCE_FORMS.map((form) => (
            <label
              key={form}
              className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70"
            >
              <input
                type="checkbox"
                className="field-checkbox"
                checked={forms.includes(form)}
                onChange={() => toggleForm(form)}
              />
              {FORM_LABELS[form]}
            </label>
          ))}
        </div>

        {/* Only asked for once the tick is on: an always-visible box would
            invite a description of an "other" the row does not claim. Not
            required — the office's own column is a bare tick-box, so a row
            that ticks it and says no more is still a row they can file. */}
        {forms.includes("OTHERS") && (
          <div className="mt-3">
            <label className={labelClass} htmlFor="othersDetail">
              Specify the other form of assistance
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

      <FileUploadField
        label="Scanned completed LAD"
        value={scannedCopyUrl}
        onChange={setScannedCopyUrl}
      />

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
