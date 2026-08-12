import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defaultPeriodMonth, formatMonthParam, officeTracksDtr, parseMonthParam } from "@/lib/dtr";
import { DtrForm } from "../DtrForm";

export default async function NewDtrPage(props: {
  searchParams: Promise<{ month?: string; personnelId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksDtr(officeId))) notFound();

  const users = await prisma.user.findMany({
    where: { officeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Both carried from the roster row the clerk pressed "Record" on, so the
  // common path — working down a month's outstanding names — needs no retyping.
  // A personnelId that is not on this office's roster is dropped rather than
  // trusted; the select would not offer it and the API would refuse it anyway.
  const period = parseMonthParam(searchParams.month) ?? defaultPeriodMonth();
  const presetPersonnel = users.some((u) => u.id === searchParams.personnelId)
    ? searchParams.personnelId
    : undefined;

  // The batch's received date is the same for everyone in a month, so it is
  // carried over from whatever was already recorded rather than retyped.
  const existing = await prisma.dtrRecord.findFirst({
    where: { officeId, periodMonth: period, dateReceived: { not: null } },
    select: { dateReceived: true },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Record DTR filing</h1>
      <DtrForm
        mode="create"
        users={users}
        initialData={{
          periodMonth: formatMonthParam(period),
          dateReceived: existing?.dateReceived?.toISOString().slice(0, 10) ?? "",
          personnelId: presetPersonnel,
        }}
      />
    </main>
  );
}
