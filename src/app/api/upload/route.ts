import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { getMinioClient, ensureBucket, SCANS_BUCKET } from "@/lib/minio";

// POST /api/upload — upload a scanned copy / supporting file to MinIO.
// Object keys are prefixed with the uploader's officeId so downloads can be
// scoped to that office (see /api/files/[...key]).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  await ensureBucket();

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${session.user.officeId}/${randomUUID()}-${file.name}`;

  await getMinioClient().putObject(SCANS_BUCKET, key, buffer, buffer.length, {
    "Content-Type": file.type || "application/octet-stream",
  });

  return NextResponse.json({ key, filename: file.name });
}
