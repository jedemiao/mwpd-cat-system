// Call from inside a function body, never at module top level — required
// vars (MINIO_*, etc.) aren't set during `next build`, only at container
// runtime, and a top-level call here would reintroduce the build-time
// crash fixed in a previous commit.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
