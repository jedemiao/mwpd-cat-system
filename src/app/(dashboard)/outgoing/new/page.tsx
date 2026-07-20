import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OutgoingForm } from "../OutgoingForm";

export default async function NewOutgoingPage() {
  const session = await getServerSession(authOptions);

  const incomingDocs = await prisma.incomingDocument.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { dateReceived: "desc" },
    select: { id: true, routingNumber: true, documentTitle: true },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New outgoing document</h1>
      <OutgoingForm mode="create" incomingDocs={incomingDocs} />
    </main>
  );
}
