"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";
import {
  DOCUMENT_TYPE_CODES,
  DOCUMENT_TYPE_OTHER_CODE,
  type DocumentTypeCode,
} from "@/lib/documentTypeCodes";
import {
  RECEIVING_OFFICES,
  RECEIVING_OFFICE_LABELS,
  receivingOfficeLabel,
  formatReceivingOffices,
  parseReceivingOffices,
  type ReceivingOffice,
} from "@/lib/receivingOffices";


type OutgoingFormProps = {
  mode: "create" | "edit";
  id?: string;
  /**
   * Offices keeping their own register enter documents the way their tracker
   * does: the tracking number is typed rather than generated, "Particulars"
   * rather than "Document title", Remarks captured at entry, and no
   * Instruction field — their form has none.
   */
  registerStyle?: boolean;
  /**
   * Which of the office codes above name a division that keeps its records in
   * this app. Ticking any other office records where the document went, but
   * cannot deliver it — there is no ledger here to deliver it into.
   */
  deliverableOffices?: string[];
  /** Recent activities offered by the register-style activity picker. */
  activities?: ActivityOption[];
  initialData?: {
    dateReleased?: string;
    routingNumber?: string;
    documentTypeOther?: string;
    documentTitle?: string;
    instructions?: string;
    receivingOffice?: string;
    receivedBy?: string;
    receivedDate?: string;
    receivedTime?: string;
    progressRemarks?: string;
    scannedCopyUrl?: string;
    filed?: boolean;
    activityIds?: string[];
  };
};

const inputClass = "field-input";
const labelClass = "field-label";
const readOnlyClass =
  "rounded-md border border-ink-400/20 bg-surface px-3 py-2 text-sm text-ink-500 dark:border-white/10 dark:bg-ink-900 dark:text-white/40";

type ActivityOption = { id: string; label: string };

