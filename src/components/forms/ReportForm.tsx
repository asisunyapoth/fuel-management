"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  TableProperties,
  Save,
  SendHorizonal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarDays,
  MapPin,
  FlaskConical,
} from "lucide-react";
import { CardView } from "./CardView";
import { TabularView } from "./TabularView";
import {
  FuelTypeInfo,
  FuelLineState,
  ReportFormState,
  CampaignInfo,
  emptyLine,
} from "./types";

/* ── Types passed in from the server page ────────────────────── */

interface ReportInfo {
  reportId: number;
  status: string;
  stationId: number;
}
interface StationInfo {
  name: string;
  address: string | null;
  provinceCode: string;
}
interface PeriodInfo {
  periodId: number;
  mode: string;
  startDate: string;
  endDate: string;
  dueDate: string;
}

interface ReportFormProps {
  reportId: number;
  report: ReportInfo;
  station: StationInfo;
  period?: PeriodInfo;
  campaign?: CampaignInfo;
  fuelTypes: FuelTypeInfo[];
  initialFormState: ReportFormState;
}

/* ── Helpers ─────────────────────────────────────────────────── */

const LS_KEY = (id: number) => `rfdrs-draft-${id}`;

function buildInitialState(
  fuelTypes: FuelTypeInfo[],
  fromServer: ReportFormState
): ReportFormState {
  const state: ReportFormState = {};
  for (const ft of fuelTypes) {
    state[ft.fuelTypeId] =
      fromServer[ft.fuelTypeId] ?? emptyLine(ft.taxRatePerLiter);
  }
  return state;
}

function countFilled(fuelTypes: FuelTypeInfo[], formState: ReportFormState): number {
  return fuelTypes.filter((ft) => {
    const l = formState[ft.fuelTypeId];
    return l && (
      parseFloat(l.openingBalanceLiters) ||
      parseFloat(l.receiptInLiters) ||
      parseFloat(l.salesInProvinceLiters) ||
      parseFloat(l.salesOutOfProvinceLiters)
    );
  }).length;
}

/* ── Test-data fill ──────────────────────────────────────────── */

type TestLine = Omit<FuelLineState, "taxRatePerLiter">;

const TEST_DATA: Record<string, TestLine> = {
  BENZINE_95:  { openingBalanceLiters: "15000.00", receiptInLiters: "40000.00", salesInProvinceLiters: "38000.00", salesOutOfProvinceLiters: "3000.00" },
  GASOHOL_E10: { openingBalanceLiters: "25000.00", receiptInLiters: "80000.00", salesInProvinceLiters: "72000.00", salesOutOfProvinceLiters: "6000.00" },
  GASOHOL_E20: { openingBalanceLiters: "10000.00", receiptInLiters: "25000.00", salesInProvinceLiters: "22000.00", salesOutOfProvinceLiters: "2000.00" },
  GASOHOL_E85: { openingBalanceLiters: "4000.00",  receiptInLiters: "10000.00", salesInProvinceLiters: "9500.00",  salesOutOfProvinceLiters: "300.00"  },
  DIESEL_B7:   { openingBalanceLiters: "30000.00", receiptInLiters: "100000.00", salesInProvinceLiters: "88000.00", salesOutOfProvinceLiters: "10000.00" },
  DIESEL_B10:  { openingBalanceLiters: "18000.00", receiptInLiters: "60000.00",  salesInProvinceLiters: "53000.00", salesOutOfProvinceLiters: "5000.00"  },
  DIESEL_B20:  { openingBalanceLiters: "8000.00",  receiptInLiters: "20000.00",  salesInProvinceLiters: "18000.00", salesOutOfProvinceLiters: "1500.00"  },
  LPG:         { openingBalanceLiters: "3000.00",  receiptInLiters: "8000.00",   salesInProvinceLiters: "7200.00",  salesOutOfProvinceLiters: "500.00"   },
  NGV:         { openingBalanceLiters: "2000.00",  receiptInLiters: "5000.00",   salesInProvinceLiters: "4500.00",  salesOutOfProvinceLiters: "300.00"   },
};

const DEFAULT_TEST_LINE: TestLine = {
  openingBalanceLiters: "5000.00",
  receiptInLiters: "15000.00",
  salesInProvinceLiters: "13000.00",
  salesOutOfProvinceLiters: "1000.00",
};

