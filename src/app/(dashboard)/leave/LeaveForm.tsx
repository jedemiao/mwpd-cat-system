"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUploadField } from "@/components/FileUploadField";

type Option = { id: string; name: string };
type LeaveType = "CTO" | "VACATION" | "SICK" | "EMERGENCY" | "OTHER";

type LeaveFormProps = {
  mode: "create" | "edit";
  id?: string;
  users: Option[];
  initialData?: {
    dateFiled?: string;
    leaveStart?: string;
    leaveEnd?: string;
    type?: LeaveType;
    personnelId?: string;
    scannedCopyUrl?: string;
  };
};

const inputClass = "field-input";
const labelClass = "field-label";

export function LeaveForm({ mode, id, users, initialData }: LeaveFormProps) {
  const router = useRouter();
  const [dateFiled, setDateFiled] = useState(initialData?.dateFiled ?? "");
  const [leaveStart, setLeaveStart] = useState(initialData?.leaveStart ?? "");
  const [leaveEnd, setLeaveEnd] = useState(initialData?.leaveEnd ?? "");
  const [type, setType] = useState<LeaveType>(initialData?.type ?? "OTHER");
  const [personnelId, setPersonnelId] = useState(initialData?.personnelId ?? "");
  const [scannedCopyUrl, setScannedCopyUrl] = useState(initialData?.scannedCopyUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body =
      mode === "create"
        ? {
            dateFiled: dateFiled || undefined,
            leaveStart,
            leaveEnd: leaveEnd || undefined,
            type,
            personnelId,
            scannedCopyUrl: scannedCopyUrl || undefined,
          }
        : {
            dateFiled: dateFiled || null,
            leaveStart,
            leaveEnd: leaveEnd || null,
            type,
            personnelId,
            scannedCopyUrl: scannedCopyUrl || null,
          };

    const res = await fetch(mode === "create" ? "/api/leave" : `/api/leave/${id}`, {
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

    router.push("/leave");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      <div>
        <label className={labelClass} htmlFor="personnelId">
          Personnel
        </label>
        <select
          id="personnelId"
          required
          value={personnelId}
          onChange={(e) => setPersonnelId(e.target.value)}
          className={inputClass}
        >
          <option value="">— Select —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="leaveStart">
            Leave start
          </label>
          <input
            id="leaveStart"
            type="date"
            required
            value={leaveStart}
            onChange={(e) => setLeaveStart(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="leaveEnd">
            Leave end
          </label>
          <input id="leaveEnd" type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="type">
            Type of leave
          </label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as LeaveType)} className={inputClass}>
            <option value="CTO">CTO</option>
            <option value="VACATION">Vacation</option>
            <option value="SICK">Sick</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="dateFiled">
            Date filed
          </label>
          <input id="dateFiled" type="date" value={dateFiled} onChange={(e) => setDateFiled(e.target.value)} className={inputClass} />
        </div>
      </div>

      <FileUploadField label="Scanned copy" value={scannedCopyUrl} onChange={setScannedCopyUrl} />

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
      </button>
    </form>
  );
}
