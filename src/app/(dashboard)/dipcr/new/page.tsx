import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDipcrFormData } from "@/lib/dipcrFormData";
import { currentSemester, isSemester, officeTracksDipcr, type DipcrSemesterValue } from "@/lib/dipcr";
import { DipcrForm } from "../DipcrForm";

export default async function NewDipcrPage(props: {
  searchParams: Promise<{ year?: string; semester?: string; pap?: string; section?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksDipcr(officeId))) notFound();

  const { users } = await getDipcrFormData(officeId);

  // Carried from whichever semester the page was showing, so adding a row to
  // the matrix does not start by re-picking the period it belongs to.
  const now = currentSemester();
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? parseInt(searchParams.year!, 10) : now.year;
  const semester: DipcrSemesterValue = isSemester(searchParams.semester ?? "")
    ? (searchParams.semester as DipcrSemesterValue)
    : now.semester;

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New success indicator</h1>
      <DipcrForm
        mode="create"
        users={users}
        initialData={{
          year,
          semester,
          section: searchParams.section ?? "CORE FUNCTIONS",
          pap: searchParams.pap ?? "",
        }}
      />
    </main>
  );
}