/* ── Component ───────────────────────────────────────────────── */

export function ReportForm({
  reportId,
  report,
  station,
  period,
  campaign,
  fuelTypes,
  initialFormState,
}: ReportFormProps) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const effectiveDueDate = campaign?.dueDate ?? period?.dueDate ?? "";
  const isPastDeadline = effectiveDueDate ? effectiveDueDate < today : false;
  const isReadOnly = report.status !== "draft" || isPastDeadline;
  const requiredFields = campaign?.requiredFields ?? null;

  // ── View toggle — default card; switch to tabular only on explicit user action ──
  const [view, setView] = useState<"card" | "tabular">("card");

  // On first mount, switch to tabular on wide screens (users who prefer table UX)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setView("tabular");
    }
  }, []);

  // ── Form state ────────────────────────────────────────────────
  const [formState, setFormState] = useState<ReportFormState>(() => {
    const base = buildInitialState(fuelTypes, initialFormState);
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(LS_KEY(reportId));
        if (saved) {
          const parsed = JSON.parse(saved) as ReportFormState;
          return buildInitialState(fuelTypes, parsed);
        }
      } catch { /* ignore */ }
    }
    return base;
  });

  const filledCount = countFilled(fuelTypes, formState);

  // ── Save status ───────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formStateRef = useRef(formState);
  useEffect(() => { formStateRef.current = formState; }, [formState]);

  // ── onChange ──────────────────────────────────────────────────
  const handleChange = useCallback(
    (fuelTypeId: string, field: keyof FuelLineState, value: string) => {
      setFormState((prev) => {
        const next = { ...prev, [fuelTypeId]: { ...prev[fuelTypeId], [field]: value } };
        formStateRef.current = next;
        try { localStorage.setItem(LS_KEY(reportId), JSON.stringify(next)); } catch {/* */}
        return next;
      });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void autoSave(), 30_000);
      setSaveStatus("idle");
    },
    [reportId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Fill test data (dev only) ─────────────────────────────────
  const handleFillTestData = useCallback(() => {
    setFormState((prev) => {
      const next: ReportFormState = {};
      for (const [id, line] of Object.entries(prev)) {
        next[id] = { ...line, ...(TEST_DATA[id] ?? DEFAULT_TEST_LINE) };
      }
      formStateRef.current = next;
      try { localStorage.setItem(LS_KEY(reportId), JSON.stringify(next)); } catch {/* */}
      return next;
    });
    setSaveStatus("idle");
  }, [reportId]);

  // ── Autosave ──────────────────────────────────────────────────
  const autoSave = useCallback(async () => {
    if (isReadOnly) return;
    setSaveStatus("saving");
    try {
      const lines = Object.entries(formStateRef.current).map(([fuelTypeId, l]) => ({ fuelTypeId, ...l }));
      const res = await fetch(`/api/internal/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
      if (res.ok) { try { localStorage.removeItem(LS_KEY(reportId)); } catch {/* */} }
    } catch { setSaveStatus("error"); }
  }, [reportId, isReadOnly]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const handleSave = () => void autoSave();

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    await autoSave();
    setSubmitStatus("submitting");
    setSubmitError(null);
    setWarnings([]);
    try {
      const res = await fetch(`/api/internal/reports/${reportId}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        setSubmitStatus("error");
        return;
      }
      if (data.warnings?.length) setWarnings(data.warnings);
      setSubmitStatus("done");
      router.refresh();
    } catch {
      setSubmitError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setSubmitStatus("error");
    }
  };

  const isDone = submitStatus === "done" || report.status === "submitted";

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-32 sm:pb-10">

      {/* ── Page header ── */}
      <div
        className="rounded-2xl p-4 sm:p-5 mb-5"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        {/* Top row: status badge + station name */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium mb-1.5"
              style={{
                background: isDone ? "var(--background-positive-light)" : "var(--background-warning-light)",
                color: isDone ? "var(--foreground-positive-default)" : "var(--foreground-warning-default)",
              }}
            >
              {isDone ? <><CheckCircle2 size={11} /> ส่งแล้ว</> : <><Save size={11} /> แบบร่าง</>}
            </span>
            <h1 className="text-lg font-bold leading-tight truncate" style={{ color: "var(--foreground-neutral-default)" }}>
              {station.name}
            </h1>
          </div>

          {/* Desktop action buttons (hidden on mobile — sticky bar handles mobile) */}
          {!isReadOnly && (
            <div className="hidden sm:flex items-center gap-2 shrink-0 pt-0.5">
              {/* Dev-only test data button */}
              {process.env.NODE_ENV !== "production" && (
                <button
                  onClick={handleFillTestData}
                  title="กรอกข้อมูลทดสอบ (dev only)"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: "var(--neutral-96)",
                    color: "var(--foreground-neutral-lightest)",
                    border: "1px dashed var(--stroke-neutral-lighter)",
                  }}
                >
                  <FlaskConical size={13} />
                  ทดสอบ
                </button>
              )}

              {/* Save status */}
              <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
                {saveStatus === "saving" && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> บันทึก…</span>}
                {saveStatus === "saved"  && <span className="flex items-center gap-1" style={{ color: "var(--foreground-positive-default)" }}><CheckCircle2 size={12} /> บันทึกแล้ว</span>}
                {saveStatus === "error"  && <span className="flex items-center gap-1" style={{ color: "var(--foreground-negative-default)" }}><AlertCircle size={12} /> บันทึกไม่สำเร็จ</span>}
              </span>

              <button
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--primary-95)", color: "var(--primary-30-base)", border: "1px solid var(--primary-90)" }}
              >
                <Save size={14} /> บันทึก
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitStatus === "submitting" || isDone}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{
                  background: isDone ? "var(--button-background-disabled)" : "var(--button-background-primary-solid)",
                  color: isDone ? "var(--button-foreground-disabled)" : "var(--button-foreground-primary-on-solid)",
                  cursor: submitStatus === "submitting" ? "wait" : undefined,
                }}
              >
                {submitStatus === "submitting" ? <><Loader2 size={14} className="animate-spin" /> กำลังส่ง…</>
                  : isDone ? <><CheckCircle2 size={14} /> ส่งแล้ว</>
                  : <><SendHorizonal size={14} /> ส่งรายงาน</>}
              </button>
            </div>
          )}
        </div>

        {/* Meta row: dates, province */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {period && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
              <CalendarDays size={12} />
              งวด {period.startDate} – {period.endDate}
              <span
                className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                style={{
                  background: isPastDeadline ? "var(--background-negative-light)" : "var(--background-warning-light)",
                  color: isPastDeadline ? "var(--foreground-negative-default)" : "var(--foreground-warning-default)",
                }}
              >
                กำหนดส่ง {period.dueDate}
              </span>
            </span>
          )}
          {campaign && !period && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
              <CalendarDays size={12} />
              คำขอข้อมูลพิเศษ
              <span className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                style={{ background: "var(--background-warning-light)", color: "var(--foreground-warning-default)" }}>
                กำหนดส่ง {campaign.dueDate}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
            <MapPin size={11} />
            จังหวัดรหัส {station.provinceCode}
          </span>
        </div>

        {/* Progress bar — only for draft forms */}
        {!isReadOnly && fuelTypes.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
                ความคืบหน้า
              </span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: filledCount > 0 ? "var(--primary-30-base)" : "var(--foreground-neutral-lightest)" }}>
                {filledCount}/{fuelTypes.length} ชนิดน้ำมัน
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--neutral-92)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((filledCount / fuelTypes.length) * 100)}%`,
                  background: filledCount === fuelTypes.length
                    ? "var(--foreground-positive-default)"
                    : "var(--primary-30-base)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Campaign notification banner ── */}
      {campaign?.notificationMessage && (
        <div
          className="rounded-xl px-4 py-3 mb-4 text-sm flex items-start gap-2"
          style={{ background: "var(--background-warning-light)", border: "1px solid var(--warning-80)", color: "var(--foreground-warning-default)" }}
        >
          <CalendarDays size={14} className="mt-0.5 shrink-0" />
          <span>{campaign.notificationMessage}</span>
        </div>
      )}

      {/* ── Submit error / warnings ── */}
      {submitError && (
        <div className="rounded-xl p-4 mb-4 text-sm flex items-start gap-2"
          style={{ background: "var(--background-negative-light)", border: "1px solid var(--danger-80)", color: "var(--foreground-negative-default)" }}>
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {submitError}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl p-4 mb-4 text-sm"
          style={{ background: "var(--background-warning-light)", border: "1px solid var(--warning-80)", color: "var(--foreground-warning-default)" }}>
          <p className="font-medium mb-1.5">ส่งรายงานสำเร็จ — กรุณาตรวจสอบข้อมูล:</p>
          <ul className="list-disc list-inside flex flex-col gap-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* ── View toggle + status text ── */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-xs" style={{ color: isPastDeadline && !isDone ? "var(--foreground-negative-default)" : "var(--foreground-neutral-lighter)" }}>
          {isDone
            ? "รายงานนี้ส่งแล้ว (ดูได้อย่างเดียว)"
            : isPastDeadline
            ? `หมดเวลาส่งแล้ว (กำหนด ${effectiveDueDate})`
            : requiredFields
            ? `กรอกเฉพาะฟิลด์ที่กำหนด ${requiredFields.length} รายการ`
            : "แตะชื่อน้ำมันเพื่อกรอกข้อมูล — ภาษีคำนวณอัตโนมัติ"}
        </p>

        {/* View toggle — shown on desktop; on mobile card view is enforced */}
        <div className="hidden sm:flex items-center rounded-xl p-1 gap-1 shrink-0"
          style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}>
          {(["card", "tabular"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: view === v ? "var(--primary-30-base)" : "transparent",
                color: view === v ? "white" : "var(--foreground-neutral-lighter)",
              }}
            >
              {v === "card" ? <><LayoutGrid size={13} /> การ์ด</> : <><TableProperties size={13} /> ตาราง</>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Form body ── */}
      {/* Card view always on mobile; respects toggle on desktop */}
      <div className="sm:hidden">
        <CardView fuelTypes={fuelTypes} formState={formState} onChange={handleChange} readOnly={isReadOnly} requiredFields={requiredFields} />
      </div>
      <div className="hidden sm:block">
        {view === "card"
          ? <CardView fuelTypes={fuelTypes} formState={formState} onChange={handleChange} readOnly={isReadOnly} requiredFields={requiredFields} />
          : <TabularView fuelTypes={fuelTypes} formState={formState} onChange={handleChange} readOnly={isReadOnly} requiredFields={requiredFields} />
        }
      </div>

      {/* ── Sticky action bar — mobile only ── */}
      {!isReadOnly && (
        <div
          className="sm:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center gap-3"
          style={{
            background: "var(--canvas-white)",
            borderTop: "1px solid var(--stroke-neutral-lighter)",
            boxShadow: "0 -4px 16px rgba(0,0,0,.08)",
          }}
        >
          {/* Save status */}
          <span className="text-xs shrink-0" style={{ color: "var(--foreground-neutral-lighter)" }}>
            {saveStatus === "saving" && <Loader2 size={14} className="animate-spin inline" />}
            {saveStatus === "saved"  && <span style={{ color: "var(--foreground-positive-default)" }}><CheckCircle2 size={14} className="inline mr-1" />บันทึกแล้ว</span>}
            {saveStatus === "error"  && <span style={{ color: "var(--foreground-negative-default)" }}><AlertCircle size={14} className="inline mr-1" />บันทึกไม่สำเร็จ</span>}
          </span>

          <button
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "var(--primary-95)", color: "var(--primary-30-base)", border: "1px solid var(--primary-90)" }}
          >
            <Save size={15} /> บันทึก
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitStatus === "submitting" || isDone}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
            style={{
              background: isDone ? "var(--button-background-disabled)" : "var(--button-background-primary-solid)",
              color: isDone ? "var(--button-foreground-disabled)" : "var(--button-foreground-primary-on-solid)",
            }}
          >
            {submitStatus === "submitting" ? <><Loader2 size={15} className="animate-spin" /> กำลังส่ง…</>
              : isDone ? <><CheckCircle2 size={15} /> ส่งแล้ว</>
              : <><SendHorizonal size={15} /> ส่งรายงาน</>}
          </button>
        </div>
      )}
    </div>
  );
}
