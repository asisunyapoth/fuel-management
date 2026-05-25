import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, and, desc, gte, inArray, isNotNull, sum, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  userProvinceLinks,
  stations,
  reports,
  reportingPeriods,
  campaigns,
  campaignStations,
  provinces,
  form014Lines,
  form016Lines,
  fuelTypes,
} from "@/db/schema";
import Link from "next/link";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  FileText,
  Download,
  CalendarDays,
  MapPin,
  TrendingUp,
  Flag,
  Mail,
} from "lucide-react";
import { PacCharts, type TrendPoint, type FuelMixPoint } from "@/components/ui/pac-charts";

/* ── Thai date helper ────────────────────────────────────────────── */

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function toThaiMonthLabel(startDate: string): string {
  const [y, m] = startDate.split("-").map(Number);
  return `${THAI_MONTHS_SHORT[m - 1]} ${(y + 543).toString().slice(-2)}`;
}

function fmtTaxStat(v: number): string {
  if (v === 0) return "—";
  if (v >= 1_000_000_000) return `฿${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `฿${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `฿${(v / 1_000).toFixed(0)}k`;
  return `฿${v.toFixed(0)}`;
}

/* ── Status helpers ────────────────────────────────────────────── */

type ReportStatus = "submitted" | "draft" | "flagged" | "missing";

function statusLabel(s: ReportStatus) {
  switch (s) {
    case "submitted": return "ส่งแล้ว";
    case "draft":     return "แบบร่าง";
    case "flagged":   return "ถูกตั้งสถานะ";
    case "missing":   return "ยังไม่ส่ง";
  }
}

function statusBg(s: ReportStatus) {
  switch (s) {
    case "submitted": return { bg: "var(--background-positive-light)", color: "var(--foreground-positive-default)" };
    case "draft":     return { bg: "var(--background-warning-light)",  color: "var(--foreground-warning-default)" };
    case "flagged":   return { bg: "var(--background-negative-light)", color: "var(--foreground-negative-default)" };
    case "missing":   return { bg: "var(--neutral-94)", color: "var(--foreground-neutral-lighter)" };
  }
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const { bg, color } = statusBg(status);
  const Icon =
    status === "submitted" ? CheckCircle2 :
    status === "draft"     ? Clock :
    status === "flagged"   ? Flag :
    AlertCircle;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: bg, color }}
    >
      <Icon size={11} />
      {statusLabel(status)}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col gap-0.5 min-w-[110px]"
      style={{
        background: "var(--canvas-white)",
        border: "1px solid var(--stroke-neutral-lighter)",
      }}
    >
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: accent ?? "var(--foreground-neutral-default)" }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
        {label}
      </span>
      {sub && (
        <span className="text-xs font-medium" style={{ color: accent ?? "var(--foreground-neutral-default)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default async function PacDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; error?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // ── Verify officer has province link ──────────────────────────
  const [link] = await db
    .select({ provinceCode: userProvinceLinks.provinceCode })
    .from(userProvinceLinks)
    .where(eq(userProvinceLinks.clerkUserId, userId))
    .limit(1);

  if (!link) redirect("/pac/onboarding");

  const { provinceCode } = link;

  // ── Province name ─────────────────────────────────────────────
  const [province] = await db
    .select({ nameTh: provinces.nameTh, region: provinces.region })
    .from(provinces)
    .where(eq(provinces.provinceCode, provinceCode))
    .limit(1);

  const provinceName = province?.nameTh ?? `จังหวัด ${provinceCode}`;

  // ── Reporting periods (pick requested or latest) ───────────────
  const { periodId: periodIdStr } = await searchParams;
  const requestedPeriodId = periodIdStr ? parseInt(periodIdStr) : NaN;

  const allPeriods = await db
    .select()
    .from(reportingPeriods)
    .orderBy(desc(reportingPeriods.startDate));

  const period = isNaN(requestedPeriodId)
    ? allPeriods[0] ?? null
    : (allPeriods.find((p) => p.periodId === requestedPeriodId) ?? allPeriods[0] ?? null);

  // ── All stations in this province ─────────────────────────────
  const allStations = await db
    .select({
      stationId: stations.stationId,
      name: stations.name,
      address: stations.address,
      phone: stations.phone,
    })
    .from(stations)
    .where(eq(stations.provinceCode, provinceCode))
    .orderBy(stations.name);

  // ── Reports for current period ─────────────────────────────────
  const stationIds = allStations.map((s) => s.stationId);

  let periodReports: Array<{
    stationId: number;
    reportId: number;
    status: string;
    submittedAt: Date | null;
  }> = [];

  if (period && stationIds.length > 0) {
    periodReports = await db
      .select({
        stationId: reports.stationId,
        reportId: reports.reportId,
        status: reports.status,
        submittedAt: reports.submittedAt,
      })
      .from(reports)
      .where(
        and(
          eq(reports.periodId, period.periodId),
          inArray(reports.stationId, stationIds)
        )
      );
  }

  const reportByStation = new Map(periodReports.map((r) => [r.stationId, r]));

  // ── Merge stations with their report status ───────────────────
  const stationList = allStations.map((s) => {
    const r = reportByStation.get(s.stationId);
    const status: ReportStatus = r
      ? (r.status as ReportStatus)
      : "missing";
    return { ...s, report: r ?? null, status };
  });

  // ── Stats ─────────────────────────────────────────────────────
  const total     = stationList.length;
  const submitted = stationList.filter((s) => s.status === "submitted").length;
  const draft     = stationList.filter((s) => s.status === "draft").length;
  const missing   = stationList.filter((s) => s.status === "missing").length;
  const flagged   = stationList.filter((s) => s.status === "flagged").length;
  const pct       = total > 0 ? Math.round((submitted / total) * 100) : 0;

  const today = new Date().toISOString().split("T")[0];
  const isPastDeadline = period ? period.dueDate < today : false;

  // ── Active campaigns in this province ─────────────────────────
  type CampaignRow = {
    campaignId: number;
    name: string;
    dueDate: string;
    notificationMessage: string | null;
    stationId: number;
    reportId: number | null;
    reportStatus: string | null;
  };

  let campaignRows: CampaignRow[] = [];
  if (stationIds.length > 0) {
    campaignRows = await db
      .select({
        campaignId: campaigns.campaignId,
        name: campaigns.name,
        dueDate: campaigns.dueDate,
        notificationMessage: campaigns.notificationMessage,
        stationId: campaignStations.stationId,
        reportId: reports.reportId,
        reportStatus: reports.status,
      })
      .from(campaigns)
      .innerJoin(campaignStations, eq(campaigns.campaignId, campaignStations.campaignId))
      .leftJoin(
        reports,
        and(
          eq(reports.stationId, campaignStations.stationId),
          eq(reports.campaignId, campaigns.campaignId)
        )
      )
      .where(
        and(
          eq(campaigns.status, "active"),
          gte(campaigns.dueDate, today),
          inArray(campaignStations.stationId, stationIds)
        )
      ) as CampaignRow[];
  }

  // Group by campaignId
  const campaignMap = new Map<
    number,
    {
      campaignId: number;
      name: string;
      dueDate: string;
      notificationMessage: string | null;
      totalTargeted: number;
      submitted: number;
      missing: string[]; // station names not yet submitted
    }
  >();

  const stationNameById = new Map(allStations.map((s) => [s.stationId, s.name]));

  for (const row of campaignRows) {
    if (!campaignMap.has(row.campaignId)) {
      campaignMap.set(row.campaignId, {
        campaignId: row.campaignId,
        name: row.name,
        dueDate: row.dueDate,
        notificationMessage: row.notificationMessage,
        totalTargeted: 0,
        submitted: 0,
        missing: [],
      });
    }
    const c = campaignMap.get(row.campaignId)!;
    c.totalTargeted++;
    if (row.reportStatus === "submitted") {
      c.submitted++;
    } else {
      c.missing.push(stationNameById.get(row.stationId) ?? `#${row.stationId}`);
    }
  }

  const activeCampaigns = [...campaignMap.values()];

  // ── Chart data ────────────────────────────────────────────────
  let trendData: TrendPoint[] = [];
  let fuelMixData: FuelMixPoint[] = [];
  let taxBreakdown: {
    fuelTypeId: string;
    nameTh: string;
    volumeSold: number;
    avgRate: number;
    totalTax: number;
  }[] = [];

  if (stationIds.length > 0) {
    // Last 12 periods in chronological order (oldest → newest)
    const last12 = allPeriods.slice(0, 12).reverse();
    const periodIds = last12.map((p) => p.periodId);

    if (periodIds.length > 0) {
      // Volume sold per period (from form_014_lines)
      const [volumeRows, stockRows, submissionRows, taxRows] = await Promise.all([
        db
          .select({
            periodId: reports.periodId,
            totalVolume: sum(form014Lines.volumeSoldLiters),
          })
          .from(form014Lines)
          .innerJoin(reports, eq(form014Lines.reportId, reports.reportId))
          .where(
            and(
              eq(reports.status, "submitted"),
              inArray(reports.stationId, stationIds),
              isNotNull(reports.periodId),
              inArray(reports.periodId, periodIds),
            )
          )
          .groupBy(reports.periodId),

        // Closing stock per period  (opening + receipt - salesIn - salesOut)
        db
          .select({
            periodId: reports.periodId,
            closingStock: sql<string>`SUM(
              ${form016Lines.openingBalanceLiters}
              + ${form016Lines.receiptInLiters}
              - ${form016Lines.salesInProvinceLiters}
              - ${form016Lines.salesOutOfProvinceLiters}
            )`,
          })
          .from(form016Lines)
          .innerJoin(reports, eq(form016Lines.reportId, reports.reportId))
          .where(
            and(
              eq(reports.status, "submitted"),
              inArray(reports.stationId, stationIds),
              isNotNull(reports.periodId),
              inArray(reports.periodId, periodIds),
            )
          )
          .groupBy(reports.periodId),

        // Submission count per period
        db
          .select({
            periodId: reports.periodId,
            submittedCount: sql<number>`COUNT(*)::int`,
          })
          .from(reports)
          .where(
            and(
              eq(reports.status, "submitted"),
              inArray(reports.stationId, stationIds),
              isNotNull(reports.periodId),
              inArray(reports.periodId, periodIds),
            )
          )
          .groupBy(reports.periodId),

        // Tax collected per period (from form_014_lines)
        db
          .select({
            periodId: reports.periodId,
            totalTax: sum(form014Lines.taxAmount),
          })
          .from(form014Lines)
          .innerJoin(reports, eq(form014Lines.reportId, reports.reportId))
          .where(
            and(
              eq(reports.status, "submitted"),
              inArray(reports.stationId, stationIds),
              isNotNull(reports.periodId),
              inArray(reports.periodId, periodIds),
            )
          )
          .groupBy(reports.periodId),
      ]);

      const volumeByPeriod    = new Map(volumeRows.map((r) => [r.periodId, parseFloat(r.totalVolume ?? "0")]));
      const stockByPeriod     = new Map(stockRows.map((r) => [r.periodId, parseFloat(r.closingStock ?? "0")]));
      const submittedByPeriod = new Map(submissionRows.map((r) => [r.periodId, r.submittedCount ?? 0]));
      const taxByPeriod       = new Map(taxRows.map((r) => [r.periodId, parseFloat(r.totalTax ?? "0")]));

      trendData = last12.map((p) => {
        const cnt = submittedByPeriod.get(p.periodId) ?? 0;
        const tot = stationIds.length;
        return {
          label:          toThaiMonthLabel(p.startDate),
          volumeSold:     volumeByPeriod.get(p.periodId) ?? 0,
          closingStock:   stockByPeriod.get(p.periodId) ?? 0,
          submittedCount: cnt,
          totalStations:  tot,
          compliancePct:  tot > 0 ? Math.round((cnt / tot) * 100) : 0,
          taxCollected:   taxByPeriod.get(p.periodId) ?? 0,
        };
      });
    }

    // Fuel mix for current period
    if (period) {
      const fuelRows = await db
        .select({
          fuelTypeId: form014Lines.fuelTypeId,
          nameTh:      fuelTypes.nameTh,
          totalVolume: sum(form014Lines.volumeSoldLiters),
        })
        .from(form014Lines)
        .innerJoin(reports,    eq(form014Lines.reportId,    reports.reportId))
        .innerJoin(fuelTypes, eq(form014Lines.fuelTypeId, fuelTypes.fuelTypeId))
        .where(
          and(
            eq(reports.status, "submitted"),
            inArray(reports.stationId, stationIds),
            eq(reports.periodId, period.periodId),
          )
        )
        .groupBy(form014Lines.fuelTypeId, fuelTypes.nameTh)
        .orderBy(desc(sum(form014Lines.volumeSoldLiters)));

      fuelMixData = fuelRows.map((r) => ({
        fuelTypeId: r.fuelTypeId,
        nameTh:     r.nameTh,
        volume:     parseFloat(r.totalVolume ?? "0"),
      }));

      // Tax breakdown by fuel type for current period
      const taxRows2 = await db
        .select({
          fuelTypeId: form014Lines.fuelTypeId,
          nameTh:     fuelTypes.nameTh,
          volumeSold: sum(form014Lines.volumeSoldLiters),
          avgRate:    sql<string>`AVG(${form014Lines.taxRatePerLiter})`,
          totalTax:   sum(form014Lines.taxAmount),
        })
        .from(form014Lines)
        .innerJoin(reports,   eq(form014Lines.reportId,   reports.reportId))
        .innerJoin(fuelTypes, eq(form014Lines.fuelTypeId, fuelTypes.fuelTypeId))
        .where(
          and(
            eq(reports.status, "submitted"),
            inArray(reports.stationId, stationIds),
            eq(reports.periodId, period.periodId),
          )
        )
        .groupBy(form014Lines.fuelTypeId, fuelTypes.nameTh)
        .orderBy(desc(sum(form014Lines.taxAmount)));

      taxBreakdown = taxRows2.map((r) => ({
        fuelTypeId: r.fuelTypeId,
        nameTh:     r.nameTh,
        volumeSold: parseFloat(r.volumeSold ?? "0"),
        avgRate:    parseFloat(r.avgRate    ?? "0"),
        totalTax:   parseFloat(r.totalTax  ?? "0"),
      }));
    }
  }

  const totalTaxThisPeriod = taxBreakdown.reduce((acc, r) => acc + r.totalTax, 0);

  const currentPeriodLabel = period ? toThaiMonthLabel(period.startDate) : "—";

  // ── Export URL ─────────────────────────────────────────────────
  const exportHref = period
    ? `/api/internal/pac/reports/export?periodId=${period.periodId}`
    : "#";

  // ── Mode label ─────────────────────────────────────────────────
  const modeLabel: Record<string, string> = { M: "รายเดือน", W: "รายสัปดาห์", D: "รายวัน" };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

      {/* ── Province header ── */}
      <div
        className="rounded-2xl p-5 mb-6"
        style={{
          background: "var(--canvas-white)",
          border: "1px solid var(--stroke-neutral-lighter)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                style={{ background: "var(--secondary-95)" }}
              >
                <MapPin size={15} style={{ color: "var(--secondary-40-main)" }} />
              </span>
              <div>
                <h1
                  className="text-xl font-bold"
                  style={{ color: "var(--foreground-neutral-default)" }}
                >
                  จังหวัด{provinceName}
                </h1>
                <p className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
                  ภาค{province?.region ?? ""} · รหัส {provinceCode} · เจ้าหน้าที่ อบจ.
                </p>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <StatCard label="สถานีทั้งหมด" value={total} />
            <StatCard
              label="ส่งแล้ว"
              value={submitted}
              sub={`${pct}%`}
              accent="var(--foreground-positive-default)"
            />
            <StatCard
              label="แบบร่าง"
              value={draft}
              accent={draft > 0 ? "var(--foreground-warning-default)" : undefined}
            />
            <StatCard
              label="ยังไม่ส่ง"
              value={missing}
              accent={missing > 0 ? "var(--foreground-negative-default)" : undefined}
            />
            <StatCard
              label="ภาษีที่จัดเก็บ"
              value={fmtTaxStat(totalTaxThisPeriod)}
              sub={totalTaxThisPeriod > 0 ? currentPeriodLabel : undefined}
              accent={totalTaxThisPeriod > 0 ? "#d97706" : undefined}
            />
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mt-4">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--neutral-92)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: pct >= 100
                    ? "var(--foreground-positive-default)"
                    : pct >= 60
                    ? "var(--primary-30-base)"
                    : "var(--foreground-warning-default)",
                }}
              />
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--foreground-neutral-lighter)" }}>
              {submitted}/{total} สถานีส่งรายงานแล้ว
            </p>
          </div>
        )}
      </div>

      {/* ── Active campaigns ── */}
      {activeCampaigns.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {activeCampaigns.map((c) => (
            <div
              key={c.campaignId}
              className="rounded-2xl p-4"
              style={{
                background: "var(--background-warning-light)",
                border: "1px solid var(--warning-80)",
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={14} style={{ color: "var(--foreground-warning-default)" }} />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--foreground-warning-default)" }}
                    >
                      คำขอข้อมูลพิเศษ: {c.name}
                    </span>
                  </div>
                  {c.notificationMessage && (
                    <p className="text-xs ml-5 mb-1" style={{ color: "var(--foreground-warning-default)" }}>
                      {c.notificationMessage}
                    </p>
                  )}
                  <p className="text-xs ml-5" style={{ color: "var(--foreground-neutral-lighter)" }}>
                    กำหนดส่ง {c.dueDate} · ส่งแล้ว {c.submitted}/{c.totalTargeted} สถานี
                  </p>
                </div>
                <div
                  className="text-xs px-3 py-1.5 rounded-lg shrink-0 font-medium"
                  style={{
                    background: c.submitted === c.totalTargeted
                      ? "var(--background-positive-light)"
                      : "var(--background-warning-light)",
                    color: c.submitted === c.totalTargeted
                      ? "var(--foreground-positive-default)"
                      : "var(--foreground-warning-default)",
                    border: "1px solid currentColor",
                  }}
                >
                  {c.submitted === c.totalTargeted ? "ครบแล้ว ✓" : `รอ ${c.totalTargeted - c.submitted} สถานี`}
                </div>
              </div>
              {c.missing.length > 0 && (
                <div className="mt-2 ml-5">
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--foreground-warning-default)" }}>
                    สถานีที่ยังไม่ส่ง:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {c.missing.slice(0, 10).map((name) => (
                      <span
                        key={name}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: "var(--canvas-white)",
                          color: "var(--foreground-neutral-default)",
                          border: "1px solid var(--stroke-neutral-lighter)",
                        }}
                      >
                        {name}
                      </span>
                    ))}
                    {c.missing.length > 10 && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: "var(--neutral-92)", color: "var(--foreground-neutral-lighter)" }}
                      >
                        +{c.missing.length - 10} อื่นๆ
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ── */}
      <PacCharts
        trendData={trendData}
        fuelMix={fuelMixData}
        currentPeriodLabel={currentPeriodLabel}
      />

      {/* ── Tax breakdown table ── */}
      {taxBreakdown.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden overflow-x-auto mb-6"
          style={{
            background: "var(--canvas-white)",
            border: "1px solid var(--stroke-neutral-lighter)",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid var(--stroke-neutral-default)" }}
          >
            <span
              className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
              style={{ background: "#fef3c7" }}
            >
              <TrendingUp size={13} style={{ color: "#d97706" }} />
            </span>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
              ภาษีน้ำมันจำแนกตามประเภท · {currentPeriodLabel}
            </p>
            <span
              className="ml-auto text-xs font-semibold tabular-nums"
              style={{ color: "#d97706" }}
            >
              รวม {totalTaxThisPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
            </span>
          </div>

          <table className="w-full border-collapse text-sm min-w-[600px]">
            <thead>
              <tr>
                {(["ชนิดน้ำมัน", "ปริมาณจำหน่าย (ล.)", "อัตราภาษี (บ./ล.)", "ภาษีที่จัดเก็บ (บาท)", "สัดส่วน"] as const).map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${i >= 1 ? "text-right" : "text-left"}`}
                    style={{
                      color: "var(--foreground-neutral-lighter)",
                      borderBottom: "1px solid var(--stroke-neutral-default)",
                      background: "var(--neutral-98)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taxBreakdown.map((row) => {
                const pct = totalTaxThisPeriod > 0 ? (row.totalTax / totalTaxThisPeriod) * 100 : 0;
                return (
                  <tr key={row.fuelTypeId} className="hover:bg-[var(--neutral-98)] transition-colors">
                    <td
                      className="px-4 py-3"
                      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                    >
                      <span className="text-sm font-medium" style={{ color: "var(--foreground-neutral-default)" }}>
                        {row.nameTh}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums"
                      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)", color: "var(--foreground-neutral-lighter)" }}
                    >
                      {row.volumeSold.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums"
                      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)", color: "var(--foreground-neutral-lighter)" }}
                    >
                      {row.avgRate.toLocaleString("th-TH", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-medium"
                      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)", color: "#d97706" }}
                    >
                      {row.totalTax.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                    >
                      <div className="flex items-center gap-2 justify-end">
                        <div
                          className="h-2 rounded-full overflow-hidden"
                          style={{ width: 64, background: "var(--neutral-92)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%`, background: "#f59e0b" }}
                          />
                        </div>
                        <span className="text-xs tabular-nums w-10 text-right" style={{ color: "var(--foreground-neutral-lighter)" }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Table footer */}
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--stroke-neutral-default)", background: "var(--neutral-98)" }}
          >
            <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
              {taxBreakdown.length} ประเภทน้ำมัน · เฉพาะสถานีที่ส่งรายงานแล้ว
            </span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: "#d97706" }}>
              ฿{totalTaxThisPeriod.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* ── Period selector + controls ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          {period ? (
            <div className="flex items-center gap-2">
              <CalendarDays size={14} style={{ color: "var(--foreground-neutral-lighter)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--foreground-neutral-default)" }}>
                {modeLabel[period.mode] ?? period.mode} · {period.startDate} – {period.endDate}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: isPastDeadline ? "var(--background-negative-light)" : "var(--neutral-94)",
                  color: isPastDeadline ? "var(--foreground-negative-default)" : "var(--foreground-neutral-lighter)",
                }}
              >
                {isPastDeadline ? "หมดเวลา" : `กำหนดส่ง ${period.dueDate}`}
              </span>
            </div>
          ) : (
            <span className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>
              ยังไม่มีรอบรายงาน
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Period picker */}
          {allPeriods.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
                ดูรอบ:
              </span>
              <div className="flex gap-1">
                {allPeriods.slice(0, 4).map((p) => (
                  <Link
                    key={p.periodId}
                    href={`/pac?periodId=${p.periodId}`}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: p.periodId === period?.periodId
                        ? "var(--primary-30-base)"
                        : "var(--canvas-white)",
                      color: p.periodId === period?.periodId
                        ? "white"
                        : "var(--foreground-neutral-lighter)",
                      border: "1px solid var(--stroke-neutral-lighter)",
                    }}
                  >
                    {p.startDate.slice(0, 7)}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Warning letters */}
          {missing > 0 && period && (
            <Link
              href={`/pac/warning-letters?periodId=${period.periodId}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
              style={{
                background: "var(--background-warning-light)",
                color: "var(--foreground-warning-default)",
                border: "1px solid var(--warning-80)",
              }}
            >
              <Mail size={14} />
              จดหมายแจ้งเตือน ({missing})
            </Link>
          )}

          {/* Excel export */}
          <a
            href={exportHref}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: "var(--primary-95)",
              color: "var(--primary-30-base)",
              border: "1px solid var(--primary-90)",
              pointerEvents: period ? undefined : "none",
              opacity: period ? 1 : 0.4,
            }}
          >
            <Download size={14} />
            ส่งออก Excel
          </a>
        </div>
      </div>

      {/* ── Station compliance table ── */}
      {total === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: "var(--canvas-white)",
            border: "1px solid var(--stroke-neutral-lighter)",
          }}
        >
          <Building2
            size={32}
            className="mx-auto mb-3"
            style={{ color: "var(--foreground-neutral-lightest)" }}
          />
          <p className="text-sm" style={{ color: "var(--foreground-neutral-lighter)" }}>
            ยังไม่มีสถานีในจังหวัดนี้ในระบบ
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden overflow-x-auto"
          style={{
            background: "var(--canvas-white)",
            border: "1px solid var(--stroke-neutral-lighter)",
          }}
        >
          <table className="w-full border-collapse text-sm min-w-[640px]">
            <thead>
              <tr>
                {(["ชื่อสถานี", "ที่อยู่", "สถานะ", "วันที่ส่ง", ""] as const).map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 text-xs font-semibold text-left whitespace-nowrap`}
                    style={{
                      color: "var(--foreground-neutral-lighter)",
                      borderBottom: "1px solid var(--stroke-neutral-default)",
                      background: "var(--neutral-98)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stationList.map((s) => (
                <tr
                  key={s.stationId}
                  className="hover:bg-[var(--neutral-98)] transition-colors"
                >
                  {/* Station name */}
                  <td
                    className="px-4 py-3"
                    style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                  >
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--foreground-neutral-default)" }}
                    >
                      {s.name}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--foreground-neutral-lightest)" }}
                    >
                      #{s.stationId}
                    </p>
                  </td>

                  {/* Address */}
                  <td
                    className="px-4 py-3 max-w-[220px]"
                    style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                  >
                    <p
                      className="text-xs line-clamp-2"
                      style={{ color: "var(--foreground-neutral-lighter)" }}
                    >
                      {s.address ?? "—"}
                    </p>
                  </td>

                  {/* Status */}
                  <td
                    className="px-4 py-3"
                    style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                  >
                    <StatusBadge status={s.status} />
                  </td>

                  {/* Submitted at */}
                  <td
                    className="px-4 py-3"
                    style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                  >
                    <span className="text-xs tabular-nums" style={{ color: "var(--foreground-neutral-lighter)" }}>
                      {s.report?.submittedAt
                        ? new Date(s.report.submittedAt).toLocaleDateString("th-TH", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })
                        : "—"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td
                    className="px-4 py-3 text-right"
                    style={{ borderBottom: "1px solid var(--stroke-neutral-lightest)" }}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      {s.report ? (
                        <Link
                          href={`/reports/${s.report.reportId}`}
                          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                          style={{
                            color: "var(--primary-30-base)",
                            background: "var(--primary-95)",
                            border: "1px solid var(--primary-90)",
                          }}
                        >
                          <FileText size={11} />
                          ดูรายงาน
                        </Link>
                      ) : null}
                      {s.status === "missing" && period && (
                        <Link
                          href={`/pac/warning-letters?periodId=${period.periodId}&stationIds=${s.stationId}`}
                          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                          style={{
                            color: "var(--foreground-warning-default)",
                            background: "var(--background-warning-light)",
                            border: "1px solid var(--warning-80)",
                          }}
                        >
                          <Mail size={11} />
                          จดหมาย
                        </Link>
                      )}
                      {s.status !== "missing" && !s.report && (
                        <span className="text-xs" style={{ color: "var(--foreground-neutral-lightest)" }}>
                          —
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Table footer with totals */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{
              borderTop: "1px solid var(--stroke-neutral-default)",
              background: "var(--neutral-98)",
            }}
          >
            <span className="text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
              แสดง {stationList.length} สถานี ในจังหวัด{provinceName}
            </span>
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--foreground-neutral-lighter)" }}>
              {flagged > 0 && (
                <span style={{ color: "var(--foreground-negative-default)" }}>
                  ถูกตั้งสถานะ {flagged}
                </span>
              )}
              <span style={{ color: "var(--foreground-warning-default)" }}>แบบร่าง {draft}</span>
              <span style={{ color: "var(--foreground-negative-default)" }}>ยังไม่ส่ง {missing}</span>
              <span style={{ color: "var(--foreground-positive-default)" }}>ส่งแล้ว {submitted}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
