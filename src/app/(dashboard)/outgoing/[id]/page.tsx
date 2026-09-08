import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete, canSignOffAsChief } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { getLinkableActivities } from "@/lib/linkableActivities";
import { OutgoingForm } from "../OutgoingForm";
import { ReplyWorkspace } from "./ReplyWorkspace";
import { RECEIVING_OFFICES } from "@/lib/receivingOffices";
import { resolveReceivingOffices } from "@/lib/documentDelivery";

export default async function EditOutgoingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const [doc, office] = await Promise.all([
    prisma.outgoingDocument.findFirst({
      where: { id: params.id, officeId: session!.user.officeId },
      include: {
        linkedActivities: { select: { activityId: true } },
        relatedIncoming: { select: { id: true, routingNumber: true, documentTitle: true } },
        versions: {
          orderBy: { versionNumber: "asc" },
          include: {
            submittedBy: { select: { name: true } },
            reviewedBy: { select: { name: true } },
          },
        },
        notes: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true } } },
        },
      },
    }),
    prisma.office.findUnique({
      where: { id: session!.user.officeId },
      select: { requiresChiefApproval: true, detailedLedgerColumns: true },
    }),
  ]);

  if (!doc) notFound();

  const registerStyle = office?.detailedLedgerColumns ?? false;
  const linkedActivityIds = doc.linkedActivities.map((l) => l.activityId);
  const activities = registerStyle
    ? await getLinkableActivities(session!.user.officeId, linkedActivityIds)
    : [];

  // A released document is a register entry — the work is over and what is left
  // is the receipt. Anything else is live work, and gets the checking history
  // and the actions that move it along.
  const isReleased = doc.status === "RELEASED";

  // Which office codes actually name a division holding records here, asked
  // of the Office table rather than hardcoded — ARD and ADJU resolve to
  // nothing today, and that could change without this page knowing.
  const deliverable = (await resolveReceivingOffices(RECEIVING_OFFICES)).map((o) => o.code);
  const deliverableOffices = RECEIVING_OFFICES.filter((code) =>
    deliverable.some((c) => c === code || c.startsWith(`${code}-`)),
  );

  return (
    <main className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
        {isReleased ? "Edit outgoing document" : "Reply"}
        {doc.routingNumber ? ` — ${doc.routingNumber}` : ""}
      </h1>

      {/* The other half of the transaction. On a reply this is the whole point
          of the record, so it is stated at the top rather than buried in a
          field: same routing number, two ledgers, one piece of work. */}
      {doc.relatedIncoming ? (
        <p className="mb-4 mt-1 text-sm text-ink-500 dark:text-white/40">
          Answering{" "}
          <Link href={`/incoming/${doc.relatedIncoming.id}`} className="text-info hover:underline">
            <span className="font-mono text-xs">{doc.relatedIncoming.routingNumber}</span>{" "}
            {doc.relatedIncoming.documentTitle}
          </Link>
        </p>
      ) : (
        <p className="mb-4 mt-1 text-sm text-ink-500 dark:text-white/40">
          Started by this division — not a reply to a received document.
        </p>
      )}

      <OutgoingForm
        deliverableOffices={deliverableOffices}
        mode="edit"
        id={doc.id}
        registerStyle={registerStyle}
        activities={activities}
        initialData={{
          dateReleased: toDateInputValue(doc.dateReleased),
          routingNumber: doc.routingNumber ?? "",
          documentTypeOther: doc.documentTypeOther ?? "",
          documentTitle: doc.documentTitle,
          instructions: doc.instructions ?? "",
          receivingOffice: doc.receivingOffice ?? "",
          receivedBy: doc.receivedBy ?? "",
          receivedDate: doc.receivedDate ? toDateInputValue(doc.receivedDate) : "",
          receivedTime: doc.receivedTime ?? "",
          progressRemarks: doc.progressRemarks ?? "",
          scannedCopyUrl: doc.scannedCopyUrl ?? "",
          filed: doc.filed,
          activityIds: linkedActivityIds,
        }}
      />

      {/* Serialised to plain strings here rather than passing Date objects into
          a client component, and formatted on the client so the times read in
          the viewer's own timezone. */}
      <ReplyWorkspace
        outgoingId={doc.id}
        status={doc.status}
        canReview={canSignOffAsChief(session!.user.role)}
        requiresApproval={office?.requiresChiefApproval ?? true}
        versions={doc.versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          fileUrl: v.fileUrl,
          fileName: v.fileName,
          staffNote: v.staffNote,
          submittedByName: v.submittedBy.name,
          submittedAt: v.submittedAt.toISOString(),
          outcome: v.outcome,
          chiefRemarks: v.chiefRemarks,
          reviewedByName: v.reviewedBy?.name ?? null,
          reviewedAt: v.reviewedAt?.toISOString() ?? null,
        }))}
        notes={doc.notes.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.author.name,
          createdAt: n.createdAt.toISOString(),
        }))}
      />

      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/outgoing/${doc.id}`} redirectTo="/outgoing" />}
    </main>
  );
}
