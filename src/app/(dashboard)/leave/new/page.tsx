import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeaveForm } from "../LeaveForm";

export default async function NewLeavePage() {
  const session = await getServerSession(authOptions);

  const users = await prisma.user.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">File leave</h1>
      <LeaveForm mode="create" users={users} />
    </main>
  );
}
