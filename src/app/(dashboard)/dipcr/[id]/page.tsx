import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDelete } from "@/lib/authz";
import { getDipcrFormData } from "@/lib/dipcrFormData";
import { officeTracksDipcr } from "@/lib/dipcr";
import { DeleteButton } from "@/components/DeleteButton";
import { DipcrForm } from "../DipcrForm";

export default async function EditDipcrPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Checked as well as the office scoping below — the two catch different
  // things: scoping stops one office opening another's row, this stops an
  // office that keeps no D/IPCR reaching the module at all.
  if (!(await officeTracksDipcr(officeId))) notFound();

  const [indicator, { users }] = await Promise.all([
    prisma.dipcrIndicator.findFirst({
      where: { id: params.id, officeId },
      include: {
        accountable: { select: { userId: true } },
        accomplishments: { orderBy: { month: "asc" } },
      },
    }),
    getDipcrFormData(officeId),
  ]);

  if (!indicator) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Edit success indicator</h1>
      <DipcrForm
        mode="edit"
        id={indicator.id}
        users={users}
        initialData={{
          year: indicator.year,
          semester: indicator.semester,
          section: indicator.section,
          pap: indicator.pap,
          successIndicator: indicator.successIndicator,
          // A Prisma Decimal cannot cross into a client component, and routing
          // money through a float would be wrong — so it goes as its string.
          allottedBudget: indicator.allottedBudget?.toString() ?? "",
          remarks: indicator.remarks ?? "",
          sortOrder: indicator.sortOrder,
          accountableIds: indicator.accountable.map((a) => a.userId),
          accomplishments: indicator.accomplishments.map((a) => ({
            month: a.month,
            narrative: a.narrative,
          })),
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton endpoint={`/api/dipcr/${indicator.id}`} redirectTo="/dipcr" />
      )}
    </main>
  );
}
