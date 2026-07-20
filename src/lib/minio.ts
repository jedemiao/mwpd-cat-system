import { Client } from "minio";

// Constructed lazily (not at module load) so importing this file doesn't
// require MINIO_* env vars to be set — they aren't during `next build`,
// only at container runtime.
let client: Client | undefined;

export function getMinioClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: process.env.MINIO_ENDPOINT!,
      port: Number(process.env.MINIO_PORT),
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER!,
      secretKey: process.env.MINIO_ROOT_PASSWORD!,
    });
  }
  return client;
}

// Single bucket for all offices; object keys are prefixed with officeId
// so access can be scoped per office without separate buckets per office.
export const SCANS_BUCKET = "mwpd-scans";

export async function ensureBucket() {
  const client = getMinioClient();
  const exists = await client.bucketExists(SCANS_BUCKET).catch(() => false);
  if (!exists) {
    await client.makeBucket(SCANS_BUCKET);
  }
}
