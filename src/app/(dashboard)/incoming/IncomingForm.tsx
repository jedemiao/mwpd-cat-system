"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";
import { DOCUMENT_TYPE_CODES, type DocumentTypeCode } from "@/lib/documentTypeCodes";

type Option = { id: string; name: string };
type Complexity = "SIMPLE" | "COMPLEX" | "HIGHLY_TECHNICAL";

type IncomingFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  canSignOff: boolean;
  initialData?: {
    dateReceived?: string;
    routingNumber?: string;
    documentTitle?: string;
    routedToIds?: string[];
    instructions?: string;
    complexity?: Complexity;
    numCorrections?: number;
    progressRemarks?: string;
    dateCompleted?: string;
    dcSignOffDate?: string;
    scannedCopyUrl?: string;
    filed?: boolean;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";
const readOnlyClass =
  "rounded-md border border-ink-400/20 bg-surface px-3 py-2 text-sm text-ink-500 dark:border-white/10 dark:bg-ink-900 dark:text-white/40";

const COMPLEXITY_LABEL: Record<Complexity, string> = {
  SIMPLE: "Simple — 3 days",
  COMPLEX: "Complex — 7 days",
  HIGHLY_TECHNICAL: "Highly technical — 20 days",
};

export function IncomingForm({ mode, id, users, canSignOff, initialData }: IncomingFormProps) {
  const router = useRouter();
  const [dateReceived, setDateReceived] = useState(initialData?.dateReceived ?? "");
  const [routingNumber, setRoutingNumber] = useState(initialData?.routingNumber ?? "");
  const [documentType, setDocumentType] = useState<DocumentTypeCode>("L");
  const [documentTitle, setDocumentTitle] = useState(initialData?.documentTitle ?? "");
  const [routedToIds, setRoutedToIds] = useState<string[]>(initialData?.routedToIds ?? []);
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  const [complexity, setComplexity] = useState<Complexity>(initialData?.complexity ?? "SIMPLE");
  const [numCorrections, setNumCorrections] = useState(initialData?.numCorrections ?? 0);
  const [progressRemarks, setProgressRemarks] = useState(initialData?.progressRemarks ?? "");
  const [dateCompleted, setDateCompleted] = useState(initialData?.dateCompleted ?? "");
  const [dcSignOffDate, setDcSignOffDate] = useState(initialData?.dcSignOffDate ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [filed, setFiled] = useState(initialData?.filed ?? false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleRoutedTo(userId: string) {
    setRoutedToIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body =
      mode === "create"
        ? {
            dateReceived,
            documentType,
            documentTitle,
            ...(canSignOff
              ? {
                  routedToIds,
                  instructions: instructions || undefined,
                  complexity,
                }
              : {}),
          }
        : {
            dateReceived,
            routingNumber,
            documentTitle,
            ...(canSignOff
              ? {
                  routedToIds,
                  instructions: instructions || null,
                  complexity,
                  numCorrections,
                  dateCompleted: dateCompleted || null,
                  dcSignOffDate: dcSignOffDate || null,
                }
              : {}),
            progressRemarks: progressRemarks || null,
            scannedCopyUrl: scannedCopyUrl || null,
            filed,
          };

    const res = await fetch(mode === "create" ? "/api/incoming" : `/api/incoming/${id}`, {
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

    router.push("/incoming");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="dateReceived">
            Date received
          </label>
          <input
            id="dateReceived"
            type="date"
            required
            value={dateReceived}
            onChange={(e) => setDateReceived(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          {mode === "create" ? (
            <>
              <label className={labelClass} htmlFor="documentType">
                Document type
              </label>
              <select
                id="documentType"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentTypeCode)}
                className={inputClass}
              >
                {DOCUMENT_TYPE_CODES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} — {t.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
                Routing number is generated automatically from the date received, type, and next sequence number.
              </p>
            </>
          ) : (
            <>
              <label className={labelClass} htmlFor="routingNumber">
                Routing number
              </label>
              <input
                id="routingNumber"
                type="text"
                required
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value)}
                className={inputClass}
              />
            </>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="documentTitle">
          Document title / subject
        </label>
        <input
          id="documentTitle"
          type="text"
          required
          value={documentTitle}
          onChange={(e) => setDocumentTitle(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <span className={labelClass}>Routed to</span>
        {canSignOff ? (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-ink-400/30 p-3 dark:border-white/15">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70">
                <input
                  type="checkbox"
                  className="field-checkbox"
                  checked={routedToIds.includes(u.id)}
                  onChange={() => toggleRoutedTo(u.id)}
                />
                {u.name}
              </label>
            ))}
          </div>
        ) : (
          <p className={readOnlyClass}>
            {mode === "create"
              ? "Will be routed to the Division Chief automatically on creation"
              : routedToIds.length > 0
                ? routedToIds.map((id) => users.find((u) => u.id === id)?.name ?? id).join(", ")
                : "— Unassigned —"}
          </p>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="complexity">
          Complexity (ARTA)
        </label>
        {canSignOff ? (
          <select
            id="complexity"
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as Complexity)}
            className={inputClass}
          >
            <option value="SIMPLE">Simple — 3 days</option>
            <option value="COMPLEX">Complex — 7 days</option>
            <option value="HIGHLY_TECHNICAL">Highly technical — 20 days</option>
          </select>
        ) : (
          <p className={readOnlyClass}>{COMPLEXITY_LABEL[complexity]}</p>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="instructions">
          Instruction / required actions (DC)
        </label>
        {canSignOff ? (
          <textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className={inputClass}
            rows={2}
          />
        ) : (
          <p className={`${readOnlyClass} whitespace-pre-wrap`}>
            {instructions || "Not yet set — only the Division Chief can set this"}
          </p>
        )}
      </div>

      {mode === "edit" && (
        <>
          <hr className="border-ink-400/15 dark:border-white/10" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="numCorrections">
                No. of corrections
              </label>
              {canSignOff ? (
                <input
                  id="numCorrections"
                  type="number"
                  min={0}
                  value={numCorrections}
                  onChange={(e) => setNumCorrections(Number(e.target.value))}
                  className={inputClass}
                />
              ) : (
                <p className={readOnlyClass}>{numCorrections}</p>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="dateCompleted">
                Date task completed
              </label>
              {canSignOff ? (
                <input
                  id="dateCompleted"
                  type="date"
                  value={dateCompleted}
                  onChange={(e) => setDateCompleted(e.target.value)}
                  className={inputClass}
                />
              ) : (
                <p className={readOnlyClass}>{dateCompleted || "Not yet completed"}</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="progressRemarks">
              Progress / remarks
            </label>
            <input
              id="progressRemarks"
              type="text"
              value={progressRemarks}
              onChange={(e) => setProgressRemarks(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="dcSignOffDate">
                DC sign-off date
              </label>
              {canSignOff ? (
                <input
                  id="dcSignOffDate"
                  type="date"
                  value={dcSignOffDate}
                  onChange={(e) => setDcSignOffDate(e.target.value)}
                  className={inputClass}
                />
              ) : (
                <p className={readOnlyClass}>{dcSignOffDate || "Not yet signed off"} — only the Division Chief can set this</p>
              )}
            </div>
            <FileUploadField label="Scanned copy" value={scannedCopyUrl} onChange={setScannedCopyUrl} />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70">
            <input type="checkbox" className="field-checkbox" checked={filed} onChange={(e) => setFiled(e.target.checked)} />
            Filed
          </label>
        </>
      )}

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
