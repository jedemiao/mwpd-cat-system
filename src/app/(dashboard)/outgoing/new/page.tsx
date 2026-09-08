import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLinkableActivities } from "@/lib/linkableActivities";
import { OutgoingForm } from "../OutgoingForm";
import { RECEIVING_OFFICES } from "@/lib/receivingOffices";
import { resolveReceivingOffices } from "@/lib/documentDelivery";

export default async function NewOutgoingPage() {
  const session = await getServerSession(authOptions);

  const office = await prisma.office.findUnique({
    where: { id: session!.user.officeId },
    select: { detailedLedgerColumns: true },
  });
  const registerStyle = office?.detailedLedgerColumns ?? false;

  // Only the register-style form has the activity picker, so only it pays for
  // the query.
  const activities = registerStyle ? await getLinkableActivities(session!.user.officeId) : [];

  // Which office codes actually name a division holding records here, asked
  // of the Office table rather than hardcoded — ARD and ADJU resolve to
  // nothing today, and that could change without this page knowing.
  const deliverable = (await resolveReceivingOffices(RECEIVING_OFFICES)).map((o) => o.code);
  const deliverableOffices = RECEIVING_OFFICES.filter((code) =>
    deliverable.some((c) => c === code || c.startsWith(`${code}-`)),
  );

  return (
    <main className="p-6 lg:p-8">
      {/* This screen is for a dispatch the division starts itself — a
          transmittal, a report, an invitation. A reply to a received document
          is never created here: it is started from the incoming record, so it
          inherits that document's routing number instead of claiming a new
          one. See POST /api/incoming/[id]/reply. */}
      <h1 className="text-xl font-semibold text-ink-900 dark:text-white">New outgoing document</h1>
      <p className="mb-4 mt-1 text-sm text-ink-500 dark:text-white/40">
        For a dispatch this division is starting itself. To answer a received
        document, open it under Incoming and use Draft reply — the reply keeps
        that document&rsquo;s routing number.
      </p>
      <OutgoingForm deliverableOffices={deliverableOffices} mode="create" registerStyle={registerStyle} activities={activities} />
    </main>
  );
}
