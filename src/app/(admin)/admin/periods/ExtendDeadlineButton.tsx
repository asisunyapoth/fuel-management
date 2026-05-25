"use client";

import { useState } from "react";
import { CalendarPlus, Loader2, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  periodId: number;
  currentDueDate: string;
}

export function ExtendDeadlineButton({ periodId, currentDueDate }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "editing" | "loading" | "done">("idle");
  const [newDueDate, setNewDueDate] = useState(currentDueDate);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (newDueDate === currentDueDate) { setMode("idle"); return; }
    setMode("loading");
    setError(null);
    try {
      const res = await fetch(`/api/internal/admin/periods/${periodId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: newDueDate }),
      });
      if (res.ok) {
        setMode("done");
        setTimeout(() => { setMode("idle"); router.refresh(); }, 1200);
      } else {
        const data = await res.json();
        setError(data.error ?? "เกิดข้อผิดพลาด");
        setMode("editing");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setMode("editing");
    }
  }

  if (mode === "idle" || mode === "done") {
    return (
      <button
        onClick={() => setMode("editing")}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium shrink-0"
        style={{
          background: mode === "done" ? "var(--background-positive-light)" : "var(--primary-95)",
          color: mode === "done" ? "var(--foreground-positive-default)" : "var(--primary-30-base)",
        }}
      >
        {mode === "done" ? <Check size={12} /> : <CalendarPlus size={12} />}
        {mode === "done" ? "บันทึกแล้ว" : "ขยายกำหนด"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        type="date"
        value={newDueDate}
        onChange={(e) => setNewDueDate(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
        style={{
          background: "var(--input-background-default)",
          border: "1px solid var(--input-stroke-focused)",
          color: "var(--input-input-default)",
        }}
        autoFocus
      />
      <button
        onClick={handleSave}
        disabled={mode === "loading"}
        className="flex items-center justify-center w-7 h-7 rounded-lg"
        style={{ background: "var(--button-background-primary-solid)" }}
      >
        {mode === "loading" ? (
          <Loader2 size={13} className="animate-spin" style={{ color: "white" }} />
        ) : (
          <Check size={13} style={{ color: "white" }} />
        )}
      </button>
      <button
        onClick={() => { setMode("idle"); setNewDueDate(currentDueDate); setError(null); }}
        className="flex items-center justify-center w-7 h-7 rounded-lg"
        style={{ background: "var(--neutral-95)" }}
      >
        <X size={13} style={{ color: "var(--foreground-neutral-lighter)" }} />
      </button>
      {error && (
        <p className="text-xs" style={{ color: "var(--foreground-negative-default)" }}>{error}</p>
      )}
    </div>
  );
}
