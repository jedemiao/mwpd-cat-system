import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { DeleteButton } from "@/components/DeleteButton";
import { InternalForm } from "../InternalForm";

export default async function EditInternalPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  const memo = await prisma.internalMemo.findFirst({
    where: { id: params.id, officeId: session!.user.officeId },
  });

  if (!memo) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        Edit internal memorandum — #{memo.memorandumNumber}
      </h1>
      <InternalForm
        mode="edit"
        id={memo.id}
        initialData={{
          dateReleased: toDateInputValue(memo.dateReleased),
          memorandumNumber: memo.memorandumNumber,
          documentTitle: memo.documentTitle,
          instructions: memo.instructions ?? "",
          receivedBy: memo.receivedBy ?? "",
          progressRemarks: memo.progressRemarks ?? "",
          scannedCopyUrl: memo.scannedCopyUrl ?? "",
          filed: memo.filed,
        }}
      />
      {canDelete(session!.user.role) && <DeleteButton endpoint={`/api/internal/${memo.id}`} redirectTo="/internal" />}
    </main>
  );
}
