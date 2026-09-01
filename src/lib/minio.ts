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
// Docker-internal service name "minio". Since the server can now be reached
// on more than one address (see AUTH_TRUST_HOST in docker-compose.yml), the
// signing target is derived per-request from whatever host/proto the browser
// used.
//
// Callers pass that request context only when a reverse proxy is actually in
// front (see /api/files/[...key]); without one, the browser's own origin
// serves no bucket, so the fallback below is the correct answer rather than a
// degraded one. It is what `npm run dev` uses: MINIO_PUBLIC_URL blank in
// .env.local, so this resolves to MinIO's own host and port.
const publicClients = new Map<string, Client>();

function getPublicClient(publicUrl: URL): Client {
  const cacheKey = publicUrl.origin;
  let existing = publicClients.get(cacheKey);
  if (!existing) {
    existing = new Client({
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
    publicClients.set(cacheKey, existing);
  }
  return existing;
}

export function getPresignedDownloadUrl(key: string, request?: { host: string; proto: string }): Promise<string> {
  const publicUrl = new URL(
    request
      ? `${request.proto}://${request.host}`
      : process.env.MINIO_PUBLIC_URL || `http://${requireEnv("MINIO_ENDPOINT")}:${requireEnv("MINIO_PORT")}`
  );
  return getPublicClient(publicUrl).presignedGetObject(SCANS_BUCKET, key, 60);
}
