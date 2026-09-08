"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { OUTGOING_STATUS_LABELS, OUTGOING_STATUS_VARIANT } from "@/lib/outgoingStatus";
import type { OutgoingStatus } from "@prisma/client";

type Reply = {
  id: string;
  routingNumber: string | null;
  documentTitle: string;
  status: OutgoingStatus;
};

// The handover between the two ledgers, shown on the incoming record because
// that is where somebody stands when they decide a document needs answering.
//
// Every document the Division Chief routes is answered, so this panel has only
// two states: no reply started yet, or here is the reply and its progress. It
// is deliberately not a form — starting a reply asks nothing, because the reply
// inherits everything it needs (the routing number, the document type, what it
// is answering) from the document above it.
export function ReplyPanel({
  incomingId,
  replies,
  routed,
}: {
  incomingId: string;
  replies: Reply[];
  routed: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startReply() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/incoming/${incomingId}/reply`, { method: "POST" });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not start the reply. Please try again.");
      // A 409 means somebody else started it a moment ago, so the list on
      // screen is stale — refresh so their reply appears instead of leaving
      // this person looking at a button that will never work.
      if (res.status === 409) router.refresh();
      return;
    }

    const doc = await res.json();
    router.push(`/outgoing/${doc.id}`);
  }

  return (
    <section className="card mt-6 max-w-2xl p-6">
      <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Reply</h2>

      {replies.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {replies.map((reply) => (
            <li key={reply.id} className="flex items-center justify-between gap-4 text-sm">
              <span className="min-w-0">
                <span className="font-mono text-xs text-ink-500 dark:text-white/40">
                  {reply.routingNumber ?? "Numbered at release"}
                </span>{" "}
                <span className="text-ink-900 dark:text-white">{reply.documentTitle}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <Badge variant={OUTGOING_STATUS_VARIANT[reply.status]}>{OUTGOING_STATUS_LABELS[reply.status]}</Badge>
                <Link href={`/outgoing/${reply.id}`} className="font-medium text-primary hover:text-primary-600">
                  Open
                </Link>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-500 dark:text-white/40">
            {routed
              ? "No reply started yet. Starting one opens a draft on the Outgoing work board, carrying this document's routing number."
              : "Route this document to a staff member first — the reply is their work, and it inherits the assignment from here."}
          </p>
          {/* Available whether or not the document is routed, but only
              encouraged once it is: the office does start the occasional reply
              before the assignment is settled, and blocking that outright would
              be the app disagreeing with the room. */}
          <button type="button" onClick={startReply} disabled={loading} className="btn-primary mt-3">
            {loading ? "Starting…" : "Draft reply"}
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
    </section>
  );
}
