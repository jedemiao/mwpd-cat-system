import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeTracksLegalAssistance } from "@/lib/legalAssistance";
import { LegalAssistanceForm } from "../LegalAssistanceForm";

export default async function NewLegalAssistancePage() {
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksLegalAssistance(officeId))) notFound();

  // The whole active roster, not only the lawyers: the app holds no "is a legal
  // officer" fact, and inventing one to filter this list would be a second
  // place for the roster to be wrong.
  const officers = await prisma.user.findMany({
    where: { officeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        New legal assistance record
      </h1>
      <LegalAssistanceForm mode="create" officers={officers} />
    </main>
  );
}