export function OutgoingForm({
  mode,
  id,
  initialData,
  registerStyle = false,
  deliverableOffices = [],
  activities = [],
}: OutgoingFormProps) {
  const router = useRouter();
  const [dateReleased, setDateReleased] = useState(initialData?.dateReleased ?? "");
  const [routingNumber, setRoutingNumber] = useState(initialData?.routingNumber ?? "");
  const [documentType, setDocumentType] = useState<DocumentTypeCode>("L");
  const [documentTypeOther, setDocumentTypeOther] = useState(initialData?.documentTypeOther ?? "");
  const [documentTitle, setDocumentTitle] = useState(initialData?.documentTitle ?? "");
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  // Split once on mount: the ticked offices are editable, anything the field
  // held before it became a checklist rides along untouched.
  const initialOffices = parseReceivingOffices(initialData?.receivingOffice);
  const [receivingOffices, setReceivingOffices] = useState<ReceivingOffice[]>(initialOffices.selected);
  // Ticked offices this app cannot deliver to — ARD and ADJU today. Named as
  // they are ticked rather than listed up front, so the note only appears when
  // it actually applies to this document.
  const undeliverable = receivingOffices.filter((o) => !deliverableOffices.includes(o));
  const [receivingOfficeExtras] = useState<string[]>(initialOffices.extras);
  const [receivedBy, setReceivedBy] = useState(initialData?.receivedBy ?? "");
  const [receivedDate, setReceivedDate] = useState(initialData?.receivedDate ?? "");
  const [receivedTime, setReceivedTime] = useState(initialData?.receivedTime ?? "");
  const [progressRemarks, setProgressRemarks] = useState(initialData?.progressRemarks ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [filed, setFiled] = useState(initialData?.filed ?? false);
  const [activityIds, setActivityIds] = useState<string[]>(initialData?.activityIds ?? []);
  const [activityQuery, setActivityQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleReceivingOffice(office: ReceivingOffice) {
    setReceivingOffices((prev) => (prev.includes(office) ? prev.filter((o) => o !== office) : [...prev, office]));
  }

  function toggleActivity(activityId: string) {
    setActivityIds((prev) => (prev.includes(activityId) ? prev.filter((a) => a !== activityId) : [...prev, activityId]));
  }

  // A ticked activity always stays listed, even when it doesn't match the
  // search — otherwise filtering could hide a selection the clerk has made and
  // they would submit without seeing it.
  const visibleActivities = activities.filter(
    (a) => activityIds.includes(a.id) || a.label.toLowerCase().includes(activityQuery.trim().toLowerCase()),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Every dispatch goes somewhere, and the office is what a delivery is
    // raised from — released with none addressed, it reaches nobody. Extras
    // count: a record entered before this was a list already names its office,
    // just not from the checkboxes.
    if (receivingOffices.length === 0 && receivingOfficeExtras.length === 0) {
      setError("Choose at least one office for this document.");
      return;
    }
    setLoading(true);

    const body =
      mode === "create"
        ? {
            // Only sent when the office types its own; otherwise the API
            // generates one. Never send an empty string — that would fail
            // validation rather than falling back to generation.
            ...(registerStyle && routingNumber.trim() ? { routingNumber: routingNumber.trim() } : {}),
            documentType,
            documentTypeOther:
              documentType === DOCUMENT_TYPE_OTHER_CODE ? documentTypeOther.trim() || undefined : undefined,
            documentTitle,
            instructions: instructions || undefined,
            ...(registerStyle ? { progressRemarks: progressRemarks || undefined, activityIds } : {}),
            receivingOffice: formatReceivingOffices(receivingOffices, receivingOfficeExtras) || undefined,
            receivedBy: receivedBy || undefined,
            receivedDate: receivedDate || undefined,
            receivedTime: receivedTime || undefined,
          }
        : {
            dateReleased,
            routingNumber,
            documentTitle,
            instructions: instructions || null,
            receivingOffice: formatReceivingOffices(receivingOffices, receivingOfficeExtras) || null,
            receivedBy: receivedBy || null,
            receivedDate: receivedDate || null,
            receivedTime: receivedTime || null,
            progressRemarks: progressRemarks || null,
            // Sent only where the picker exists; elsewhere the key is absent so
            // the API leaves any existing links alone rather than clearing them.
            ...(registerStyle ? { activityIds } : {}),
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

  // Built once and placed differently rather than written twice: the register
  // keeps its type beside the date released, while an office whose number is
  // generated shows the number there instead and drops the type onto the next
  // line — the same arrangement as the incoming form. Same field either way.
  const documentTypeField = (
    <>
      <label className={labelClass} htmlFor="documentType">
        {registerStyle ? "Type of Document" : "Document type"}
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
      {!registerStyle && (
        <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
          Routing number is generated automatically from the date released, type, and next sequence number.
        </p>
      )}
      {/* Same shape as LeaveForm's "Please specify": revealed only on
          Others, and required there — an unexplained "Others" records
          nothing the legend didn't already fail to describe. */}
      {documentType === DOCUMENT_TYPE_OTHER_CODE && (
        <div className="mt-3">
          <label className={labelClass} htmlFor="documentTypeOther">
            Please specify
          </label>
          <input
            id="documentTypeOther"
            type="text"
            required
            maxLength={100}
            placeholder="e.g. Terminal Report, Accomplishment Report…"
            value={documentTypeOther}
            onChange={(e) => setDocumentTypeOther(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-2 gap-4">
        {/* A new dispatch is a draft: it has not been released, so there is no
            release date to state. The date is recorded when it is released,
            which is also when a generated tracking number is claimed. */}
        {mode === "create" ? (
          <div>
            <span className={labelClass}>Date released</span>
            <p className={readOnlyClass}>Recorded when this is released</p>
          </div>
        ) : (
          <div>
            <label className={labelClass} htmlFor="dateReleased">
              Date released
            </label>
            <input
              id="dateReleased"
              type="date"
              value={dateReleased}
              onChange={(e) => setDateReleased(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
        {/* Nothing sits beside the date on create where the number is
            generated: the sequence is only claimed on save, so the cell is left
            out rather than filled with a box that never completes. The note
            under Document type already says where the number comes from, and
            the edit form carries the real one. */}
        {mode === "edit" ? (
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
          </div>
        ) : registerStyle ? (
          <div>{documentTypeField}</div>
        ) : null}
      </div>

      {/* Below the row for an office whose number is generated, so the pair the
          clerk actually fills reads down the page — date, then type — with the
          number they cannot set sitting beside the date it derives from. */}
      {mode === "create" && !registerStyle && (
        <div className="grid grid-cols-2 gap-4">
          <div>{documentTypeField}</div>
        </div>
      )}

      {/* Typed here rather than generated, as the office's own register does.
          It is unique across the whole table, so a repeat is refused by the API
          with the number named in the message. */}
      {registerStyle && mode === "create" && (
        <div>
          <label className={labelClass} htmlFor="routingNumber">
            Tracking No.
          </label>
          <input
            id="routingNumber"
            type="text"
            required
            value={routingNumber}
            onChange={(e) => setRoutingNumber(e.target.value)}
            placeholder="e.g. PSD-2026-08-389"
            className={inputClass}
          />
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="documentTitle">
          {registerStyle ? "Particulars" : "Document title / subject"}
        </label>
        {registerStyle ? (
          <textarea
            id="documentTitle"
            required
            rows={3}
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className={inputClass}
          />
        ) : (
          <input
            id="documentTitle"
            type="text"
            required
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className={inputClass}
          />
        )}
      </div>


      {/* Their entry form has no Instruction field — Remarks below covers it. */}
      {!registerStyle && (
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
      )}

      {/* Receipt acknowledgement — kept together because they are filled in as
          one act, usually days after the document was logged: the recipient
          signs, and the clerk records who took it, for which office, and when.
          A released document with no receipt is exactly what gets chased. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* A fixed checklist rather than the free-text box this used to be: the
            same destination was arriving spelled several ways, and a document
            genuinely can go to more than one office at once. Spans the full
            row, and wraps rather than squeezing once the list outgrows it. */}
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>
            Office{" "}
            <span className="normal-case text-ink-400 dark:text-white/30">(required, can select more than one)</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
            {RECEIVING_OFFICES.map((office) => (
              <label
                key={office}
                className="flex items-center gap-2 text-sm text-ink-700 dark:text-white/70"
              >
                <input
                  type="checkbox"
                  className="field-checkbox"
                  checked={receivingOffices.includes(office)}
                  onChange={() => toggleReceivingOffice(office)}
                />
                {RECEIVING_OFFICE_LABELS[office]}
              </label>
            ))}
          </div>
          {/* The commonest confusion this form causes: ticking an office looks
              like sending, but the delivery is raised on Release. Said here
              rather than left to be discovered. */}
          <p className="mt-2 text-xs text-ink-500 dark:text-white/40">
            Delivered to these divisions when the document is released — ticking an office
            does not send it yet.
          </p>
          {undeliverable.length > 0 && (
            <p className="mt-1 text-xs text-warning-700 dark:text-warning">
              {undeliverable.map(receivingOfficeLabel).join(", ")} {undeliverable.length === 1 ? "keeps" : "keep"} no records here,
              so {undeliverable.length === 1 ? "it is" : "they are"} recorded on this document only.
            </p>
          )}
          {/* Only ever appears on a record entered before this was a list. */}
          {receivingOfficeExtras.length > 0 && (
            <p className="mt-2 text-xs text-ink-500 dark:text-white/40">
              Also recorded: {receivingOfficeExtras.join(", ")}
            </p>
          )}
        </fieldset>

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

        <div>
          <label className={labelClass} htmlFor="receivedDate">
            Date received
          </label>
          <input
            id="receivedDate"
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="receivedTime">
            Time received
          </label>
          <input
            id="receivedTime"
            type="time"
            value={receivedTime}
            onChange={(e) => setReceivedTime(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* "Link to Tentative Activity(s) (optional, can select more than one)".
          Their control is a type-ahead over everything; this filters a bounded
          recent list instead, which needs no search endpoint and cannot leave a
          selection stranded off-list — anything already ticked stays visible
          because the filter only hides unticked rows. */}
      {registerStyle && (
        <div>
          <span className={labelClass}>
            Link to Tentative Activity(s){" "}
            <span className="normal-case text-ink-400 dark:text-white/30">(optional, can select more than one)</span>
          </span>
          {activities.length === 0 ? (
            <p className={readOnlyClass}>No activities logged yet.</p>
          ) : (
            <>
              <input
                type="text"
                value={activityQuery}
                onChange={(e) => setActivityQuery(e.target.value)}
                placeholder="Search by name, activity, or location…"
                className={inputClass}
              />
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-ink-400/30 p-3 dark:border-white/15">
                {visibleActivities.length === 0 ? (
                  <p className="text-sm text-ink-500 dark:text-white/40">No activities match that search.</p>
                ) : (
                  visibleActivities.map((a) => (
                    <label key={a.id} className="flex items-start gap-2 text-sm text-ink-700 dark:text-white/70">
                      <input
                        type="checkbox"
                        className="field-checkbox mt-0.5"
                        checked={activityIds.includes(a.id)}
                        onChange={() => toggleActivity(a.id)}
                      />
                      {a.label}
                    </label>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Their entry form captures Remarks at the point of logging, not only
          when the record is revisited, so it appears on create too. */}
      {registerStyle && mode === "create" && (
        <div>
          <label className={labelClass} htmlFor="progressRemarks">
            Remarks
          </label>
          <textarea
            id="progressRemarks"
            rows={2}
            value={progressRemarks}
            onChange={(e) => setProgressRemarks(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {mode === "edit" && (
        <>
          <hr className="border-ink-400/15 dark:border-white/10" />

          <div>
            <label className={labelClass} htmlFor="progressRemarks">
              {registerStyle ? "Remarks" : "Progress / remarks"}
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
