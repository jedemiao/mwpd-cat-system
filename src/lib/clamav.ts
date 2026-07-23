import { Readable } from "stream";
import NodeClam from "clamscan";
import { requireEnv } from "@/lib/env";

// Constructed lazily for the same reason as the MinIO client (src/lib/minio.ts):
// CLAMAV_* env vars aren't set during `next build`, only at container runtime.
let scannerPromise: Promise<NodeClam> | undefined;

function getScanner(): Promise<NodeClam> {
  if (!scannerPromise) {
    scannerPromise = new NodeClam().init({
      clamdscan: {
        host: requireEnv("CLAMAV_HOST"),
        port: Number(requireEnv("CLAMAV_PORT")),
        bypassTest: true,
        timeout: 60_000,
      },
    });
  }
  return scannerPromise;
}

// Scans a buffer against the clamd sidecar (see docker-compose.yml). Fails
// closed — if clamd can't be reached or errors out, the upload is treated as
// unsafe rather than silently skipping the scan, since this is the last
// checkpoint before an untrusted file reaches storage.
export async function scanBuffer(buffer: Buffer): Promise<{ isInfected: boolean; viruses: string[] }> {
  const scanner = await getScanner();
  const { isInfected, viruses } = await scanner.scanStream(Readable.from(buffer));
  if (isInfected === null) {
    throw new Error("ClamAV scan did not return a result");
  }
  return { isInfected, viruses: viruses ?? [] };
}
