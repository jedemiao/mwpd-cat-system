import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDelete } from "@/lib/authz";
import { officeTracksRegulationLicensing } from "@/lib/regulationLicensing";
import { DeleteButton } from "@/components/DeleteButton";
import { RegulationLicensingForm } from "../RegulationLicensingForm";

export default async function EditRegulationLicensingPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Checked as well as the office scoping below — the two catch different
  // things: scoping stops one office opening another's row, this stops an
  // office that runs no licensing desk reaching the module at all.
  if (!(await officeTracksRegulationLicensing(officeId))) notFound();

  const [row, staff] = await Promise.all([
    prisma.regulationLicensing.findFirst({ where: { id: params.id, officeId } }),
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!row) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        Edit regulation and licensing record
      </h1>
      <RegulationLicensingForm
        mode="edit"
        id={row.id}
        staff={staff}
        initialData={{
          // The date input wants YYYY-MM-DD, and the stored value carries no
          // meaningful time — slicing the ISO string keeps it on the day it was
          // saved rather than shifting it by the viewer's offset.
          serviceDate: row.serviceDate.toISOString().slice(0, 10),
          personnelId: row.personnelId,
          requestingParty: row.requestingParty,
          sex: row.sex,
          services: row.services,
          othersDetail: row.othersDetail ?? "",
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton
          endpoint={`/api/regulation-licensing/${row.id}`}
          redirectTo="/regulation-licensing"
        />
      )}
    </main>
  );
}
