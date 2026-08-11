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

  // Carried from whichever ledger the clerk pressed "New" in. This is now the
  // only way source is set — the form has no Source field — and the two ledgers
  // number differently, so the wrong value here files the document in the wrong
  // ledger with a number in the wrong format, not just a mislabelled row.
  //
  // Falls back to External rather than staying blank: every entry point in the
  // nav carries an origin, so a bare /incoming/new is someone typing the URL,
  // and External is both the schema default and the far commoner case. The
  // heading always names the ledger so the choice is never silent.
  const presetOrigin = origin === "INTERNAL" ? "INTERNAL" : "EXTERNAL";

  const { users, agencySuggestions, signatorySuggestions } = await getIncomingFormData(
    session!.user.officeId,
  );

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">
        New {presetOrigin === "INTERNAL" ? "internal" : "external"} incoming document
      </h1>
      <IncomingForm
        mode="create"
        users={users}
        agencySuggestions={agencySuggestions}
        signatorySuggestions={signatorySuggestions}
        currentUserId={session!.user.id}
        canSignOff={canSignOffAsChief(session!.user.role)}
        initialData={{ origin: presetOrigin }}
      />
    </main>
  );
}
