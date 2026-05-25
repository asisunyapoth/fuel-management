"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, MailQuestion } from "lucide-react";

/* ── Shared primitives (same as station onboarding) ─────────── */

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
        <p
          className="text-xs"
          style={{ color: "var(--foreground-neutral-lighter)" }}
        >
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

export default function AuthorityOnboardingPage() {
  const router = useRouter();
  const [provinceCode, setProvinceCode] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/internal/onboarding/link-province", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provinceCode: provinceCode.trim(), otp: otp.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "เกิดข้อผิดพลาด กรุณาลองใหม่"
        );
        return;
      }

      router.push("/pac");
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && provinceCode.length >= 2 && otp.length === 6;

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
              style={{ background: "var(--secondary-95)" }}
            >
              <ShieldCheck
                size={18}
                style={{ color: "var(--secondary-40-main)" }}
              />
            </span>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--foreground-neutral-default)" }}
            >
              เปิดใช้งานบัญชีเจ้าหน้าที่ อบจ.
            </h1>
          </div>
          <p
            className="text-sm ml-12"
            style={{ color: "var(--foreground-neutral-lighter)" }}
          >
            ระบุรหัสจังหวัดและรหัสเปิดใช้งานจากจดหมายนำส่ง ธพ./สถ.
          </p>
        </div>

        {/* ── Form body ── */}
        <div className="px-7 py-6">
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
              id="provinceCode"
              label="รหัสจังหวัด (2 หลัก)"
              hint="เช่น 40 = ขอนแก่น, 10 = กรุงเทพมหานคร, 50 = เชียงใหม่"
            >
              <TextInput
                id="provinceCode"
                value={provinceCode}
                onChange={(v) => setProvinceCode(v.replace(/\D/g, ""))}
                placeholder="40"
                inputMode="numeric"
                maxLength={2}
                required
                className="font-mono text-lg tracking-widest text-center"
              />
            </FormField>

            <FormField id="otp" label="รหัสเปิดใช้งาน (OTP) 6 หลัก">
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
              <p
                className="text-xs"
                style={{ color: "var(--foreground-neutral-lighter)" }}
              >
                รหัส 6 หลัก ระบุในจดหมายนำส่งของ ธพ./สถ.
              </p>
            </FormField>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-opacity"
              style={{
                background: canSubmit
                  ? "var(--button-background-primary-solid)"
                  : "var(--button-background-disabled)",
                color: canSubmit
                  ? "var(--button-foreground-primary-on-solid)"
                  : "var(--button-foreground-disabled)",
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              <KeyRound size={15} />
              {loading ? "กำลังตรวจสอบ…" : "เปิดใช้งาน"}
            </button>
          </form>
        </div>

        {/* ── Card footer ── */}
        <div
          className="px-7 py-4 flex items-start gap-2 rounded-b-2xl"
          style={{
            background: "var(--neutral-98)",
            borderTop: "1px solid var(--stroke-neutral-lighter)",
          }}
        >
          <MailQuestion
            size={14}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--foreground-neutral-lightest)" }}
          />
          <p
            className="text-xs"
            style={{ color: "var(--foreground-neutral-lightest)" }}
          >
            1 บัญชีรองรับได้เพียง 1 จังหวัด — หากต้องการเปลี่ยน ติดต่อผู้ดูแลระบบ ธพ.
          </p>
        </div>
      </div>
    </div>
  );
}
