import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDelete } from "@/lib/authz";
import { getDipcrFormData } from "@/lib/dipcrFormData";
import { officeTracksIpcrRatingGuide } from "@/lib/ipcrRatingGuide";
import { DeleteButton } from "@/components/DeleteButton";
import { IpcrRatingGuideForm } from "../IpcrRatingGuideForm";

export default async function EditIpcrRatingGuidePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Checked as well as the office scoping below — the two catch different
  // things: scoping stops one office opening another's row, this stops an
  // office that keeps no rating guide reaching the module at all.
  if (!(await officeTracksIpcrRatingGuide(officeId))) notFound();

  const [row, { users }] = await Promise.all([
    prisma.ipcrRatingGuideRow.findFirst({
      where: { id: params.id, officeId },
      include: {
        accountable: { select: { userId: true } },
        ratings: true,
      },
    }),
    getDipcrFormData(officeId),
  ]);

  if (!row) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        Edit rated indicator
      </h1>
      <IpcrRatingGuideForm
        mode="edit"
        id={row.id}
        users={users}
        initialData={{
          year: row.year,
          semester: row.semester,
          section: row.section,
          pap: row.pap,
          successIndicator: row.successIndicator,
          meansOfVerification: row.meansOfVerification ?? "",
          sortOrder: row.sortOrder,
          accountableIds: row.accountable.map((a) => a.userId),
          descriptors: row.ratings.map((r) => ({
            dimension: r.dimension,
            level5: r.level5,
            level4: r.level4,
            level3: r.level3,
            level2: r.level2,
            level1: r.level1,
          })),
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton
          endpoint={`/api/ipcr-rating-guide/${row.id}`}
          redirectTo="/ipcr-rating-guide"
        />
      )}
    </main>
  );
}
