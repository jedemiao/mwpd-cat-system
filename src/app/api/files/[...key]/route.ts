import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMinioClient, SCANS_BUCKET } from "@/lib/minio";

// GET /api/files/[...key] — redirect to a short-lived presigned MinIO URL,
// after confirming the object belongs to the caller's office.
export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const key = params.key.join("/");
  if (!key.startsWith(`${session.user.officeId}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getMinioClient().presignedGetObject(SCANS_BUCKET, key, 60);
  return NextResponse.redirect(url);
}
