import { Client } from "minio";
import { requireEnv } from "@/lib/env";

// Constructed lazily (not at module load) so importing this file doesn't
// require MINIO_* env vars to be set — they aren't during `next build`,
// only at container runtime.
let client: Client | undefined;

export function getMinioClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: requireEnv("MINIO_ENDPOINT"),
      port: Number(requireEnv("MINIO_PORT")),
      useSSL: false,
      accessKey: requireEnv("MINIO_ROOT_USER"),
      secretKey: requireEnv("MINIO_ROOT_PASSWORD"),
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
    // Office isolation for this bucket is enforced entirely by the app
    // (officeId-prefixed keys, checked in /api/files/[...key]) rather than
    // a MinIO bucket policy — so explicitly deny anonymous/public access
    // rather than relying on "new buckets default to private" behavior.
    await client.setBucketPolicy(SCANS_BUCKET, "").catch(() => {});
  }
}

// Presigned download URLs are handed to the *browser* as a redirect target,
// so they must be signed against an endpoint the browser can actually
// resolve — not MINIO_ENDPOINT, which in the docker-compose deploy is the
// Docker-internal service name "minio". MINIO_PUBLIC_URL should point at
// wherever nginx proxies the bucket path back to MinIO (see nginx.conf);
// it defaults to MINIO_ENDPOINT/MINIO_PORT for local dev, where the app
// talks to MinIO directly with no reverse proxy in front.
let publicClient: Client | undefined;

export function getPresignedDownloadUrl(key: string): Promise<string> {
  if (!publicClient) {
    const publicUrl = new URL(
      process.env.MINIO_PUBLIC_URL || `http://${requireEnv("MINIO_ENDPOINT")}:${requireEnv("MINIO_PORT")}`
    );
    publicClient = new Client({
      endPoint: publicUrl.hostname,
      port: Number(publicUrl.port) || (publicUrl.protocol === "https:" ? 443 : 80),
      useSSL: publicUrl.protocol === "https:",
      accessKey: requireEnv("MINIO_ROOT_USER"),
      secretKey: requireEnv("MINIO_ROOT_PASSWORD"),
      // Without this, the SDK auto-detects the bucket's region by making a
      // real request to `endPoint` on first use — which for this client is
      // a browser-facing address (e.g. nginx), not reachable as MinIO's S3
      // API from inside the app container. Signing needs no live
      // connection at all once region is known, so pin it explicitly.
      region: "us-east-1",
    });
  }
  return publicClient.presignedGetObject(SCANS_BUCKET, key, 60);
}
