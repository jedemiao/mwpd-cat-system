import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
// The office's active roster, which is all either module needs here — reused
// rather than copied under a second name.
import { getDipcrFormData } from "@/lib/dipcrFormData";
import { currentSemester, isSemester, type DipcrSemesterValue } from "@/lib/dipcr";
import { officeTracksIpcrRatingGuide } from "@/lib/ipcrRatingGuide";
import { IpcrRatingGuideForm } from "../IpcrRatingGuideForm";

export default async function NewIpcrRatingGuidePage(props: {
  searchParams: Promise<{ year?: string; semester?: string; pap?: string; section?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  const officeId = session!.user.officeId;

  if (!(await officeTracksIpcrRatingGuide(officeId))) notFound();

  const { users } = await getDipcrFormData(officeId);

  // Carried from whichever semester the sheet was showing, so adding a row does
  // not start by re-picking the period it belongs to.
  const now = currentSemester();
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? parseInt(searchParams.year!, 10) : now.year;
  const semester: DipcrSemesterValue = isSemester(searchParams.semester ?? "")
    ? (searchParams.semester as DipcrSemesterValue)
    : now.semester;

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        New rated indicator
      </h1>
      <IpcrRatingGuideForm
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
