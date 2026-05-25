"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Fuel, ArrowRight, Plus, MailQuestion } from "lucide-react";

/* ── Reusable primitives ──────────────────────────────────────── */

function FormField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ color: "var(--input-label-default)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
  required,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  required?: boolean;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      required={required}
      className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all ${className}`}
      style={{
        background: "var(--input-background-default)",
        border: "1px solid var(--input-stroke-default)",
        color: "var(--input-input-default)",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--input-stroke-focused)";
        e.currentTarget.style.boxShadow = "0 0 0 3px var(--a-primary-a10)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--input-stroke-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

export default function StationOnboardingPage() {
  const router = useRouter();
  const [stationId, setStationId] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const isValid = stationId.replace(/\D/g, "").length > 0 && otp.length === 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/internal/onboarding/link-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: parseInt(stationId.trim()),
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "เกิดข้อผิดพลาด กรุณาลองใหม่"
        );
        return;
      }

      setSuccess(`เชื่อมโยงสถานีบริการ ${data.stationName ?? `#${stationId}`} สำเร็จแล้ว`);
      setStationId("");
      setOtp("");
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-start justify-center px-4 pt-16 pb-24">
      <div
        className="w-full max-w-md rounded-2xl shadow-custom-lg"
        style={{
          background: "var(--canvas-white)",
          border: "1px solid var(--stroke-neutral-lighter)",
        }}
      >
        {/* ── Card header ── */}
        <div
          className="px-7 pt-7 pb-5"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lighter)" }}
        >
          <div className="flex items-center gap-3 mb-1">
            <span
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: "var(--primary-95)" }}
            >
              <Fuel size={18} style={{ color: "var(--primary-30-base)" }} />
            </span>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--foreground-neutral-default)" }}
            >
              เพิ่มสถานีบริการ
            </h1>
          </div>
          <p
            className="text-sm ml-12"
            style={{ color: "var(--foreground-neutral-lighter)" }}
          >
            ระบุรหัสสถานีและรหัสเปิดใช้งานจากจดหมายนำส่ง ธพ.
          </p>
        </div>

        {/* ── Form body ── */}
        <div className="px-7 py-6">
          {/* Success banner */}
          {success && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl mb-5 text-sm"
              style={{
                background: "var(--background-positive-light)",
                border: "1px solid var(--positive-80)",
                color: "var(--foreground-positive-default)",
              }}
            >
              <span className="mt-0.5 shrink-0">✓</span>
              <div className="flex-1">
                <p className="font-medium">{success}</p>
                <div className="flex gap-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setSuccess(null)}
                    className="flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                    style={{ color: "var(--foreground-positive-default)" }}
                  >
                    <Plus size={12} />
                    เพิ่มสถานีอีก
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                    style={{ color: "var(--foreground-positive-default)" }}
                  >
                    ไปหน้าหลัก
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div
              className="p-4 rounded-xl mb-5 text-sm"
              style={{
                background: "var(--background-negative-light)",
                border: "1px solid var(--danger-80)",
                color: "var(--foreground-negative-default)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <FormField
              id="stationId"
              label="รหัสสถานีบริการ"
              hint="ตัวเลขรหัสสถานี ระบุในจดหมายนำส่งของ ธพ."
            >
              <TextInput
                id="stationId"
                value={stationId}
                onChange={(v) => setStationId(v.replace(/\D/g, ""))}
                placeholder="เช่น 6"
                inputMode="numeric"
                required
              />
            </FormField>

            <FormField
              id="otp"
              label="รหัสเปิดใช้งาน (OTP) 6 หลัก"
              hint="รหัส 6 หลัก ระบุในจดหมายนำส่งของ ธพ."
            >
              <TextInput
                id="otp"
                value={otp}
                onChange={(v) => setOtp(v.replace(/\D/g, ""))}
                placeholder="• • • • • •"
                inputMode="numeric"
                maxLength={6}
                required
                className="tracking-[0.4em] font-mono text-center text-base"
              />
            </FormField>

            <button
              type="submit"
              disabled={loading || !isValid}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-opacity"
              style={{
                background:
                  loading || !isValid
                    ? "var(--button-background-disabled)"
                    : "var(--button-background-primary-solid)",
                color:
                  loading || !isValid
                    ? "var(--button-foreground-disabled)"
                    : "var(--button-foreground-primary-on-solid)",
                cursor: loading || !isValid ? "not-allowed" : "pointer",
              }}
            >
              <KeyRound size={15} />
              {loading ? "กำลังตรวจสอบ…" : "เชื่อมโยงสถานี"}
            </button>
          </form>
        </div>

        {/* ── Card footer ── */}
        <div
          className="px-7 py-4 flex items-center gap-2 rounded-b-2xl"
          style={{
            background: "var(--neutral-98)",
            borderTop: "1px solid var(--stroke-neutral-lighter)",
          }}
        >
          <MailQuestion
            size={14}
            style={{ color: "var(--foreground-neutral-lightest)" }}
          />
          <p
            className="text-xs"
            style={{ color: "var(--foreground-neutral-lightest)" }}
          >
            ยังไม่ได้รับจดหมาย? ติดต่อ ธพ. หรือ Helpdesk
          </p>
        </div>
      </div>
    </div>
  );
}
