"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_TYPE_CODES } from "@/lib/documentTypeCodes";
import { InboxIcon } from "./icons";

export type PendingDelivery = {
  id: string;
  fromOfficeCode: string;
  fromOfficeName: string;
  documentTitle: string;
  senderRoutingNumber: string | null;
  documentType: string | null;
  dateReleased: string | null;
  hasScan: boolean;
};

/**
 * Documents another division has released to this office and this office has
 * not yet filed.
 *
 * It sits above the register rather than inside it because these are not
 * entries yet: nothing here has a routing number in this office, and filing one
 * is what creates it. Showing them among the filed rows would put documents in
 * the ledger that the ledger does not actually contain.
 */
export function DeliveryTray({
  deliveries,
  tracksArta,
}: {
  deliveries: PendingDelivery[];
  /** Whether this office is under ARTA. Only MWPTD is; for the rest the
      complexity choice sets a clock that does not run for them. */
  tracksArta: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Today, in the browser's own date — the receiving clerk's date, which is the
  // fact this form is recording.
  const today = new Date().toLocaleDateString("en-CA");
  const [dateReceived, setDateReceived] = useState(today);
  const [timeReceived, setTimeReceived] = useState("");
  const [documentType, setDocumentType] = useState("L");
  const [complexity, setComplexity] = useState("SIMPLE");

  if (deliveries.length === 0) return null;

  function open(delivery: PendingDelivery) {
    setOpenId(delivery.id);
    setError(null);
    setDateReceived(today);
    setTimeReceived("");
    // Prefilled from what the sender called it, but editable: how the document
    // is classified here is this office's own judgement.
    setDocumentType(delivery.documentType ?? "L");
    setComplexity("SIMPLE");
  }

  async function receive(id: string) {
    setBusyId(id);
    setError(null);

    const res = await fetch(`/api/deliveries/${id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateReceived, timeReceived: timeReceived || undefined, documentType, complexity }),
    });

    setBusyId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Could not file this delivery.");
      return;
    }

    setOpenId(null);
    router.refresh();
  }

  return (
    <section className="rounded-md border border-info/40 bg-info/5 p-4 dark:border-info/30 dark:bg-info/10">
      <div className="mb-3 flex items-center gap-2">
        <InboxIcon className="h-4 w-4 text-info" />
        <h2 className="text-sm font-semibold text-ink-900 dark:text-white">
          Delivered to this division
        </h2>
        <span className="rounded-full bg-info px-2 py-0.5 text-[11px] font-semibold leading-none text-white">
          {deliveries.length}
        </span>
      </div>
      <p className="mb-3 text-xs text-ink-600 dark:text-white/50">
        Released to you by another division and not yet in your register. Filing one gives it your
        own routing number and tells the sender it arrived.
      </p>

      <ul className="space-y-2">
        {deliveries.map((delivery) => (
          <li
            key={delivery.id}
            className="rounded-md border border-ink-400/20 bg-white p-3 dark:border-white/10 dark:bg-ink-800"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-white/40">
                  From {delivery.fromOfficeCode}
                  {delivery.senderRoutingNumber ? ` · their ref ${delivery.senderRoutingNumber}` : ""}
                  {delivery.hasScan ? " · scan attached" : ""}
                </span>
                <span className="block font-medium text-ink-900 dark:text-white">
                  {delivery.documentTitle}
                </span>
              </div>
              {openId !== delivery.id && (
                <button type="button" onClick={() => open(delivery)} className="btn-primary shrink-0">
                  Receive
                </button>
              )}
            </div>

            {openId === delivery.id && (
              <div className="mt-3 space-y-3 border-t border-ink-400/15 pt-3 dark:border-white/10">
                <div className={`grid grid-cols-2 gap-3 ${tracksArta ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                  <div>
                    <label className="field-label" htmlFor={`date-${delivery.id}`}>
                      Date received
                    </label>
                    <input
                      id={`date-${delivery.id}`}
                      type="date"
                      value={dateReceived}
                      onChange={(e) => setDateReceived(e.target.value)}
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`time-${delivery.id}`}>
                      Time received
                    </label>
                    <input
                      id={`time-${delivery.id}`}
                      type="time"
                      value={timeReceived}
                      onChange={(e) => setTimeReceived(e.target.value)}
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`type-${delivery.id}`}>
                      Type
                    </label>
                    <select
                      id={`type-${delivery.id}`}
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="field-input"
                    >
                      {DOCUMENT_TYPE_CODES.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} — {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* ARTA is MWPTD's duty alone. Elsewhere this would ask the
                      clerk to classify a document against a deadline their
                      office does not answer to. */}
                  {tracksArta && (
                  <div>
                    <label className="field-label" htmlFor={`complexity-${delivery.id}`}>
                      Complexity
                    </label>
                    <select
                      id={`complexity-${delivery.id}`}
                      value={complexity}
                      onChange={(e) => setComplexity(e.target.value)}
                      className="field-input"
                    >
                      <option value="SIMPLE">Simple (3 days)</option>
                      <option value="COMPLEX">Complex (7 days)</option>
                      <option value="HIGHLY_TECHNICAL">Highly technical (20 days)</option>
                    </select>
                  </div>
                  )}
                </div>

                {error && <p className="text-sm text-danger-600">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === delivery.id}
                    onClick={() => receive(delivery.id)}
                    className="btn-primary"
                  >
                    {busyId === delivery.id ? "Filing…" : "File in our register"}
                  </button>
                  <button type="button" onClick={() => setOpenId(null)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
