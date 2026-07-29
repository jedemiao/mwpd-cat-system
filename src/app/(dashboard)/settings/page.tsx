import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canResetStaffPassword } from "@/lib/authz";
import { AvatarUploadForm } from "./AvatarUploadForm";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ResetStaffPasswordForm } from "./ResetStaffPasswordForm";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const canReset = canResetStaffPassword(session!.user.role);

  const [user, staff] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { name: true, avatarUrl: true },
    }),
    // Only the Chief/Admin needs the office roster, and never their own account
    // (they change their own password with the form above).
    canReset
      ? prisma.user.findMany({
          where: { officeId: session!.user.officeId, id: { not: session!.user.id } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Settings</h1>
      <AvatarUploadForm userName={user!.name} avatarUrl={user!.avatarUrl} />
      <ChangePasswordForm />
      {canReset && <ResetStaffPasswordForm staff={staff} />}
    </main>
  );
}
