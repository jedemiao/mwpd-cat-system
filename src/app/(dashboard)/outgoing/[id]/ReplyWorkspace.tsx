"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutgoingStatus, OutgoingReviewOutcome } from "@prisma/client";
import { FileUploadField } from "@/components/FileUploadField";
import { Badge } from "@/components/Badge";
import { OUTGOING_STATUS_LABELS, OUTGOING_STATUS_HINTS, OUTGOING_STATUS_VARIANT } from "@/lib/outgoingStatus";

export type VersionItem = {
  id: string;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  staffNote: string | null;
  submittedByName: string;
  submittedAt: string;
  outcome: OutgoingReviewOutcome | null;
  chiefRemarks: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type NoteItem = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

// The reply's working history and the two actions that move it: the staff
// member sending a draft up, and the Division Chief ruling on it.
//
// One timeline, not two lists. A version and a note are different kinds of
// event but they answer the same question — what has happened to this reply —
// and splitting them would make the reader interleave two lists by date in
// their head to find out.
export function ReplyWorkspace({
  outgoingId,
  status,
  versions,
  notes,
  canReview,
  requiresApproval,
}: {
  outgoingId: string;
  status: OutgoingStatus;
  versions: VersionItem[];
  notes: NoteItem[];
  canReview: boolean;
  /** Whether this office gates release behind the Chief's approval. */
  requiresApproval: boolean;
}) {
  const router = useRouter();

  const [fileUrl, setFileUrl] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [chiefRemarks, setChiefRemarks] = useState("");
  const [noteBody, setNoteBody] = useState("");
  // Defaults to today in local time, not toISOString(), which would shift a
  // late-afternoon release here (UTC+8) back onto the previous day.
  const [releaseDate, setReleaseDate] = useState(todayInputValue);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = status === "DRAFT" || status === "RETURNED";
  const awaitingReview = status === "FOR_CHECKING";
  // Where approval is required, only an approved reply may go. Where it is
  // not, anything still in the office may — a draft that was never submitted
  // included, which for those divisions is the ordinary case rather than a
  // shortcut around review.
  const awaitingRelease = requiresApproval
    ? status === "APPROVED"
    : status !== "RELEASED";
  const latest = versions.length > 0 ? versions[versions.length - 1] : null;

  async function post(url: string, body: unknown, action: string) {
    setError(null);
    setBusy(action);
    const res = await fetch(url, {
      method: action === "review" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Something went wrong. Please try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function submitVersion() {
    if (!fileUrl) {
      setError("Attach the draft before submitting it.");
      return;
    }
    const ok = await post(
      `/api/outgoing/${outgoingId}/versions`,
      { fileUrl, staffNote: staffNote.trim() || undefined },
      "submit",
    );
    if (ok) {
      setFileUrl("");
      setStaffNote("");
    }
  }

  async function review(outcome: OutgoingReviewOutcome) {
    if (!latest) return;
    if (outcome === "RETURNED" && !chiefRemarks.trim()) {
      setError("Say what needs changing when returning a reply.");
      return;
    }
    const ok = await post(
      `/api/outgoing/${outgoingId}/versions/${latest.id}`,
      { outcome, chiefRemarks: chiefRemarks.trim() || undefined },
      "review",
    );
    if (ok) setChiefRemarks("");
  }

  async function release() {
    await post(`/api/outgoing/${outgoingId}/release`, { dateReleased: releaseDate }, "release");
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    const ok = await post(`/api/outgoing/${outgoingId}/notes`, { body: noteBody.trim() }, "note");
    if (ok) setNoteBody("");
  }

  // Versions and notes woven into one sequence. Versions sort by their
  // submission time, which is also when they entered the story.
  const timeline = [
    ...versions.map((v) => ({ kind: "version" as const, at: v.submittedAt, version: v })),
    ...notes.map((n) => ({ kind: "note" as const, at: n.createdAt, note: n })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="mt-6 max-w-2xl space-y-4">
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Checking</h2>
          <span className="flex items-center gap-2">
            <Badge variant={OUTGOING_STATUS_VARIANT[status]}>{OUTGOING_STATUS_LABELS[status]}</Badge>
            <span className="text-xs text-ink-500 dark:text-white/40">{OUTGOING_STATUS_HINTS[status]}</span>
          </span>
        </div>

        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500 dark:text-white/40">
            Nothing submitted yet. Attach the draft below to send it to the Division Chief.
          </p>
        ) : (
          <ol className="mt-4 space-y-4">
            {timeline.map((entry) =>
              entry.kind === "version" ? (
                <li
                  key={entry.version.id}
                  className="border-l-2 border-ink-400/20 pl-4 text-sm dark:border-white/15"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-ink-900 dark:text-white">v{entry.version.versionNumber}</span>
                    <span className="text-ink-500 dark:text-white/40">
                      submitted by {entry.version.submittedByName} · {formatWhen(entry.version.submittedAt)}
                    </span>
                  </p>
                  <p className="mt-1">
                    <a
                      href={`/api/files/${entry.version.fileUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-info hover:underline"
                    >
                      {entry.version.fileName}
                    </a>
                  </p>
                  {entry.version.staffNote && (
                    <p className="mt-1 whitespace-pre-wrap text-ink-700 dark:text-white/70">
                      {entry.version.staffNote}
                    </p>
                  )}

                  {entry.version.reviewedAt ? (
                    <p className="mt-2 rounded-md bg-surface px-3 py-2 dark:bg-ink-900">
                      <span
                        className={
                          entry.version.outcome === "APPROVED"
                            ? "font-medium text-success-700 dark:text-success"
                            : "font-medium text-[#92660c] dark:text-warning"
                        }
                      >
                        {entry.version.outcome === "APPROVED" ? "Approved" : "Returned"}
                      </span>{" "}
                      <span className="text-ink-500 dark:text-white/40">
                        by {entry.version.reviewedByName} · {formatWhen(entry.version.reviewedAt)}
                      </span>
                      {entry.version.chiefRemarks && (
                        <span className="mt-1 block whitespace-pre-wrap text-ink-700 dark:text-white/70">
                          {entry.version.chiefRemarks}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-ink-500 dark:text-white/40">Waiting on the Division Chief.</p>
                  )}
                </li>
              ) : (
                <li key={entry.note.id} className="border-l-2 border-dashed border-ink-400/20 pl-4 text-sm dark:border-white/15">
                  <p className="text-ink-500 dark:text-white/40">
                    {entry.note.authorName} · {formatWhen(entry.note.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink-700 dark:text-white/70">{entry.note.body}</p>
                </li>
              ),
            )}
          </ol>
        )}
      </div>

      {/* The Chief's verdict. Shown only while a submission is actually
          waiting — an approve button on a document nobody has sent up is an
          invitation to approve nothing. */}
      {awaitingReview && canReview && latest && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
            Check v{latest.versionNumber}
          </h3>
          <label className="field-label mt-3" htmlFor="chiefRemarks">
            Remarks
          </label>
          <textarea
            id="chiefRemarks"
            rows={3}
            value={chiefRemarks}
            onChange={(e) => setChiefRemarks(e.target.value)}
            placeholder="Required when returning — say what needs changing."
            className="field-input"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => review("APPROVED")}
              disabled={busy !== null}
              className="btn-primary"
            >
              {busy === "review" ? "Saving…" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => review("RETURNED")}
              disabled={busy !== null}
              className="btn-secondary"
            >
              Return for revision
            </button>
          </div>
        </div>
      )}

      {awaitingReview && !canReview && (
        <p className="text-sm text-ink-500 dark:text-white/40">
          Submitted and waiting on the Division Chief. You will be notified when it comes back.
        </p>
      )}

      {/* The last step, and the only one that writes to both ledgers: the
          dispatch becomes a register entry and the document it answers is
          closed. Offered to whoever holds the record rather than to the Chief
          alone — the decision was made at approval, and putting the document in
          an envelope is the records desk's job. */}
      {awaitingRelease && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Release</h3>
          <p className="mt-1 text-sm text-ink-500 dark:text-white/40">
            Approved and ready to go out. Releasing moves this into the register and closes the
            incoming document it answers.
          </p>
          <label className="field-label mt-3" htmlFor="releaseDate">
            Date released
          </label>
          <input
            id="releaseDate"
            type="date"
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
            className="field-input"
          />
          <button type="button" onClick={release} disabled={busy !== null} className="btn-primary mt-3">
            {busy === "release" ? "Releasing…" : "Release"}
          </button>
        </div>
      )}

      {canSubmit && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
            {versions.length === 0 ? "Submit for checking" : `Submit v${versions.length + 1}`}
          </h3>
          {status === "RETURNED" && (
            <p className="mt-1 text-sm text-ink-500 dark:text-white/40">
              This came back for revision. Attach the corrected draft and send it up again.
            </p>
          )}
          <div className="mt-3">
            <FileUploadField label="Draft" value={fileUrl} onChange={setFileUrl} />
          </div>
          <label className="field-label mt-3" htmlFor="staffNote">
            What changed
          </label>
          <textarea
            id="staffNote"
            rows={2}
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            placeholder="Optional — helps the Chief see what to look at."
            className="field-input"
          />
          <button type="button" onClick={submitVersion} disabled={busy !== null} className="btn-primary mt-3">
            {busy === "submit" ? "Submitting…" : "Submit for checking"}
          </button>
        </div>
      )}

      {/* Always available, in every status. Somebody held up by an outside
          party has to be able to say so without inventing a draft to attach. */}
      <div className="card p-6">
        <label className="field-label" htmlFor="noteBody">
          Add a progress note
        </label>
        <textarea
          id="noteBody"
          rows={2}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Waiting on the employer's certification…"
          className="field-input"
        />
        <button
          type="button"
          onClick={addNote}
          disabled={busy !== null || !noteBody.trim()}
          className="btn-secondary mt-3"
        >
          {busy === "note" ? "Saving…" : "Add note"}
        </button>
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}
    </section>
  );
}

// Local-time YYYY-MM-DD, matching IncomingForm's helper and for the same
// reason: toISOString() shifts to UTC and can date a late-afternoon release
// here (UTC+8) to the previous day.
const todayInputValue = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

// Dates are formatted on the client so they read in the viewer's own timezone,
// which for this office is the same one the document was filed in.
function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
