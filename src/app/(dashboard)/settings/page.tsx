import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/authz";
import { AvatarUploadForm } from "./AvatarUploadForm";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { CreateAccountForm } from "./CreateAccountForm";
import { ManageAccountsTable } from "./ManageAccountsTable";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  // Role comes from the database, not the JWT. This page decides whether to
  // render the account-management tools, and a token issued before someone was
  // demoted still claims their old role — which would show a former Chief a
  // management UI where every action then 403s. (The API enforces the same
  // check against the database via getActiveSession; this just keeps the screen
  // honest.) The dashboard layout has already guaranteed a session exists.
  const me = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true, avatarUrl: true, role: true },
  });
  const role = me!.role;
  const canManage = canManageUsers(role);

  // Everyone in the office, including the viewer and the deactivated:
  // reactivating someone requires seeing them first.
  const roster = canManage
    ? await prisma.user.findMany({
        where: { officeId: session!.user.officeId },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: { id: true, name: true, username: true, email: true, role: true, isActive: true },
      })
    : [];

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Settings</h1>
      <AvatarUploadForm userName={me!.name} avatarUrl={me!.avatarUrl} />
      <ChangePasswordForm />
      {canManage && <CreateAccountForm currentUserRole={role} />}
      {canManage && <ManageAccountsTable users={roster} currentUserId={session!.user.id} currentUserRole={role} />}
    </main>
  );
}
