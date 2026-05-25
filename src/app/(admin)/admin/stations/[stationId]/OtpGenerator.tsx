"use client";

import { useState } from "react";
import { Key, Copy, Check, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  stationId: number;
}

export function OtpGenerator({ stationId }: Props) {
  const router = useRouter();
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("loading");
    setError(null);
    setGeneratedOtp(null);

    try {
      const res = await fetch(`/api/internal/admin/stations/${stationId}/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด");
        setStatus("error");
        return;
      }
      setGeneratedOtp(data.otp);
      setExpiresAt(data.expiresAt);
      setStatus("done");
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setStatus("error");
    }
  }

  async function handleCopy() {
    if (!generatedOtp) return;
    await navigator.clipboard.writeText(generatedOtp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setStatus("idle");
    setGeneratedOtp(null);
    setExpiresAt(null);
    setError(null);
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--neutral-97)", border: "1px solid var(--stroke-neutral-lightest)" }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--foreground-neutral-default)" }}>
        สร้างรหัส OTP ใหม่
      </p>

      {status === "done" && generatedOtp ? (
        /* Result */
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl p-4 text-center"
            style={{ background: "var(--background-positive-light)", border: "1px solid var(--stroke-positive-light)" }}
          >
            <p className="text-xs mb-2" style={{ color: "var(--foreground-positive-default)" }}>
              รหัสนี้แสดงเพียงครั้งเดียว — คัดลอกก่อนปิดหน้านี้
            </p>
            <div className="flex items-center justify-center gap-3">
              <span
                className="text-4xl font-mono font-bold tracking-widest"
                style={{ color: "var(--foreground-positive-default)", letterSpacing: "0.25em" }}
              >
                {generatedOtp}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  background: "var(--foreground-positive-default)",
                  color: "white",
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </div>
            {expiresAt && (
              <p className="text-xs mt-2" style={{ color: "var(--foreground-neutral-lighter)" }}>
                หมดอายุ:{" "}
                {new Date(expiresAt).toLocaleDateString("th-TH", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-2 text-xs py-2 rounded-lg"
            style={{ color: "var(--foreground-neutral-lighter)" }}
          >
            <RefreshCw size={11} />
            สร้างรหัสอื่น
          </button>
        </div>
      ) : (
        /* Form */
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
              หมดอายุใน (วัน)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 90)}
              className="w-24 px-3 py-2 rounded-lg text-sm outline-none tabular-nums"
              style={{
                background: "var(--input-background-default)",
                border: "1px solid var(--input-stroke-default)",
                color: "var(--input-input-default)",
              }}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={status === "loading"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: status === "loading" ? "var(--button-background-disabled)" : "var(--button-background-primary-solid)",
              color: status === "loading" ? "var(--button-foreground-disabled)" : "var(--button-foreground-primary-on-solid)",
              cursor: status === "loading" ? "wait" : "pointer",
            }}
          >
            {status === "loading" ? (
              <><Loader2 size={14} className="animate-spin" /> กำลังสร้าง…</>
            ) : (
              <><Key size={14} /> สร้าง OTP</>
            )}
          </button>

          {error && (
            <p className="text-xs w-full" style={{ color: "var(--foreground-negative-default)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
