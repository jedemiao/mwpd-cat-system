import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AvatarUploadForm } from "./AvatarUploadForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true, avatarUrl: true },
  });

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Settings</h1>
      <AvatarUploadForm userName={user!.name} avatarUrl={user!.avatarUrl} />
      <ChangePasswordForm />
    </main>
  );
}
