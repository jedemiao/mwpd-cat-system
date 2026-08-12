"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";
import { computeDueDate } from "@/lib/artaLeadTime";
import {
  DOCUMENT_TYPE_CODES,
  DOCUMENT_TYPE_OTHER_CODE,
  type DocumentTypeCode,
} from "@/lib/documentTypeCodes";

type Option = { id: string; name: string };
type Complexity = "SIMPLE" | "COMPLEX" | "HIGHLY_TECHNICAL";
type Origin = "INTERNAL" | "EXTERNAL";

type IncomingFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  // Values already typed into these fields elsewhere in the office, offered as
  // datalist suggestions. The source tracker builds its filter dropdowns the
  // same way — from what has been entered before, not a maintained table.
  agencySuggestions: string[];
  signatorySuggestions: string[];
  currentUserId: string;
  canSignOff: boolean;
  /** Whether the office keeps two incoming registers, which decides whether
   *  Source is chosen on this form or carried in from the ledger. */
  splitIncomingLedgers: boolean;
  /** Whether this form is the office's own register (Office.incomingRegisterForm):
   *  its twelve columns in their order, every one present from the start, and
   *  no DC sign-off step. See the schema comment for what it leaves out. */
  registerLayout: boolean;
  initialData?: {
    dateReceived?: string;
    timeReceived?: string;
    receivedById?: string;
    origin?: Origin;
    originAgency?: string;
    signatory?: string;
    documentType?: string;
    documentTypeOther?: string;
    routingNumber?: string;
    documentTitle?: string;
    dueDate?: string;
    routedToIds?: string[];
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

// Local-time YYYY-MM-DD for a <input type="date">. Deliberately not
// toISOString().slice(0,10), which shifts to UTC and can land a due date on the
// previous day for anyone east of Greenwich — this office is UTC+8.
function toDateInput(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const COMPLEXITY_LABEL: Record<Complexity, string> = {
  SIMPLE: "Simple — 3 days",
  COMPLEX: "Complex — 7 days",
  HIGHLY_TECHNICAL: "Highly technical — 20 days",
};

export function IncomingForm({
  mode,
  id,
  users,
  agencySuggestions,
  signatorySuggestions,
  currentUserId,
  canSignOff,
  splitIncomingLedgers,
  registerLayout,
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
  // Two arrangements, per Office.splitIncomingLedgers. Where the office keeps
  // two registers, source is set by the ledger being logged into and is not
  // editable here — an editable field could only ever disagree with the ledger
  // the clerk is standing in. Where there is one ledger, nothing else can
  // supply it, so it is typed like any other property of the document.
  const [origin, setOrigin] = useState<Origin>(initialData?.origin ?? "EXTERNAL");
  const [originAgency, setOriginAgency] = useState(initialData?.originAgency ?? "");
  const [signatory, setSignatory] = useState(initialData?.signatory ?? "");
  const [routingNumber, setRoutingNumber] = useState(initialData?.routingNumber ?? "");
  const [documentType, setDocumentType] = useState<DocumentTypeCode>(
    (initialData?.documentType as DocumentTypeCode) ?? "L",
  );
  const [documentTypeOther, setDocumentTypeOther] = useState(initialData?.documentTypeOther ?? "");
  const [documentTitle, setDocumentTitle] = useState(initialData?.documentTitle ?? "");
  const [routedToIds, setRoutedToIds] = useState<string[]>(initialData?.routedToIds ?? []);
  const [instructions, setInstructions] = useState(initialData?.instructions ?? "");
  const [complexity, setComplexity] = useState<Complexity>(initialData?.complexity ?? "SIMPLE");
  // The register carries "Due Date (if any)" and the ARTA lead time as two
  // separate columns, so the due date is a field here and not merely a
  // consequence. It is filled from the lead time and stays editable.
  const [dueDate, setDueDate] = useState(initialData?.dueDate ?? "");
  const [numCorrections, setNumCorrections] = useState(initialData?.numCorrections ?? 0);
  const [progressRemarks, setProgressRemarks] = useState(initialData?.progressRemarks ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [dateCompleted, setDateCompleted] = useState(initialData?.dateCompleted ?? "");
  const [dcSignOffDate, setDcSignOffDate] = useState(initialData?.dcSignOffDate ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [filed, setFiled] = useState(initialData?.filed ?? false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Recomputed when either input to it changes, rather than in an effect: on the
  // edit form an effect would fire on mount and overwrite a due date somebody
  // had deliberately typed, which is the one thing an override must survive.
  // Changing the date received or the lead time does overwrite it, and the hint
  // under the field says so — that is the correct reading of a recalculation,
  // and it keeps the ARTA board honest.
  function recalcDueDate(nextDateReceived: string, nextComplexity: Complexity) {
    if (!nextDateReceived) return;
    const [y, m, d] = nextDateReceived.split("-").map(Number);
    if (!y || !m || !d) return;
    setDueDate(toDateInput(computeDueDate(new Date(y, m - 1, d), nextComplexity)));
  }

  function toggleRoutedTo(userId: string) {
    setRoutedToIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // The register layout has none of these columns, so it sends none of them
    // rather than sending empty strings. On PATCH that distinction matters: an
    // omitted key leaves the stored value alone, while an explicit null would
    // wipe whatever an office had recorded before adopting this layout.
    const intake = registerLayout
      ? {}
      : {
          timeReceived: timeReceived || "",
          receivedById: receivedById || "",
          origin,
          originAgency: originAgency || undefined,
          signatory: signatory || undefined,
        };

    // The register fills its whole row from the start — the completion columns
    // are on the create form, blank until they apply — so they are sent on
    // create too, which the fuller layout only does on edit.
    const registerProgress = registerLayout
      ? {
          progressRemarks: progressRemarks || undefined,
          scannedCopyUrl: scannedCopyUrl || undefined,
          filed,
          ...(canSignOff
            ? {
                numCorrections,
                dateCompleted: dateCompleted || undefined,
              }
            : {}),
        }
      : {};

    // Only sent alongside "Others"; switching away from it clears the text
    // rather than leaving a stale specification attached to a named type.
    const typeOtherDetail = documentType === DOCUMENT_TYPE_OTHER_CODE ? documentTypeOther.trim() : "";

    const body =
      mode === "create"
        ? {
            dateReceived,
            documentType,
            documentTypeOther: typeOtherDetail || undefined,
            documentTitle,
            ...intake,
            ...(registerLayout ? {} : { notes: notes || undefined }),
            ...registerProgress,
            ...(canSignOff
              ? {
                  routedToIds,
                  instructions: instructions || undefined,
                  complexity,
                  // Sent only where it is a field somebody can see and set;
                  // elsewhere the server computes it from the lead time.
                  ...(registerLayout && dueDate ? { dueDate } : {}),
                }
              : {}),
          }
        : {
            dateReceived,
            routingNumber,
            documentType,
            documentTypeOther: typeOtherDetail || null,
            documentTitle,
            ...intake,
            ...(registerLayout
              ? {}
              : {
                  originAgency: originAgency || null,
                  signatory: signatory || null,
                  notes: notes || null,
                }),
            ...(canSignOff
              ? {
                  routedToIds,
                  instructions: instructions || null,
                  complexity,
                  numCorrections,
                  dateCompleted: dateCompleted || null,
                  // No sign-off column in the register, so the field is never
                  // rendered and never sent — sending null would clear a date
                  // an office had set before adopting this layout.
                  ...(registerLayout ? { dueDate: dueDate || null } : { dcSignOffDate: dcSignOffDate || null }),
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
      <div className={`grid gap-4 ${registerLayout ? "grid-cols-2" : "grid-cols-3"}`}>
        <div>
          <label className={labelClass} htmlFor="dateReceived">
            Date received
          </label>
          <input
            id="dateReceived"
            type="date"
            required
            value={dateReceived}
            onChange={(e) => {
              setDateReceived(e.target.value);
              recalcDueDate(e.target.value, complexity);
            }}
            className={inputClass}
          />
        </div>

        {/* The register records a date, not a clock time, and does not name the
            desk officer — both columns belong to MWPSD's sheet, not this one. */}
        {!registerLayout && (
        <>
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
        </>
        )}

        {/* No routing number on create. It is the register's second column, but
            the sequence is only claimed on save, so anything shown here would
            be a box that never fills in — and the note under Document type
            already says where the number comes from. It appears on the edit
            form, where there is a real number to read and correct. */}
      </div>

      {/* Shown only where the office files one incoming ledger, and never on the
          register layout, whose sheet has no Source column. Where the office
          keeps two ledgers, source comes from the one being logged into
          (/incoming/new?origin=…) and is sent with the payload but never typed,
          because there it also decides the numbering format. */}
      {!splitIncomingLedgers && !registerLayout && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="origin">
              Source
            </label>
            <select
              id="origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value as Origin)}
              className={inputClass}
            >
              <option value="EXTERNAL">External — outside DMW</option>
              <option value="INTERNAL">Internal — from within DMW</option>
            </select>
            <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
              Recorded on the document and filterable in the ledger. It does not change the routing number.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
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
          {/* Revealed only on Others, and required there — same rule as
              LeaveForm's "Please specify". */}
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

      {/* Neither column exists on the register — its sender lives inside the
          document title, the way the office already writes it. */}
      {!registerLayout && (
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
      )}

      <div>
        <label className={labelClass} htmlFor="documentTitle">
          {registerLayout ? "Document title / subject" : "Particulars / subject"}
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
        <span className={labelClass}>{registerLayout ? "Routed to / responsible person" : "Routed to"}</span>
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

      {/* Due date beside the lead time that produced it, as the register has
          them: "Due Date (if any)" then "LEAD TIME Based on ARTA". Where the
          register layout is off, only the lead time shows and the due date stays
          a server-side consequence of it. */}
      <div className={`grid gap-4 ${registerLayout ? "grid-cols-2" : "grid-cols-1"}`}>
        {registerLayout && (
          <div>
            <label className={labelClass} htmlFor="dueDate">
              Due date
            </label>
            {canSignOff ? (
              <>
                <input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-ink-500 dark:text-white/40">
                  Filled from the lead time below. Editing the date received or the lead time recalculates it.
                </p>
              </>
            ) : (
              <p className={readOnlyClass}>{dueDate || "Not set"}</p>
            )}
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="complexity">
            {registerLayout ? "Lead time (ARTA)" : "Complexity (ARTA)"}
          </label>
          {canSignOff ? (
            <select
              id="complexity"
              value={complexity}
              onChange={(e) => {
                const next = e.target.value as Complexity;
                setComplexity(next);
                recalcDueDate(dateReceived, next);
              }}
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
      </div>

      {/* The register is one row filled in over time, so its remaining columns
          are present from the start, blank until they apply. The fuller layout
          keeps them for the edit screen, where they first become answerable. */}
      {(mode === "edit" || registerLayout) && (
        <>
          <hr className="border-ink-400/15 dark:border-white/10" />

          {/* Ordered as the register's remaining columns run: corrections,
              progress, date completed, scanned copy, filed. */}
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
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <FileUploadField label="Scanned copy" value={scannedCopyUrl} onChange={setScannedCopyUrl} />
          </div>

          {/* Neither column is on the register. Notes is the source tracker's
              second remarks column — where Progress says where the document is
              ("forwarded to Maam Marissa"), Notes says what has been done to it
              ("scanned and filed"). Sign-off is an app step their sheet has no
              equivalent for; see Office.incomingRegisterForm. */}
          {!registerLayout && (
            <div className="grid grid-cols-2 gap-4">
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
            </div>
          )}

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
