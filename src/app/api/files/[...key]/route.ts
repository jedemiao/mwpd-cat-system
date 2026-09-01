import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { getPresignedDownloadUrl } from "@/lib/minio";
import { logAudit, getClientIp } from "@/lib/auditLog";

// GET /api/files/[...key] — redirect to a short-lived presigned MinIO URL,
// after confirming the object belongs to the caller's office.
export async function GET(req: NextRequest, props: { params: Promise<{ key: string[] }> }) {
  const params = await props.params;
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const key = params.key.join("/");
  // "shared/" is the Forms library — readable by any authenticated user,
  // regardless of office, since those templates aren't office-specific.
  if (!key.startsWith("shared/") && !key.startsWith(`${session.user.officeId}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logAudit({
    ipAddress: getClientIp(req),
    officeId: session.user.officeId,
    userId: session.user.id,
    action: "READ",
    entityType: "File",
    entityId: key,
  });

  // Sign against the address the browser actually used — but only when
  // something in front of the app proxies /mwpd-scans/ back to MinIO. That is
  // nginx's job and nginx's alone (see nginx.conf), and X-Forwarded-Proto is
  // what says nginx is there: it sets the header on every location it passes
  // to the app, and the Next dev server sets none.
  //
  // Without that condition `npm run dev` signed URLs for its own origin
  // (http://localhost:3001/mwpd-scans/...), which nothing serves — the dev
  // server has no such route and no MinIO behind it, so every scanned copy
  // 404'd. Falling through instead points the browser straight at MinIO, which
  // is the only address that answers for the bucket when there's no proxy.
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const url = await getPresignedDownloadUrl(
    key,
    forwardedProto && host ? { host, proto: forwardedProto } : undefined,
  );
  return NextResponse.redirect(url);
}
