import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDelete } from "@/lib/authz";
import { officeTracksLegalAssistance } from "@/lib/legalAssistance";
import { DeleteButton } from "@/components/DeleteButton";
import { LegalAssistanceForm } from "../LegalAssistanceForm";

export default async function EditLegalAssistancePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Checked as well as the office scoping below — the two catch different
  // things: scoping stops one office opening another's row, this stops an
  // office that keeps no legal assistance register reaching the module at all.
  if (!(await officeTracksLegalAssistance(officeId))) notFound();

  const [row, officers] = await Promise.all([
    prisma.legalAssistance.findFirst({ where: { id: params.id, officeId } }),
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
        Edit legal assistance record
      </h1>
      <LegalAssistanceForm
        mode="edit"
        id={row.id}
        officers={officers}
        initialData={{
          // The date input wants YYYY-MM-DD, and the stored value carries no
          // meaningful time — slicing the ISO string keeps it on the day it was
          // saved rather than shifting it by the viewer's offset.
          assistanceDate: row.assistanceDate.toISOString().slice(0, 10),
          legalOfficerId: row.legalOfficerId,
          clientName: row.clientName,
          sex: row.sex,
          forms: row.forms,
          othersDetail: row.othersDetail ?? "",
          scannedCopyUrl: row.scannedCopyUrl ?? "",
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton endpoint={`/api/legal-assistance/${row.id}`} redirectTo="/legal-assistance" />
      )}
    </main>
  );
}
