import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { getActiveSession } from "@/lib/session";
import { getMinioClient, ensureBucket, SCANS_BUCKET } from "@/lib/minio";
import { scanBuffer } from "@/lib/clamav";

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
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const shared = formData.get("scope") === "shared";
  const allowedTypes = shared ? ALLOWED_SHARED_TYPES : ALLOWED_TYPES;
  const typeErrorMessage = shared
    ? "Unsupported file type. Allowed: PDF, DOCX, XLSX"
    : "Unsupported file type. Allowed: PDF, JPEG, PNG, WEBP";

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 15MB limit" }, { status: 400 });
  }
  if (!allowedTypes.has(file.type)) {
    return NextResponse.json({ error: typeErrorMessage }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The browser-supplied MIME type above is attacker-controlled (just a form
  // field), so it only screens obviously-wrong uploads early. The binding
  // check is against the file's actual magic bytes — a renamed/relabeled
  // file that doesn't match its declared type is rejected here.
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !allowedTypes.has(detected.mime)) {
    return NextResponse.json({ error: typeErrorMessage }, { status: 400 });
  }

  // Last checkpoint before the file reaches storage — scans the actual
  // bytes via the clamd sidecar (see docker-compose.yml). Fails closed: if
  // the scan can't complete (clamd unreachable, still loading its virus DB
  // on first boot, etc.) the upload is rejected rather than silently stored
  // unscanned.
  try {
    const { isInfected, viruses } = await scanBuffer(buffer);
    if (isInfected) {
      return NextResponse.json({ error: `File failed a malware scan (${viruses.join(", ") || "unknown"})` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Malware scan unavailable — try again shortly" }, { status: 503 });
  }

  await ensureBucket();

  // Strip path separators from the original filename so it can't inject
  // extra "/" segments into the object key (path traversal / office-prefix
  // confusion in the storage backend) — the uuid- prefix alone doesn't
  // prevent that, since MinIO treats "/" as real key hierarchy.
  const safeName = file.name.replace(/[/\\]/g, "_");
  const key = shared
    ? `shared/forms/${randomUUID()}-${safeName}`
    : `${session.user.officeId}/${randomUUID()}-${safeName}`;

  await getMinioClient().putObject(SCANS_BUCKET, key, buffer, buffer.length, {
    "Content-Type": detected.mime,
  });

  return NextResponse.json({ key, filename: file.name });
}
