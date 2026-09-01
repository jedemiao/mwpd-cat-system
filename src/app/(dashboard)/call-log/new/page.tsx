import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { officeTracksCallLog } from "@/lib/sena";
import { CallLogForm } from "../CallLogForm";

export default async function NewCallLogPage() {
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksCallLog(officeId))) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">Log a call</h1>
      <CallLogForm mode="create" />
    </main>
  );
}
