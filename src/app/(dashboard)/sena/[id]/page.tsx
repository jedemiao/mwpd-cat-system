import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/formatDateInput";
import { canDelete } from "@/lib/authz";
import { officeTracksSena } from "@/lib/sena";
import { conferenceOrdinal, formatConferenceTime, type SenaStatusValue } from "@/lib/senaSchedule";
import { DeleteButton } from "@/components/DeleteButton";
import { SenaForm } from "../SenaForm";

export default async function EditSenaPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  // Checked as well as the office scoping below. The two catch different things:
  // scoping stops one office opening another's record, this stops an office that
  // runs no conciliation reaching the module at all.
  if (!(await officeTracksSena(officeId))) notFound();

  const [conference, users] = await Promise.all([
    prisma.senaConference.findFirst({ where: { id: params.id, officeId } }),
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!conference) notFound();

  // Everything except this record — a conference must not be offered itself as
  // its own predecessor, which the API refuses anyway.
  const prior = await prisma.senaConference.findMany({
    where: { officeId, id: { not: conference.id } },
    orderBy: { conferenceDate: "desc" },
    take: 100,
    select: {
      id: true,
      complainant: true,
      respondent: true,
      conferenceDate: true,
      conferenceTime: true,
      conferenceNumber: true,
    },
  });

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        Edit conference — {conference.complainant} v. {conference.respondent}
      </h1>
      <SenaForm
        mode="edit"
        id={conference.id}
        users={users}
        priorConferences={prior.map((c) => ({
          id: c.id,
          label: `${c.complainant} v. ${c.respondent} — ${conferenceOrdinal(
            c.conferenceNumber,
          )}, ${c.conferenceDate.toLocaleDateString("en-PH", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })} ${formatConferenceTime(c.conferenceTime)}`,
        }))}
        initialData={{
          conferenceDate: toDateInputValue(conference.conferenceDate),
          conferenceTime: conference.conferenceTime,
          conferenceNumber: conference.conferenceNumber,
          mediatorId: conference.mediatorId,
          complainant: conference.complainant,
          respondent: conference.respondent,
          status: conference.status as SenaStatusValue,
          // Decimal → string so the form's number input gets "16000.00" rather
          // than a Prisma Decimal object.
          amountSettled: conference.amountSettled?.toString() ?? "",
          previousConferenceId: conference.previousConferenceId ?? "",
        }}
      />
      {canDelete(session!.user.role) && (
        <DeleteButton endpoint={`/api/sena/${conference.id}`} redirectTo="/sena" />
      )}
    </main>
  );
}
