import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeTracksRegulationLicensing } from "@/lib/regulationLicensing";
import { RegulationLicensingForm } from "../RegulationLicensingForm";

export default async function NewRegulationLicensingPage() {
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksRegulationLicensing(officeId))) notFound();

  // The whole active roster: the app holds no "works the licensing desk" fact,
  // and inventing one to filter this list would be a second place for the
  // roster to be wrong.
  const staff = await prisma.user.findMany({
    where: { officeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        New regulation and licensing record
      </h1>
      <RegulationLicensingForm mode="create" staff={staff} />
    </main>
  );
}
