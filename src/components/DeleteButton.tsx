"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeleteButtonProps = {
  endpoint: string;
  redirectTo: string;
};

export function DeleteButton({ endpoint, redirectTo }: DeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;

    setLoading(true);
    setError(null);

    const res = await fetch(endpoint, { method: "DELETE" });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Delete failed.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={handleDelete} disabled={loading} className="btn-danger-outline">
        {loading ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
    </div>
  );
}
