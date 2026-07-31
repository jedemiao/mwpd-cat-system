import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canSignOffAsChief } from "@/lib/authz";
import { getIncomingFormData } from "@/lib/incomingFormData";
import { IncomingForm } from "../IncomingForm";

export default async function NewIncomingPage() {
  const session = await getServerSession(authOptions);

  const { users, activities, agencySuggestions, signatorySuggestions } = await getIncomingFormData(
    session!.user.officeId,
  );

  return (
    <main className="p-6 lg:p-8">
      <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white">New incoming document</h1>
      <IncomingForm
        mode="create"
        users={users}
        activities={activities}
        agencySuggestions={agencySuggestions}
        signatorySuggestions={signatorySuggestions}
        currentUserId={session!.user.id}
        canSignOff={canSignOffAsChief(session!.user.role)}
      />
    </main>
  );
}
