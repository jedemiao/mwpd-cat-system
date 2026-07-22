import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { authOptions } from "@/lib/auth";
import { getMinioClient, ensureBucket, SCANS_BUCKET } from "@/lib/minio";

// Scanned copies are photographed/scanned office documents — PDFs and
// common image formats cover every real case from the Excel-era tracker.
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

// The Forms library holds downloadable Word/Excel templates, not scans —
// a distinct allow-list so office-scoped scanned-copy uploads stay untouched.
const ALLOWED_SHARED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// POST /api/upload — upload a scanned copy / supporting file to MinIO.
// Object keys are prefixed with the uploader's officeId so downloads can be
// scoped to that office (see /api/files/[...key]) — unless scope=shared,
// used only by the Forms library, which every office can read.
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

  const shared = formData.get("scope") === "shared";

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 15MB limit" }, { status: 400 });
  }
  if (shared) {
    if (!ALLOWED_SHARED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type. Allowed: PDF, DOCX, XLSX" }, { status: 400 });
    }
  } else if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Allowed: PDF, JPEG, PNG, WEBP" }, { status: 400 });
  }

  await ensureBucket();

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = shared
    ? `shared/forms/${randomUUID()}-${file.name}`
    : `${session.user.officeId}/${randomUUID()}-${file.name}`;

  await getMinioClient().putObject(SCANS_BUCKET, key, buffer, buffer.length, {
    "Content-Type": file.type || "application/octet-stream",
  });

  return NextResponse.json({ key, filename: file.name });
}
