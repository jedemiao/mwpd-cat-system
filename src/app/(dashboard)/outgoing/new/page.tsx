import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLinkableActivities } from "@/lib/linkableActivities";
import { OutgoingForm } from "../OutgoingForm";

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

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New outgoing document</h1>
      <OutgoingForm mode="create" registerStyle={registerStyle} activities={activities} />
    </main>
  );
}
