import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSignOffAsChief } from "@/lib/authz";
import { IncomingForm } from "../IncomingForm";

export default async function NewIncomingPage() {
  const session = await getServerSession(authOptions);

  const users = await prisma.user.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New incoming document</h1>
      <IncomingForm mode="create" users={users} canSignOff={canSignOffAsChief(session!.user.role)} />
    </main>
  );
}
