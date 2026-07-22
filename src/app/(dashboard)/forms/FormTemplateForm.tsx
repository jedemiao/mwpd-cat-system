"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";

type FormTemplateFormProps = {
  mode: "create" | "edit";
  id?: string;
  initialData?: {
    number?: number;
    title?: string;
    fileUrl?: string;
    fileName?: string;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

const TEMPLATE_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function FormTemplateForm({ mode, id, initialData }: FormTemplateFormProps) {
  const router = useRouter();
  const [number, setNumber] = useState(initialData?.number != null ? String(initialData.number) : "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [fileUrl, setFileUrl] = useState(initialData?.fileUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fileUrl) {
      setError("Please upload a template file.");
      return;
    }

    setLoading(true);

    const fileName = fileUrl.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? fileUrl;

    const body = {
      number: parseInt(number, 10),
      title,
      fileUrl,
      fileName,
    };

    const res = await fetch(mode === "create" ? "/api/forms" : `/api/forms/${id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ? JSON.stringify(data.error) : "Something went wrong. Please try again.");
      return;
    }

    router.push("/forms");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-[8rem_1fr] gap-4">
        <div>
          <label className={labelClass} htmlFor="number">
            Number
          </label>
          <input
            id="number"
            type="number"
            required
            min={1}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="title">
            Title / document
          </label>
          <input id="title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>
      </div>

      <FileUploadField label="Template / form" value={fileUrl} onChange={setFileUrl} scope="shared" accept={TEMPLATE_ACCEPT} />

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
