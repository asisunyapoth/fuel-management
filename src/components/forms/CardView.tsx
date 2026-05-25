"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FuelTypeInfo, FuelLineState, ReportFormState, computedFields, fmt } from "./types";

interface CardViewProps {
  fuelTypes: FuelTypeInfo[];
  formState: ReportFormState;
  onChange: (fuelTypeId: string, field: keyof FuelLineState, value: string) => void;
  readOnly?: boolean;
  requiredFields?: string[] | null;
}

/* ── Field hint text ─────────────────────────────────────────── */
const FIELD_HINTS: Record<string, string> = {
  openingBalanceLiters:       "น้ำมันคงเหลือจากงวดที่แล้ว",
  receiptInLiters:            "น้ำมันที่รับเข้ามาในงวดนี้",
  salesInProvinceLiters:      "ยอดขายในจังหวัดเดียวกัน",
  salesOutOfProvinceLiters:   "ยอดขายต่างจังหวัด (ถ้ามี)",
};

/* ── Input ───────────────────────────────────────────────────── */
function NumInput({
  id, value, onChange, readOnly, hint,
}: {
  id: string; value: string; onChange?: (v: string) => void;
  readOnly?: boolean; hint?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="0.00"
        readOnly={readOnly}
        className="w-full rounded-xl px-4 py-3 text-base text-right outline-none transition-all tabular-nums"
        style={{
          background: readOnly ? "var(--neutral-96)" : "var(--input-background-default)",
          border: `1.5px solid ${readOnly ? "var(--stroke-neutral-lighter)" : "var(--input-stroke-default)"}`,
          color: readOnly ? "var(--foreground-neutral-lighter)" : "var(--input-input-default)",
          cursor: readOnly ? "default" : "text",
          fontSize: "16px", // prevents iOS zoom on focus
        }}
        onFocus={(e) => {
          if (!readOnly) {
            e.currentTarget.style.borderColor = "var(--input-stroke-focused)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--a-primary-a10)";
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = readOnly
            ? "var(--stroke-neutral-lighter)"
            : "var(--input-stroke-default)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      <span
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
        style={{ color: "var(--foreground-neutral-lightest)" }}
      >
        ลิตร
      </span>
    </div>
  );
}

/* ── Derived result row ──────────────────────────────────────── */
function ResultRow({ label, value, suffix, highlight, negative, large }: {
  label: string; value: number; suffix: string;
  highlight?: boolean; negative?: boolean; large?: boolean;
}) {
  const isNeg = negative && value < 0;
  return (
    <div
      className={`flex items-center justify-between rounded-xl ${large ? "px-4 py-3" : "px-3 py-2"}`}
      style={{ background: highlight ? "var(--primary-95)" : "var(--neutral-96)" }}
    >
      <span className={large ? "text-sm font-medium" : "text-xs"} style={{ color: "var(--foreground-neutral-lighter)" }}>
        {label}
      </span>
      <span
        className={`font-bold tabular-nums ${large ? "text-lg" : "text-sm"}`}
        style={{ color: isNeg ? "var(--danger-40)" : highlight ? "var(--primary-30-base)" : "var(--foreground-neutral-default)" }}
      >
        {fmt(value)} <span className={large ? "text-sm font-normal" : "text-xs font-normal"}>{suffix}</span>
      </span>
    </div>
  );
}

/* ── Check whether a line has any data entered ───────────────── */
function hasData(line: FuelLineState): boolean {
  return !!(
    parseFloat(line.openingBalanceLiters) ||
    parseFloat(line.receiptInLiters) ||
    parseFloat(line.salesInProvinceLiters) ||
    parseFloat(line.salesOutOfProvinceLiters)
  );
}

/* ── Single fuel card ────────────────────────────────────────── */
function FuelCard({
  ft, line, onChange, readOnly, isRequired, defaultOpen,
}: {
  ft: FuelTypeInfo;
  line: FuelLineState;
  onChange: (field: keyof FuelLineState, v: string) => void;
  readOnly?: boolean;
  isRequired: (field: string) => boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { volumeSold, taxAmount, closingBalance } = computedFields(line);
  const filled = hasData(line);
  const isNegative = closingBalance < 0;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--canvas-white)",
        border: `1.5px solid ${isNegative && filled ? "var(--danger-80)" : filled ? "var(--primary-90)" : "var(--stroke-neutral-lighter)"}`,
      }}
    >
      {/* ── Card header / toggle ── */}
      <button
        type="button"
        onClick={() => !readOnly && setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
        style={{
          background: filled ? "var(--primary-95)" : "var(--canvas-white)",
          cursor: readOnly ? "default" : "pointer",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Status dot */}
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: isNegative
                ? "var(--danger-40)"
                : filled
                ? "var(--foreground-positive-default)"
                : "var(--neutral-80)",
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground-neutral-default)" }}>
              {ft.nameTh}
            </p>
            {filled && !open && (
              <p className="text-xs tabular-nums" style={{ color: isNegative ? "var(--danger-40)" : "var(--primary-30-base)" }}>
                {isNegative ? `⚠ คงเหลือติดลบ ${fmt(closingBalance)} ล.` : `คงเหลือ ${fmt(closingBalance)} ล. · ภาษี ${fmt(taxAmount)} บ.`}
              </p>
            )}
            {!filled && !readOnly && (
              <p className="text-xs" style={{ color: "var(--foreground-neutral-lightest)" }}>
                แตะเพื่อกรอกข้อมูล
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {ft.taxRatePerLiter && parseFloat(ft.taxRatePerLiter) > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline"
              style={{ background: "var(--neutral-92)", color: "var(--foreground-neutral-lighter)" }}>
              {fmt(parseFloat(ft.taxRatePerLiter), 4)} บ./ล.
            </span>
          )}
          {!readOnly && (
            open
              ? <ChevronUp size={16} style={{ color: "var(--foreground-neutral-lighter)" }} />
              : <ChevronDown size={16} style={{ color: "var(--foreground-neutral-lighter)" }} />
          )}
        </div>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="px-5 pb-5 pt-1 flex flex-col gap-5">

          {/* 01-6 inputs */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold" style={{ color: "var(--foreground-neutral-lightest)", letterSpacing: "0.05em" }}>
              สต็อกและการจำหน่าย <span className="font-normal opacity-60">(อบจ. 01-6)</span>
            </p>

            {([
              ["openingBalanceLiters",     "ยอดยกมา (ต้นงวด)"],
              ["receiptInLiters",          "รับเข้า (งวดนี้)"],
              ["salesInProvinceLiters",    "จำหน่ายในจังหวัด"],
              ["salesOutOfProvinceLiters", "จำหน่ายนอกจังหวัด"],
            ] as const).map(([field, label]) => (
              <div key={field} className="flex flex-col gap-1">
                <label
                  htmlFor={`${field}-${ft.fuelTypeId}`}
                  className="text-sm font-medium flex items-center gap-1.5"
                  style={{ color: "var(--input-label-default)" }}
                >
                  {label}
                  {!isRequired(field) && (
                    <span className="text-xs font-normal" style={{ color: "var(--foreground-neutral-lightest)" }}>
                      (ไม่บังคับ)
                    </span>
                  )}
                </label>
                {FIELD_HINTS[field] && (
                  <p className="text-xs -mt-0.5" style={{ color: "var(--foreground-neutral-lightest)" }}>
                    {FIELD_HINTS[field]}
                  </p>
                )}
                <NumInput
                  id={`${field}-${ft.fuelTypeId}`}
                  value={line[field]}
                  onChange={(v) => onChange(field, v)}
                  readOnly={readOnly}
                />
              </div>
            ))}

            <ResultRow
              label="คงเหลือ (ปลายงวด)"
              value={closingBalance}
              suffix="ลิตร"
              highlight
              negative
              large
            />
          </div>

          {/* 01-4 derived */}
          <div
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "var(--neutral-98)", border: "1px solid var(--stroke-neutral-lightest)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--foreground-neutral-lightest)", letterSpacing: "0.05em" }}>
              ภาษีที่คำนวณได้ <span className="font-normal opacity-60">(อบจ. 01-4 — อัตโนมัติ)</span>
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>ปริมาณจำหน่ายรวม</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--foreground-neutral-default)" }}>
                {fmt(volumeSold)} ลิตร
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>ภาษีที่ต้องชำระ</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: "var(--primary-30-base)" }}>
                {fmt(taxAmount)} บาท
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────── */
export function CardView({ fuelTypes, formState, onChange, readOnly, requiredFields }: CardViewProps) {
  const isRequired = (field: string) => !requiredFields || requiredFields.includes(field);

  return (
    <div className="flex flex-col gap-3">
      {fuelTypes.map((ft) => {
        const line = formState[ft.fuelTypeId];
        if (!line) return null;
        return (
          <FuelCard
            key={ft.fuelTypeId}
            ft={ft}
            line={line}
            onChange={(field, v) => onChange(ft.fuelTypeId, field, v)}
            readOnly={readOnly}
            isRequired={isRequired}
            defaultOpen={hasData(line)}   // auto-open cards that already have data
          />
        );
      })}
    </div>
  );
}
