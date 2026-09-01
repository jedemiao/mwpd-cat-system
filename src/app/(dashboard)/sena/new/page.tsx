import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeTracksSena } from "@/lib/sena";
import { conferenceOrdinal, formatConferenceTime } from "@/lib/senaSchedule";
import { SenaForm } from "../SenaForm";

export default async function NewSenaPage() {
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksSena(officeId))) notFound();

  const [users, prior] = await Promise.all([
    prisma.user.findMany({
      where: { officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Candidates for the follow-up link. Only conferences that are actually
    // waiting on another sitting are offered — a settled or withdrawn case has
    // nothing to follow — which keeps the list short enough to pick from.
    prisma.senaConference.findMany({
      where: { officeId, status: { in: ["FOR_SECOND_CONFERENCE", "SCHEDULED"] } },
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
    }),
  ]);

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Record conference</h1>
      <SenaForm
        mode="create"
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
      />
    </main>
  );
}
