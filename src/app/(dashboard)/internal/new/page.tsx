import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { officeTracksInternalMemos } from "@/lib/internalMemos";
import { InternalForm } from "../InternalForm";

export default async function NewInternalPage() {
  const session = await getServerSession(authOptions);

  // 404 rather than a redirect: for an office that keeps no internal register
  // this route does not exist, and saying so is more honest than bouncing
  // someone to a dashboard as though they had mistyped a path they were owed.
  if (!(await officeTracksInternalMemos(session!.user.officeId))) notFound();

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New internal memorandum</h1>
      <InternalForm mode="create" />
    </main>
  );
}
