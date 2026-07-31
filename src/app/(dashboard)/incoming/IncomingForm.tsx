"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";
import { DOCUMENT_TYPE_CODES, type DocumentTypeCode } from "@/lib/documentTypeCodes";

type Option = { id: string; name: string };
type ActivityOption = { id: string; label: string };
type Complexity = "SIMPLE" | "COMPLEX" | "HIGHLY_TECHNICAL";
type Origin = "INTERNAL" | "EXTERNAL";

type IncomingFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  activities: ActivityOption[];
  // Values already typed into these fields elsewhere in the office, offered as
  // datalist suggestions. The source tracker builds its filter dropdowns the
  // same way — from what has been entered before, not a maintained table.
  agencySuggestions: string[];
  signatorySuggestions: string[];
  currentUserId: string;
  canSignOff: boolean;
  initialData?: {
    dateReceived?: string;
    timeReceived?: string;
    receivedById?: string;
    origin?: Origin;
    originAgency?: string;
    signatory?: string;
    documentType?: string;
    routingNumber?: string;
    documentTitle?: string;
    routedToIds?: string[];
    activityIds?: string[];
    instructions?: string;
    complexity?: Complexity;
    numCorrections?: number;
    progressRemarks?: string;
    notes?: string;
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

export function IncomingForm({
  mode,
  id,
  users,
  activities,
  agencySuggestions,
  signatorySuggestions,
  currentUserId,
  canSignOff,
  initialData,
}: IncomingFormProps) {
  const router = useRouter();
  const [dateReceived, setDateReceived] = useState(initialData?.dateReceived ?? "");
  const [timeReceived, setTimeReceived] = useState(initialData?.timeReceived ?? "");
  // Whoever is logging the document is almost always the person who took it in,
  // so the desk officer defaults to them on a new record.
  const [receivedById, setReceivedById] = useState(
    initialData?.receivedById ?? (mode === "create" ? currentUserId : ""),
  );
  const [origin, setOrigin] = useState<Origin>(initialData?.origin ?? "EXTERNAL");
  const [originAgency, setOriginAgency] = useState(initialData?.originAgency ?? "");
  const [signatory, setSignatory] = useState(initialData?.signatory ?? "");
  const [routingNumber, setRoutingNumber] = useState(initialData?.routingNumber ?? "");
  const [documentType, setDocumentType] = useState<DocumentTypeCode>(
    (initialData?.documentType as DocumentTypeCode) ?? "L",
  );
  const [documentTitle, setDocumentTitle] = useState(initialData?.documentTitle ?? "");
  const [routedToIds, setRoutedToIds] = useState<string[]>(initialData?.routedToIds ?? []);
  const [activityIds, setActivityIds] = useState<string[]>(initialData?.activityIds ?? []);
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  const [complexity, setComplexity] = useState<Complexity>(initialData?.complexity ?? "SIMPLE");
  const [numCorrections, setNumCorrections] = useState(initialData?.numCorrections ?? 0);
  const [progressRemarks, setProgressRemarks] = useState(initialData?.progressRemarks ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [dateCompleted, setDateCompleted] = useState(initialData?.dateCompleted ?? "");
  const [dcSignOffDate, setDcSignOffDate] = useState(initialData?.dcSignOffDate ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [filed, setFiled] = useState(initialData?.filed ?? false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleRoutedTo(userId: string) {
    setRoutedToIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function toggleActivity(activityId: string) {
    setActivityIds((prev) => (prev.includes(activityId) ? prev.filter((a) => a !== activityId) : [...prev, activityId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const intake = {
      timeReceived: timeReceived || "",
      receivedById: receivedById || "",
      origin,
      originAgency: originAgency || undefined,
      signatory: signatory || undefined,
      activityIds,
    };

    const body =
      mode === "create"
        ? {
            dateReceived,
            documentType,
            documentTitle,
            ...intake,
            notes: notes || undefined,
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
            documentType,
            documentTitle,
            ...intake,
            originAgency: originAgency || null,
            signatory: signatory || null,
            notes: notes || null,
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
      <div className="grid grid-cols-3 gap-4">
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
          <label className={labelClass} htmlFor="timeReceived">
            Time received
          </label>
          <input
            id="timeReceived"
            type="time"
            value={timeReceived}
            onChange={(e) => setTimeReceived(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="receivedById">
            Received by
          </label>
          <select
            id="receivedById"
            value={receivedById}
            onChange={(e) => setReceivedById(e.target.value)}
            className={inputClass}
          >
            <option value="">— Not recorded —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="origin">
            Source
          </label>
          <select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value as Origin)} className={inputClass}>
            <option value="EXTERNAL">External — outside DMW</option>
            <option value="INTERNAL">Internal — within DMW</option>
          </select>
        </div>
        <div>
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
          {mode === "create" && (
            <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
              Routing number is generated automatically from the date received, type, and next sequence number.
            </p>
          )}
        </div>
      </div>

      {mode === "edit" && (
        <div>
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
          <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
            Changing the document type above does not rewrite this number — edit it here too if they need to agree.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="originAgency">
            Office / agency
          </label>
          <input
            id="originAgency"
            type="text"
            list="agency-suggestions"
            value={originAgency}
            onChange={(e) => setOriginAgency(e.target.value)}
            placeholder="DMW - Ortigas"
            className={inputClass}
          />
          <datalist id="agency-suggestions">
            {agencySuggestions.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelClass} htmlFor="signatory">
            Signatory
          </label>
          <input
            id="signatory"
            type="text"
            list="signatory-suggestions"
            value={signatory}
            onChange={(e) => setSignatory(e.target.value)}
            placeholder="Name as signed on the document"
            className={inputClass}
          />
          <datalist id="signatory-suggestions">
            {signatorySuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="documentTitle">
          Particulars / subject
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
        <span className={labelClass}>
          Related activities <span className="normal-case text-ink-400 dark:text-white/30">(optional)</span>
        </span>
        {activities.length === 0 ? (
          <p className={readOnlyClass}>No activities logged yet.</p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-ink-400/30 p-3 dark:border-white/15">
            {activities.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-sm text-ink-700 dark:text-white/70">
                <input
                  type="checkbox"
                  className="field-checkbox mt-0.5"
                  checked={activityIds.includes(a.id)}
                  onChange={() => toggleActivity(a.id)}
                />
                {a.label}
              </label>
            ))}
          </div>
        )}
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

          {/* Two distinct things the source tracker keeps in separate columns:
              Remarks is where the document is ("forwarded to Maam Marissa"),
              Notes is what has been done to it ("scanned and filed"). */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="progressRemarks">
                Progress / remarks
              </label>
              <input
                id="progressRemarks"
                type="text"
                value={progressRemarks}
                onChange={(e) => setProgressRemarks(e.target.value)}
                placeholder="Forwarded to…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="notes">
                Notes
              </label>
              <input
                id="notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Scanned and filed"
                className={inputClass}
              />
            </div>
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
