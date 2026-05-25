"use client";

import { useState } from "react";
import { Plus, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

const MODE_OPTIONS = [
  { value: "M", label: "รายเดือน (M)" },
  { value: "W", label: "รายสัปดาห์ (W)" },
  { value: "D", label: "รายวัน (D)" },
];

export function CreatePeriodForm() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString().slice(0, 10);
  const defaultDue = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10)
    .toISOString().slice(0, 10);

  const [mode, setMode] = useState("M");
  const [startDate, setStartDate] = useState(today.slice(0, 8) + "01");
  const [endDate, setEndDate] = useState(endOfMonth);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/internal/admin/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, startDate, endDate, dueDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด");
        setStatus("error");
        return;
      }
      setStatus("done");
      setTimeout(() => {
        setStatus("idle");
        router.refresh();
      }, 1500);
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setStatus("error");
    }
  }

  const inputStyle = {
    background: "var(--input-background-default)",
    border: "1px solid var(--input-stroke-default)",
    color: "var(--input-input-default)",
  };

  return (
    <div className="flex flex-wrap gap-4 items-end">
      {/* Mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--input-label-default)" }}>
          ความถี่
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ ...inputStyle, minWidth: "150px" }}
        >
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Start date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--input-label-default)" }}>
          วันเริ่มต้น
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm outline-none"
          style={inputStyle}
        />
      </div>

      {/* End date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--input-label-default)" }}>
          วันสิ้นสุด
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm outline-none"
          style={inputStyle}
        />
      </div>

      {/* Due date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--input-label-default)" }}>
          กำหนดส่ง
        </label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm outline-none"
          style={inputStyle}
        />
      </div>

      {/* Submit */}
      <div className="flex flex-col gap-1.5">
        {error && <p className="text-xs" style={{ color: "var(--foreground-negative-default)" }}>{error}</p>}
        <button
          onClick={handleCreate}
          disabled={status === "loading" || status === "done"}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{
            background: status === "done"
              ? "var(--background-positive-light)"
              : status === "loading"
                ? "var(--button-background-disabled)"
                : "var(--button-background-primary-solid)",
            color: status === "done"
              ? "var(--foreground-positive-default)"
              : status === "loading"
                ? "var(--button-foreground-disabled)"
                : "var(--button-foreground-primary-on-solid)",
            cursor: status === "loading" ? "wait" : "pointer",
          }}
        >
          {status === "loading" ? (
            <><Loader2 size={14} className="animate-spin" /> กำลังสร้าง…</>
          ) : status === "done" ? (
            <><CheckCircle2 size={14} /> สร้างแล้ว</>
          ) : (
            <><Plus size={14} /> สร้างรอบใหม่</>
          )}
        </button>
      </div>
    </div>
  );
}
