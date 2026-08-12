import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canSignOffAsChief } from "@/lib/authz";
import { getIncomingFormData } from "@/lib/incomingFormData";
import { IncomingForm } from "../IncomingForm";

export default async function NewIncomingPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { origin } = await searchParams;

  const { users, agencySuggestions, signatorySuggestions, splitIncomingLedgers, registerLayout } =
    await getIncomingFormData(session!.user.officeId);

  // Where the office keeps two registers, source is carried from whichever
  // ledger the clerk pressed "New" in, and the two number differently — so the
  // wrong value here files the document in the wrong ledger with a number in
  // the wrong format, not just a mislabelled row. It falls back to External
  // rather than staying blank: every nav entry point carries an origin, so a
  // bare /incoming/new is someone typing the URL, and External is both the
  // schema default and the far commoner case. The heading names the ledger so
  // the choice is never silent.
  //
  // Where the office files one ledger, there is no ledger to carry anything:
  // the ?origin= parameter is ignored and the form asks for Source directly.
  const presetOrigin = origin === "INTERNAL" ? "INTERNAL" : "EXTERNAL";
  const heading = splitIncomingLedgers
    ? `New ${presetOrigin === "INTERNAL" ? "internal" : "external"} incoming document`
    : "New incoming document";

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">{heading}</h1>
      <IncomingForm
        mode="create"
        users={users}
        agencySuggestions={agencySuggestions}
        signatorySuggestions={signatorySuggestions}
        currentUserId={session!.user.id}
        canSignOff={canSignOffAsChief(session!.user.role)}
        splitIncomingLedgers={splitIncomingLedgers}
        registerLayout={registerLayout}
        initialData={{ origin: presetOrigin }}
      />
    </main>
  );
}
