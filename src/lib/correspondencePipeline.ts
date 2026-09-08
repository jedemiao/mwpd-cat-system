import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// A document works through a fixed sequence of hands: it arrives at the desk,
// the Division Chief routes it to staff, that staff member drafts the reply,
// the Chief checks the reply, and the reply is released — which closes the
// incoming record. Every one of those handovers is a place a document can sit
// unnoticed, and the ledger view cannot show it: a list sorted by date received
// looks the same whether a document is moving or stalled.
//
// This is the "where is everything stuck" question, which is distinct from the
// ARTA board's "what is late" question. A document can be days from its due
// date and still be stuck (nobody has picked it up); a document can be overdue
// and not stuck at all (someone is actively working it). The dashboard shows
// both boards because they catch different failures.
//
// The stages changed when the reply became a real record with a review loop.
// The old board asked only about the incoming row, so it could see a document
// being routed but not what happened next, and its "signed off" stage keyed off
// IncomingDocument.dcSignOffDate — a field nothing writes any more, now that
// the Division Chief approves a version of the reply instead. Three of these
// five stages read through to the reply for that reason.
export const PIPELINE_STAGES = [
  "unrouted",
  "unanswered",
  "drafting",
  "for-checking",
  "awaiting-release",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

// The stage predicates live here, as data, because two places consume them: the
// dashboard board counts them, and /incoming?stage=... filters the ledger by
// them. Defining each stage twice would let the number on the dashboard and the
// rows behind it drift apart, which is the one bug that would make the whole
// board untrustworthy.
//
// Every stage is scoped to open documents (dateCompleted null), because a
// closed document is not stuck anywhere — releasing the reply closes it, so a
// document with a date completed has already reached the end of this sequence.
//
// The five stages partition the open documents in the ordinary case. The one
// arrangement that can put a document in two cells at once is a document with
// two open replies in different states, which needs a -R2 reply to exist at
// all — rare enough that contorting these queries to exclude it would cost more
// clarity than the double count costs accuracy.
export function pipelineStageWhere(stage: PipelineStage): Prisma.IncomingDocumentWhereInput {
  const open = { dateCompleted: null };
  // "Open" on the reply side means it has not gone out yet. A released reply
  // closes its incoming document, so it never reaches these stages anyway —
  // stated explicitly so each predicate reads on its own.
  const openReply = (status: Prisma.OutgoingDocumentWhereInput["status"]) => ({
    ...open,
    outgoingReplies: { some: { status } },
  });

  switch (stage) {
    // Received, and nobody has been given it. The clock is already running.
    case "unrouted":
      return { ...open, routedTo: { none: {} } };
    // Assigned, but nobody has started the reply. This is the gap between being
    // handed a document and doing anything about it — the stage that used to be
    // invisible, because the old board counted "routed" as progress.
    case "unanswered":
      return { ...open, routedTo: { some: {} }, outgoingReplies: { none: {} } };
    // The reply is being written, or has come back for revision. Normal working
    // state; a healthy office has documents here.
    case "drafting":
      return openReply({ in: ["DRAFT", "RETURNED"] });
    // Submitted and sitting with the Division Chief.
    case "for-checking":
      return openReply("FOR_CHECKING");
    // The Chief has approved it and it has not gone out. Nothing is waiting on
    // a decision here — it is a dispatch step somebody has not done yet, which
    // is exactly the kind of stall nobody notices.
    case "awaiting-release":
      return openReply("APPROVED");
  }
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  unrouted: "Unrouted",
  unanswered: "Not started",
  drafting: "With staff",
  "for-checking": "With the Chief",
  "awaiting-release": "Awaiting release",
};

// The one-line explanation of what the number means, shown under each count.
// Written for someone who has to act on it, not as a restatement of the label.
export const PIPELINE_STAGE_HINTS: Record<PipelineStage, string> = {
  unrouted: "Received, not yet assigned",
  unanswered: "Assigned, no reply started",
  drafting: "Reply being written or revised",
  "for-checking": "Submitted, awaiting checking",
  "awaiting-release": "Approved, not yet sent out",
};

export type PipelineCounts = Partial<Record<PipelineStage, number>>;

export async function getOfficePipeline(
  officeId: string,
): Promise<{ stages: readonly PipelineStage[]; counts: PipelineCounts }> {
  const counted = await Promise.all(
    PIPELINE_STAGES.map((stage) =>
      prisma.incomingDocument.count({ where: { officeId, ...pipelineStageWhere(stage) } }),
    ),
  );

  return {
    stages: PIPELINE_STAGES,
    counts: Object.fromEntries(PIPELINE_STAGES.map((stage, i) => [stage, counted[i]])) as PipelineCounts,
  };
}
