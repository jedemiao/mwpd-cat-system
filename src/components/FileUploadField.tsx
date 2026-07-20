"use client";

import { ChangeEvent, useState } from "react";
import { FileIcon } from "./icons";

type FileUploadFieldProps = {
  label: string;
  value: string; // stored MinIO object key, "" if none
  onChange: (key: string) => void;
};

export function FileUploadField({ label, value, onChange }: FileUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    setUploading(false);
    e.target.value = "";

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Upload failed. Please try again.");
      return;
    }

    const data = await res.json();
    onChange(data.key);
  }

  const filename = value ? value.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") : null;

  return (
    <div>
      <label className="field-label">{label}</label>
      {value && (
        <p className="mb-1.5 flex items-center gap-1.5 text-sm">
          <FileIcon className="h-4 w-4 text-ink-400 dark:text-white/30" />
          <a href={`/api/files/${value}`} target="_blank" rel="noreferrer" className="text-info hover:underline">
            {filename}
          </a>
          <button type="button" onClick={() => onChange("")} className="ml-1 text-ink-400 hover:text-danger dark:text-white/30">
            Remove
          </button>
        </p>
      )}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={uploading}
        className="field-input file:mr-3 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-700 dark:file:bg-ink-700 dark:file:text-white/80"
      />
      {uploading && <p className="mt-1 text-sm text-ink-500 dark:text-white/40">Uploading…</p>}
      {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
    </div>
  );
}
