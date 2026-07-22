"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";

type InternalFormProps = {
  mode: "create" | "edit";
  id?: string;
  initialData?: {
    dateReleased?: string;
    memorandumNumber?: number;
    documentTitle?: string;
    instructions?: string;
    receivedBy?: string;
    progressRemarks?: string;
    scannedCopyUrl?: string;
    filed?: boolean;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function InternalForm({ mode, id, initialData }: InternalFormProps) {
  const router = useRouter();
  const [dateReleased, setDateReleased] = useState(initialData?.dateReleased ?? "");
  const [memorandumNumber, setMemorandumNumber] = useState(
    initialData?.memorandumNumber != null ? String(initialData.memorandumNumber) : ""
  );
  const [documentTitle, setDocumentTitle] = useState(initialData?.documentTitle ?? "");
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  const [receivedBy, setReceivedBy] = useState(initialData?.receivedBy ?? "");
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
            memorandumNumber: parseInt(memorandumNumber, 10),
            documentTitle,
            instructions: instructions || undefined,
            receivedBy: receivedBy || undefined,
          }
        : {
            dateReleased,
            memorandumNumber: parseInt(memorandumNumber, 10),
            documentTitle,
            instructions: instructions || null,
            receivedBy: receivedBy || null,
            progressRemarks: progressRemarks || null,
            scannedCopyUrl: scannedCopyUrl || null,
            filed,
          };

    const res = await fetch(mode === "create" ? "/api/internal" : `/api/internal/${id}`, {
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

    router.push("/internal");
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
          <label className={labelClass} htmlFor="memorandumNumber">
            Memorandum number
          </label>
          <input
            id="memorandumNumber"
            type="number"
            required
            min={1}
            value={memorandumNumber}
            onChange={(e) => setMemorandumNumber(e.target.value)}
            className={inputClass}
          />
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
