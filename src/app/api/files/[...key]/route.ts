import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPresignedDownloadUrl } from "@/lib/minio";

// GET /api/files/[...key] — redirect to a short-lived presigned MinIO URL,
// after confirming the object belongs to the caller's office.
export async function GET(req: NextRequest, props: { params: Promise<{ key: string[] }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const key = params.key.join("/");
  if (!key.startsWith(`${session.user.officeId}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getPresignedDownloadUrl(key);
  return NextResponse.redirect(url);
}
