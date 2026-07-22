"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";
import { DOCUMENT_TYPE_CODES, type DocumentTypeCode } from "@/lib/documentTypeCodes";

type IncomingOption = { id: string; routingNumber: string; documentTitle: string };

type OutgoingFormProps = {
  mode: "create" | "edit";
  id?: string;
  incomingDocs: IncomingOption[];
  initialData?: {
    dateReleased?: string;
    routingNumber?: string;
    documentTitle?: string;
    instructions?: string;
    receivedBy?: string;
    relatedIncomingId?: string;
    progressRemarks?: string;
    scannedCopyUrl?: string;
    filed?: boolean;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function OutgoingForm({ mode, id, incomingDocs, initialData }: OutgoingFormProps) {
  const router = useRouter();
  const [dateReleased, setDateReleased] = useState(initialData?.dateReleased ?? "");
  const [routingNumber, setRoutingNumber] = useState(initialData?.routingNumber ?? "");
  const [documentType, setDocumentType] = useState<DocumentTypeCode>("L");
  const [documentTitle, setDocumentTitle] = useState(initialData?.documentTitle ?? "");
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  const [receivedBy, setReceivedBy] = useState(initialData?.receivedBy ?? "");
  const [relatedIncomingId, setRelatedIncomingId] = useState(initialData?.relatedIncomingId ?? "");
  const [progressRemarks, setProgressRemarks] = useState(initialData?.progressRemarks ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [filed, setFiled] = useState(initialData?.filed ?? false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body =
      mode === "create"
        ? {
            dateReleased,
            documentType,
            documentTitle,
            instructions: instructions || undefined,
            receivedBy: receivedBy || undefined,
            relatedIncomingId: relatedIncomingId || undefined,
          }
        : {
            dateReleased,
            routingNumber,
            documentTitle,
            instructions: instructions || null,
            receivedBy: receivedBy || null,
            relatedIncomingId: relatedIncomingId || null,
            progressRemarks: progressRemarks || null,
            scannedCopyUrl: scannedCopyUrl || null,
            filed,
          };

    const res = await fetch(mode === "create" ? "/api/outgoing" : `/api/outgoing/${id}`, {
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

    router.push("/outgoing");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="dateReleased">
            Date released
          </label>
          <input
            id="dateReleased"
            type="date"
            required
            value={dateReleased}
            onChange={(e) => setDateReleased(e.target.value)}
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
                Routing number is generated automatically from the date released, type, and next sequence number.
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
        <label className={labelClass} htmlFor="relatedIncomingId">
          Answers incoming request
        </label>
        <select
          id="relatedIncomingId"
          value={relatedIncomingId}
          onChange={(e) => setRelatedIncomingId(e.target.value)}
          className={inputClass}
        >
          <option value="">— None —</option>
          {incomingDocs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.routingNumber} — {doc.documentTitle}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="instructions">
          Instruction / required actions
        </label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className={inputClass}
          rows={2}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="receivedBy">
          Received by
        </label>
        <input
          id="receivedBy"
          type="text"
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
          className={inputClass}
        />
      </div>

      {mode === "edit" && (
        <>
          <hr className="border-ink-400/15 dark:border-white/10" />

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

          <FileUploadField label="Scanned copy" value={scannedCopyUrl} onChange={setScannedCopyUrl} />

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
