import { Client } from "minio";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER!,
  secretKey: process.env.MINIO_ROOT_PASSWORD!,
});

// Single bucket for all offices; object keys are prefixed with officeId
// so access can be scoped per office without separate buckets per office.
export const SCANS_BUCKET = "mwpd-scans";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(SCANS_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(SCANS_BUCKET);
  }
}
