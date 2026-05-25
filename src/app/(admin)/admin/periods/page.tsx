import { desc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportingPeriods, reports } from "@/db/schema";
import { CalendarDays, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { CreatePeriodForm } from "./CreatePeriodForm";
import { ExtendDeadlineButton } from "./ExtendDeadlineButton";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function periodStatus(dueDate: string): "open" | "closed" {
  return new Date(dueDate) >= new Date() ? "open" : "closed";
}

const MODE_LABELS: Record<string, string> = {
  M: "รายเดือน",
  W: "รายสัปดาห์",
  D: "รายวัน",
};

export default async function AdminPeriodsPage() {
  const [periods, submissionCounts] = await Promise.all([
    db.select().from(reportingPeriods).orderBy(desc(reportingPeriods.startDate)),
    db
      .select({ periodId: reports.periodId, cnt: count() })
      .from(reports)
      .where(eq(reports.status, "submitted"))
      .groupBy(reports.periodId),
  ]);

  const submissionMap = new Map(submissionCounts.map((r) => [r.periodId, Number(r.cnt)]));

  const openPeriods = periods.filter((p) => periodStatus(p.dueDate) === "open");
  const closedPeriods = periods.filter((p) => periodStatus(p.dueDate) === "closed");

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
            รอบการรายงาน
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
            {openPeriods.length} รอบที่เปิดอยู่ · {closedPeriods.length} รอบที่ปิดแล้ว
          </p>
        </div>
      </div>

      {/* Create form */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
      >
        <div
          className="px-6 py-4"
          style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
            สร้างรอบการรายงานใหม่
          </h2>
        </div>
        <div className="px-6 py-5">
          <CreatePeriodForm />
        </div>
      </div>

      {/* Open periods */}
      {openPeriods.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: "var(--foreground-positive-default)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
              รอบที่เปิดรับส่งอยู่
            </h2>
          </div>
          {openPeriods.map((p) => (
            <PeriodCard
              key={p.periodId}
              period={p}
              submittedCount={submissionMap.get(p.periodId) ?? 0}
              status="open"
            />
          ))}
        </section>
      )}

      {/* Closed periods */}
      {closedPeriods.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} style={{ color: "var(--foreground-neutral-lighter)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-lighter)" }}>
              รอบที่ปิดแล้ว
            </h2>
          </div>
          {closedPeriods.map((p) => (
            <PeriodCard
              key={p.periodId}
              period={p}
              submittedCount={submissionMap.get(p.periodId) ?? 0}
              status="closed"
            />
          ))}
        </section>
      )}

      {periods.length === 0 && (
        <div
          className="rounded-2xl py-16 text-center"
          style={{ background: "var(--canvas-white)", border: "1px solid var(--stroke-neutral-lighter)" }}
        >
          <CalendarDays size={32} className="mx-auto mb-3" style={{ color: "var(--foreground-neutral-lightest)" }} />
          <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>
            ยังไม่มีรอบการรายงาน — สร้างรอบแรกด้านบน
          </p>
        </div>
      )}
    </div>
  );
}

function PeriodCard({
  period,
  submittedCount,
  status,
}: {
  period: { periodId: number; mode: string; startDate: string; endDate: string; dueDate: string };
  submittedCount: number;
  status: "open" | "closed";
}) {
  const isOpen = status === "open";
  return (
    <div
      className="rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap"
      style={{
        background: "var(--canvas-white)",
        border: `1px solid ${isOpen ? "var(--stroke-positive-light)" : "var(--stroke-neutral-lighter)"}`,
      }}
    >
      {/* Mode badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
        style={{
          background: isOpen ? "var(--background-positive-light)" : "var(--neutral-95)",
          color: isOpen ? "var(--foreground-positive-default)" : "var(--foreground-neutral-lighter)",
        }}
      >
        {MODE_LABELS[period.mode] ?? period.mode}
      </span>

      {/* Dates */}
      <div className="flex flex-col gap-0.5 flex-1 min-w-48">
        <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--foreground-neutral-default)" }}>
          <CalendarDays size={13} />
          {fmtDate(period.startDate)} – {fmtDate(period.endDate)}
        </div>
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: isOpen ? "var(--foreground-negative-default)" : "var(--foreground-neutral-lighter)" }}
        >
          <AlertCircle size={11} />
          กำหนดส่ง: {fmtDate(period.dueDate)}
          {!isOpen && " (ปิดแล้ว)"}
        </div>
      </div>

      {/* Submission count */}
      <div className="text-center shrink-0">
        <p className="text-xl font-bold tabular-nums" style={{ color: "var(--foreground-neutral-default)" }}>
          {submittedCount}
        </p>
        <p className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>ส่งแล้ว</p>
      </div>

      {/* Extend deadline button (open periods only) */}
      {isOpen && (
        <ExtendDeadlineButton periodId={period.periodId} currentDueDate={period.dueDate} />
      )}
    </div>
  );
}
