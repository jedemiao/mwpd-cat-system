"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon } from "@/components/icons";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function AvatarUploadForm({ userName, avatarUrl }: { userName: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [photo, setPhoto] = useState(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAvatarUrl(key: string | null) {
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: key }),
    });
    if (!res.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setPhoto(key);
    router.refresh();
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    e.target.value = "";

    if (!res.ok) {
      setUploading(false);
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Upload failed. Please try again.");
      return;
    }

    const data = await res.json();
    await saveAvatarUrl(data.key);
    setUploading(false);
  }

  return (
    <div className="card max-w-sm space-y-4 p-6">
      <h2 className="card-title">Profile photo</h2>
      <div className="flex items-center gap-4">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-lg font-semibold text-primary-700 dark:bg-primary/20 dark:text-primary-100">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${photo}`} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(userName)
          )}
        </span>
        <div className="space-y-2">
          <label className="btn-secondary inline-flex cursor-pointer items-center gap-2">
            <CameraIcon className="h-4 w-4" />
            {uploading ? "Uploading…" : photo ? "Change photo" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} disabled={uploading} className="hidden" />
          </label>
          {photo && (
            <button
              type="button"
              onClick={() => saveAvatarUrl(null)}
              className="block text-sm text-ink-500 hover:text-danger dark:text-white/40"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger-600">{error}</p>}
    </div>
  );
}
