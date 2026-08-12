import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// MWPTD works a document through a fixed sequence of hands: it arrives at the
// desk, the Division Chief routes it to staff, ADAS III records it as
// completed, and the reply goes out on the Outgoing ledger. Every one of those
// handovers is a place a document can sit unnoticed, and the ledger view can't
// show it — a list sorted by date received looks the same whether a document is
// moving or stalled.
//
// This is the "where is everything stuck" question, which is distinct from the
// ARTA board's "what is late" question. A document can be days from its due
// date and still be stuck (nobody has been given it); a document can be overdue
// and not stuck at all (someone is actively working it). The dashboard shows
// both boards because they catch different failures.
export const PIPELINE_STAGES = ["unrouted", "routed", "signed-off", "undispatched"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

// Not every office has a Division Chief sign-off step. Where the incoming
// record is the office's register and that register has no sign-off column
// (Office.incomingRegisterForm), dcSignOffDate is never set, and a stage
// counting it would sit at zero forever while quietly changing the meaning of
// the two stages beside it — see the predicates below.
export function pipelineStagesFor(tracksSignOff: boolean): readonly PipelineStage[] {
  return tracksSignOff ? PIPELINE_STAGES : PIPELINE_STAGES.filter((s) => s !== "signed-off");
}

// The stage predicates live here, as data, because two places consume them: the
// dashboard board counts them, and /incoming?stage=... filters the ledger by
// them. Defining each stage twice would let the number on the dashboard and the
// rows behind it drift apart, which is the one bug that would make the whole
// board untrustworthy.
//
// The open stages partition the open documents — every document with no
// dateCompleted lands in exactly one of them, so the counts never double-count
// and never hide a document between stages.
//
// That partition is why `tracksSignOff` has to reach in here rather than just
// hiding a tile. Where sign-off exists, `unrouted` and `routed` must exclude a
// signed-off document or it would be counted twice; where it does not, they
// must NOT exclude it, or a document carrying a stale sign-off date from before
// the office adopted this register would belong to no stage at all and vanish
// off the board.
export function pipelineStageWhere(
  stage: PipelineStage,
  tracksSignOff: boolean,
): Prisma.IncomingDocumentWhereInput {
  const openAndUnsignedOff = tracksSignOff
    ? { dateCompleted: null, dcSignOffDate: null }
    : { dateCompleted: null };

  switch (stage) {
    // Received but nobody has been given it yet. The clock is already running.
    case "unrouted":
      return { ...openAndUnsignedOff, routedTo: { none: {} } };
    // In someone's hands and not yet closed — the normal working state.
    case "routed":
      return { ...openAndUnsignedOff, routedTo: { some: {} } };
    // The Division Chief has signed off but the record was never closed.
    // Nothing is waiting on a decision here; it is a filing step that got
    // skipped. Only meaningful where the office has a sign-off step at all.
    case "signed-off":
      return { dateCompleted: null, dcSignOffDate: { not: null } };
    // Closed with no dispatch recorded against it. Not every incoming document
    // earns a reply, so this count is not a defect list — it is the office's own
    // measure of how consistently replies get linked back to what prompted them
    // (OutgoingDocument.relatedIncomingId, the cross-ledger link the Excel
    // tracker only ever had as a typed note).
    case "undispatched":
      return { dateCompleted: { not: null }, outgoingReplies: { none: {} } };
  }
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  unrouted: "Unrouted",
  routed: "With staff",
  "signed-off": "Awaiting closure",
  undispatched: "Closed, no reply",
};

// The one-line explanation of what the number means, shown under each count.
// Written for someone who has to act on it, not as a restatement of the label.
export const PIPELINE_STAGE_HINTS: Record<PipelineStage, string> = {
  unrouted: "Received, not yet assigned",
  routed: "Being worked, not yet closed",
  "signed-off": "Signed off, not closed out",
  undispatched: "Completed, no outgoing linked",
};

export type PipelineCounts = Partial<Record<PipelineStage, number>>;

// An office has a Division Chief sign-off step unless its incoming record is a
// register with no sign-off column. Read through one function so the dashboard
// board and the ledger's stage filter can never answer this differently.
export async function officeTracksSignOff(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { incomingRegisterForm: true },
  });
  return !(office?.incomingRegisterForm ?? false);
}

export async function getOfficePipeline(
  officeId: string,
): Promise<{ stages: readonly PipelineStage[]; counts: PipelineCounts }> {
  const tracksSignOff = await officeTracksSignOff(officeId);
  const stages = pipelineStagesFor(tracksSignOff);

  const counted = await Promise.all(
    stages.map((stage) =>
      prisma.incomingDocument.count({ where: { officeId, ...pipelineStageWhere(stage, tracksSignOff) } }),
    ),
  );

  return {
    stages,
    counts: Object.fromEntries(stages.map((stage, i) => [stage, counted[i]])) as PipelineCounts,
  };
}
