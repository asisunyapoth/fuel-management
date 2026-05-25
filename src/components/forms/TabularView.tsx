"use client";

import { FuelTypeInfo, FuelLineState, ReportFormState, computedFields, fmt } from "./types";

interface TabularViewProps {
  fuelTypes: FuelTypeInfo[];
  formState: ReportFormState;
  onChange: (fuelTypeId: string, field: keyof FuelLineState, value: string) => void;
  readOnly?: boolean;
  /** null / undefined = all fields required; string[] = only listed keys are required */
  requiredFields?: string[] | null;
}

function TInput({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder="0.00"
      readOnly={readOnly}
      className="w-full min-w-[90px] rounded-lg px-2 py-1.5 text-sm text-right outline-none transition-all tabular-nums"
      style={{
        background: readOnly ? "var(--neutral-96)" : "var(--input-background-default)",
        border: `1px solid ${readOnly ? "var(--stroke-neutral-lighter)" : "var(--input-stroke-default)"}`,
        color: readOnly ? "var(--foreground-neutral-lighter)" : "var(--input-input-default)",
        cursor: readOnly ? "default" : "text",
      }}
      onFocus={(e) => {
        if (!readOnly) {
          e.currentTarget.style.borderColor = "var(--input-stroke-focused)";
          e.currentTarget.style.boxShadow = "0 0 0 2px var(--a-primary-a10)";
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = readOnly
          ? "var(--stroke-neutral-lighter)"
          : "var(--input-stroke-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}
      style={{
        color: "var(--foreground-neutral-lighter)",
        borderBottom: "1px solid var(--stroke-neutral-default)",
        background: "var(--neutral-98)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td
      className={`px-3 py-2 ${right ? "text-right" : "text-left"}`}
      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
    >
      {children}
    </td>
  );
}

function FuelNameCell({ ft }: { ft: FuelTypeInfo }) {
  return (
    <div>
      <p
        className="text-sm font-medium whitespace-nowrap"
        style={{ color: "var(--foreground-neutral-default)" }}
      >
        {ft.nameTh}
      </p>
      <p
        className="text-xs"
        style={{ color: "var(--foreground-neutral-lighter)" }}
      >
        {ft.fuelTypeId}
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div>
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--foreground-neutral-default)" }}
        >
          {title}
        </h3>
        <p
          className="text-xs"
          style={{ color: "var(--foreground-neutral-lighter)" }}
        >
          {subtitle}
        </p>
      </div>
      {badge && (
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium shrink-0"
          style={{ background: "var(--neutral-96)", color: "var(--foreground-neutral-lighter)" }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

export function TabularView({ fuelTypes, formState, onChange, readOnly, requiredFields }: TabularViewProps) {
  const isRequired = (field: string) => !requiredFields || requiredFields.includes(field);
  const optionalSuffix = " (ไม่บังคับ)";
  return (
    <div className="flex flex-col gap-8">
      {/* ── Form 01-6 (primary inputs) ── */}
      <div>
        <SectionHeader
          title="อบจ. 01-6 · สต็อกน้ำมันเชื้อเพลิงคงเหลือ"
          subtitle="กรอกยอดยกมา รับเข้า และยอดจำหน่ายแยกตามพื้นที่"
        />
        <div
          className="rounded-xl overflow-hidden overflow-x-auto"
          style={{ border: "1px solid var(--stroke-neutral-lighter)" }}
        >
          <table className="w-full border-collapse text-sm min-w-[760px]">
            <thead>
              <tr>
                <Th>ประเภทน้ำมัน</Th>
                <Th right>{`ยอดยกมา (ลิตร)${isRequired("openingBalanceLiters") ? "" : optionalSuffix}`}</Th>
                <Th right>{`รับเข้า (ลิตร)${isRequired("receiptInLiters") ? "" : optionalSuffix}`}</Th>
                <Th right>{`จำหน่ายในจังหวัด (ลิตร)${isRequired("salesInProvinceLiters") ? "" : optionalSuffix}`}</Th>
                <Th right>{`จำหน่ายนอกจังหวัด (ลิตร)${isRequired("salesOutOfProvinceLiters") ? "" : optionalSuffix}`}</Th>
                <Th right>คงเหลือ (ลิตร)</Th>
              </tr>
            </thead>
            <tbody>
              {fuelTypes.map((ft) => {
                const line = formState[ft.fuelTypeId];
                if (!line) return null;
                const { closingBalance } = computedFields(line);
                const isNegative = closingBalance < 0;
                return (
                  <tr key={ft.fuelTypeId}>
                    <Td>
                      <FuelNameCell ft={ft} />
                    </Td>
                    <Td right>
                      <TInput
                        value={line.openingBalanceLiters}
                        onChange={(v) => onChange(ft.fuelTypeId, "openingBalanceLiters", v)}
                        readOnly={readOnly}
                      />
                    </Td>
                    <Td right>
                      <TInput
                        value={line.receiptInLiters}
                        onChange={(v) => onChange(ft.fuelTypeId, "receiptInLiters", v)}
                        readOnly={readOnly}
                      />
                    </Td>
                    <Td right>
                      <TInput
                        value={line.salesInProvinceLiters}
                        onChange={(v) => onChange(ft.fuelTypeId, "salesInProvinceLiters", v)}
                        readOnly={readOnly}
                      />
                    </Td>
                    <Td right>
                      <TInput
                        value={line.salesOutOfProvinceLiters}
                        onChange={(v) => onChange(ft.fuelTypeId, "salesOutOfProvinceLiters", v)}
                        readOnly={readOnly}
                      />
                    </Td>
                    <Td right>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{
                          color: isNegative ? "var(--danger-40)" : "var(--primary-30-base)",
                        }}
                      >
                        {fmt(closingBalance)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Form 01-4 (derived summary — read-only) ── */}
      <div>
        <SectionHeader
          title="อบจ. 01-4 · ภาษีน้ำมันเชื้อเพลิง"
          subtitle="คำนวณอัตโนมัติจากข้อมูล 01-6 ด้านบน"
          badge="คำนวณอัตโนมัติ"
        />
        <div
          className="rounded-xl overflow-hidden overflow-x-auto"
          style={{ border: "1px solid var(--stroke-neutral-lighter)" }}
        >
          <table className="w-full border-collapse text-sm min-w-[560px]">
            <thead>
              <tr>
                <Th>ประเภทน้ำมัน</Th>
                <Th right>ปริมาณจำหน่าย (ลิตร)</Th>
                <Th right>อัตราภาษี (บาท/ลิตร)</Th>
                <Th right>ภาษีที่ต้องชำระ (บาท)</Th>
              </tr>
            </thead>
            <tbody>
              {fuelTypes.map((ft) => {
                const line = formState[ft.fuelTypeId];
                if (!line) return null;
                const { volumeSold, taxAmount } = computedFields(line);
                return (
                  <tr key={ft.fuelTypeId}>
                    <Td>
                      <FuelNameCell ft={ft} />
                    </Td>
                    <Td right>
                      <span
                        className="text-sm tabular-nums"
                        style={{ color: "var(--foreground-neutral-default)" }}
                      >
                        {fmt(volumeSold)}
                      </span>
                    </Td>
                    <Td right>
                      <span
                        className="text-sm tabular-nums"
                        style={{ color: "var(--foreground-neutral-lighter)" }}
                      >
                        {fmt(parseFloat(line.taxRatePerLiter) || 0, 4)}
                      </span>
                    </Td>
                    <Td right>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--primary-30-base)" }}
                      >
                        {fmt(taxAmount)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
