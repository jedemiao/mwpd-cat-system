import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActivityForm } from "../ActivityForm";

type SearchParams = { date?: string; returnTo?: string };

export default async function NewActivityPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);

  const users = await prisma.user.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : undefined;
  // Only accept an internal path, never an absolute/protocol-relative URL.
  const redirectTo =
    searchParams.returnTo && searchParams.returnTo.startsWith("/") && !searchParams.returnTo.startsWith("//")
      ? searchParams.returnTo
      : undefined;

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New activity</h1>
      <ActivityForm mode="create" users={users} redirectTo={redirectTo} initialData={date ? { date } : undefined} />
    </main>
  );
}
