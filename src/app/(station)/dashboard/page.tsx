import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  stations,
  dealerLicenses,
  userStationLinks,
  reports,
  reportingPeriods,
  campaigns,
  campaignStations,
} from "@/db/schema";
import { eq, and, lte, desc, inArray, gte } from "drizzle-orm";
import Link from "next/link";
import {
  Fuel,
  FileText,
  ChevronRight,
  PlusCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FilePlus,
  Settings,
  ClipboardList,
  Timer,
} from "lucide-react";
import { RemoveStationButton } from "./RemoveStationButton";

/* ── Date / deadline helpers ─────────────────────────────────── */

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

function daysUntil(isoDateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(isoDateStr);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

type Urgency = "ok" | "soon" | "urgent" | "overdue";

function urgency(days: number): Urgency {
  if (days < 0) return "overdue";
  if (days <= 3) return "urgent";
  if (days <= 7) return "soon";
  return "ok";
}

const URGENCY_STYLES: Record<Urgency, { bg: string; color: string; border: string }> = {
  ok:      { bg: "var(--primary-95)",              color: "var(--primary-30-base)",               border: "var(--primary-90)" },
  soon:    { bg: "var(--background-warning-light)", color: "var(--foreground-warning-default)",     border: "var(--warning-80)" },
  urgent:  { bg: "var(--background-negative-light)",color: "var(--foreground-negative-default)",   border: "var(--danger-80)" },
  overdue: { bg: "var(--background-negative-light)",color: "var(--foreground-negative-default)",   border: "var(--danger-80)" },
};

function DeadlinePill({ dueDate, today }: { dueDate: string; today: string }) {
  const days = daysUntil(dueDate);
  const u = urgency(days);
  const { bg, color } = URGENCY_STYLES[u];

  let label: string;
  if (u === "overdue") label = "หมดเวลาแล้ว";
  else if (days === 0) label = "ครบกำหนดวันนี้";
  else label = `เหลือ ${days} วัน`;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: bg, color }}
    >
      <Timer size={11} />
      {label} · ส่งภายใน {thaiDate(dueDate)}
    </span>
  );
}

/* ── Status badge ────────────────────────────────────────────── */

type ReportStatus = "submitted" | "draft" | "none" | "expired";

function StatusBadge({ status }: { status: ReportStatus }) {
  const config = {
    submitted: {
      label: "ส่งแล้ว",
      bg: "var(--background-positive-light)",
      color: "var(--foreground-positive-default)",
      Icon: CheckCircle2,
    },
    draft: {
      label: "แบบร่าง",
      bg: "var(--background-warning-light)",
      color: "var(--foreground-warning-default)",
      Icon: Clock,
    },
    none: {
      label: "ยังไม่ส่ง",
      bg: "var(--neutral-96)",
      color: "var(--foreground-neutral-lighter)",
      Icon: FilePlus,
    },
    expired: {
      label: "หมดเวลา",
      bg: "var(--background-negative-light)",
      color: "var(--foreground-negative-default)",
      Icon: AlertTriangle,
    },
  } as const;

  const { label, bg, color, Icon } = config[status];

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: bg, color }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const displayName = session?.user?.name ?? session?.user?.email ?? "ผู้ใช้งาน";

  // ── 1. Get linked stations ────────────────────────────────────
  const linkedStations = await db
    .select({
      stationId: stations.stationId,
      name: stations.name,
      address: stations.address,
      provinceCode: stations.provinceCode,
      branchCode: stations.branchCode,
      licenseNo: dealerLicenses.licenseNo,
      companyName: dealerLicenses.companyName,
    })
    .from(userStationLinks)
    .innerJoin(stations, eq(userStationLinks.stationId, stations.stationId))
    .innerJoin(dealerLicenses, eq(stations.dealerLicenseNo, dealerLicenses.licenseNo))
    .where(eq(userStationLinks.userId, userId))
    .orderBy(stations.name);

  const today = new Date().toISOString().split("T")[0];

  // ── 2. Regular period ─────────────────────────────────────────
  const [currentPeriod] = await db
    .select()
    .from(reportingPeriods)
    .where(lte(reportingPeriods.startDate, today))
    .orderBy(desc(reportingPeriods.startDate), desc(reportingPeriods.periodId))
    .limit(1);

  // ── 3. Active campaigns for this user's stations ──────────────
  type CampaignRow = {
    campaignId: number;
    name: string;
    dueDate: string;
    notificationMessage: string | null;
    isPastDeadline: boolean;
    stations: {
      stationId: number;
      stationName: string;
      reportId: number | null;
      reportStatus: ReportStatus;
    }[];
  };

  let activeCampaigns: CampaignRow[] = [];

  if (linkedStations.length > 0) {
    const stationIds = linkedStations.map((s) => s.stationId);

    const rawCampaigns = await db
      .selectDistinct({
        campaignId: campaigns.campaignId,
        name: campaigns.name,
        dueDate: campaigns.dueDate,
        notificationMessage: campaigns.notificationMessage,
      })
      .from(campaigns)
      .innerJoin(campaignStations, eq(campaigns.campaignId, campaignStations.campaignId))
      .where(
        and(
          eq(campaigns.status, "active"),
          gte(campaigns.dueDate, today),
          inArray(campaignStations.stationId, stationIds)
        )
      );

    if (rawCampaigns.length > 0) {
      const campaignIds = rawCampaigns.map((c) => c.campaignId);

      const targets = await db
        .select({
          campaignId: campaignStations.campaignId,
          stationId: campaignStations.stationId,
          stationName: stations.name,
        })
        .from(campaignStations)
        .innerJoin(stations, eq(campaignStations.stationId, stations.stationId))
        .where(
          and(
            inArray(campaignStations.campaignId, campaignIds),
            inArray(campaignStations.stationId, stationIds)
          )
        );

      const campaignReports = await db
        .select({
          campaignId: reports.campaignId,
          stationId: reports.stationId,
          reportId: reports.reportId,
          status: reports.status,
        })
        .from(reports)
        .where(
          and(
            inArray(reports.campaignId, campaignIds),
            inArray(reports.stationId, stationIds)
          )
        );

      const reportMap = new Map(
        campaignReports.map((r) => [`${r.campaignId}-${r.stationId}`, r])
      );

      activeCampaigns = rawCampaigns.map((c) => {
        const isPastDeadline = c.dueDate < today;
        const campaignTargets = targets.filter((t) => t.campaignId === c.campaignId);
        return {
          ...c,
          isPastDeadline,
          stations: campaignTargets.map((t) => {
            const r = reportMap.get(`${c.campaignId}-${t.stationId}`);
            let reportStatus: ReportStatus = "none";
            if (r) reportStatus = r.status as ReportStatus;
            else if (isPastDeadline) reportStatus = "expired";
            return {
              stationId: t.stationId,
              stationName: t.stationName,
              reportId: r?.reportId ?? null,
              reportStatus,
            };
          }),
        };
      });
    }
  }

  // ── 4. Period report status per station ───────────────────────
  type StationWithStatus = (typeof linkedStations)[number] & {
    reportStatus: ReportStatus;
    reportId: number | null;
  };

  let stationsWithStatus: StationWithStatus[] = [];

  if (linkedStations.length > 0 && currentPeriod) {
    const stationIds = linkedStations.map((s) => s.stationId);

    const existingReports = await db
      .select({
        stationId: reports.stationId,
        reportId: reports.reportId,
        status: reports.status,
      })
      .from(reports)
      .where(
        and(
          eq(reports.periodId, currentPeriod.periodId),
          inArray(reports.stationId, stationIds)
        )
      );

    const reportMap = new Map(existingReports.map((r) => [r.stationId, r]));
    const isPastDeadline = currentPeriod.dueDate < today;

    stationsWithStatus = linkedStations.map((s) => {
      const report = reportMap.get(s.stationId);
      let reportStatus: ReportStatus = "none";
      if (report) {
        reportStatus = report.status as ReportStatus;
      } else if (isPastDeadline) {
        reportStatus = "expired";
      }
      return { ...s, reportStatus, reportId: report?.reportId ?? null };
    });
  } else {
    stationsWithStatus = linkedStations.map((s) => ({
      ...s,
      reportStatus: "none" as ReportStatus,
      reportId: null,
    }));
  }

  /* ── Derived for urgency banner ── */
  const deadlineDays = currentPeriod ? daysUntil(currentPeriod.dueDate) : null;
  const deadlineUrgency = deadlineDays !== null ? urgency(deadlineDays) : "ok";
  const periodStyles = URGENCY_STYLES[deadlineUrgency];

  const pendingCount = stationsWithStatus.filter(
    (s) => s.reportStatus === "none" || s.reportStatus === "draft"
  ).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Page heading ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--foreground-neutral-default)" }}
          >
            หน้าหลัก
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
            ยินดีต้อนรับ, {displayName}
          </p>
        </div>

        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors self-start sm:self-auto"
          style={{
            background: "var(--primary-95)",
            color: "var(--foreground-primary-default)",
            border: "1px solid var(--primary-90)",
          }}
        >
          <PlusCircle size={15} />
          เพิ่มสถานีบริการ
        </Link>
      </div>

      {/* ── Empty state ── */}
      {linkedStations.length === 0 && (
        <div
          className="rounded-2xl p-12 flex flex-col items-center text-center"
          style={{
            background: "var(--canvas-white)",
            border: "1px solid var(--stroke-neutral-lighter)",
          }}
        >
          <span
            className="flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "var(--primary-95)" }}
          >
            <Fuel size={26} style={{ color: "var(--primary-30-base)" }} />
          </span>
          <h2
            className="text-base font-semibold mb-1"
            style={{ color: "var(--foreground-neutral-default)" }}
          >
            ยังไม่ได้เพิ่มสถานีบริการ
          </h2>
          <p
            className="text-sm mb-6 max-w-xs"
            style={{ color: "var(--foreground-neutral-lighter)" }}
          >
            เพิ่มสถานีบริการด้วยรหัสสถานีและรหัสเปิดใช้งานจากจดหมาย ธพ.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: "var(--button-background-primary-solid)",
              color: "var(--button-foreground-primary-on-solid)",
            }}
          >
            <PlusCircle size={15} />
            เพิ่มสถานีบริการ
          </Link>
        </div>
      )}

      {/* ── Active campaigns ── */}
      {activeCampaigns.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={15} style={{ color: "var(--foreground-warning-default)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
              คำขอข้อมูลพิเศษ
            </h2>
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold"
              style={{ background: "var(--foreground-warning-default)", color: "white" }}
            >
              {activeCampaigns.length}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {activeCampaigns.map((campaign) => {
              const cDays = daysUntil(campaign.dueDate);
              const cUrgency = urgency(cDays);
              const cStyles = URGENCY_STYLES[cUrgency];
              return (
                <div
                  key={campaign.campaignId}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--canvas-white)",
                    border: `1px solid ${cStyles.border}`,
                  }}
                >
                  {/* Campaign header */}
                  <div
                    className="px-5 py-3 flex items-start justify-between gap-4"
                    style={{
                      background: cStyles.bg,
                      borderBottom: `1px solid ${cStyles.border}`,
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--foreground-neutral-default)" }}>
                        {campaign.name}
                      </p>
                      {campaign.notificationMessage && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--foreground-neutral-lighter)" }}>
                          {campaign.notificationMessage}
                        </p>
                      )}
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0"
                      style={{ color: cStyles.color }}
                    >
                      <Timer size={11} />
                      {campaign.isPastDeadline
                        ? "หมดเวลาแล้ว"
                        : cDays === 0
                        ? "ครบกำหนดวันนี้"
                        : `เหลือ ${cDays} วัน`}
                    </span>
                  </div>

                  {/* Per-station rows */}
                  <div className="divide-y" style={{ borderColor: "var(--stroke-neutral-lightest)" }}>
                    {campaign.stations.map((s) => (
                      <div
                        key={s.stationId}
                        className="px-5 py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Fuel size={14} style={{ color: "var(--primary-30-base)", flexShrink: 0 }} />
                          <span className="text-sm truncate" style={{ color: "var(--foreground-neutral-default)" }}>
                            {s.stationName}
                          </span>
                          <StatusBadge status={s.reportStatus} />
                        </div>

                        {s.reportStatus === "submitted" && s.reportId && (
                          <Link
                            href={`/reports/${s.reportId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
                            style={{
                              background: "var(--background-positive-light)",
                              color: "var(--foreground-positive-default)",
                            }}
                          >
                            <FileText size={12} /> ดูรายงาน
                          </Link>
                        )}

                        {s.reportStatus === "draft" && s.reportId && (
                          <Link
                            href={`/reports/${s.reportId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
                            style={{
                              background: "var(--button-background-primary-solid)",
                              color: "var(--button-foreground-primary-on-solid)",
                            }}
                          >
                            <FileText size={12} /> แก้ไขร่าง
                          </Link>
                        )}

                        {s.reportStatus === "none" && (
                          <Link
                            href={`/reports/new?stationId=${s.stationId}&campaignId=${campaign.campaignId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
                            style={{
                              background: "var(--button-background-primary-solid)",
                              color: "var(--button-foreground-primary-on-solid)",
                            }}
                          >
                            <FilePlus size={12} /> กรอกข้อมูล
                          </Link>
                        )}

                        {s.reportStatus === "expired" && (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 opacity-50"
                            style={{ background: "var(--button-background-disabled)", color: "var(--button-foreground-disabled)" }}
                          >
                            <AlertTriangle size={12} /> หมดเวลา
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Regular period section ── */}
      {linkedStations.length > 0 && (
        <>
          {/* ── Deadline / period banner ── */}
          {currentPeriod && (
            <div
              className="rounded-2xl px-5 py-4 mb-5"
              style={{
                background: periodStyles.bg,
                border: `1.5px solid ${periodStyles.border}`,
              }}
            >
              {/* Top row: period label + deadline pill */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5"
                    style={{ color: "var(--foreground-neutral-lightest)" }}>
                    งวดรายงานปัจจุบัน
                  </p>
                  <p className="text-base font-semibold"
                    style={{ color: "var(--foreground-neutral-default)" }}>
                    {thaiDate(currentPeriod.startDate)} – {thaiDate(currentPeriod.endDate)}
                  </p>
                </div>
                <DeadlinePill dueDate={currentPeriod.dueDate} today={today} />
              </div>

              {/* Urgency sub-message when deadline is close */}
              {deadlineUrgency === "urgent" && pendingCount > 0 && (
                <p className="text-sm mt-2 font-medium" style={{ color: "var(--foreground-negative-default)" }}>
                  ⚠ ยังมี {pendingCount} สถานีที่ยังไม่ได้ส่งรายงาน — กรุณาส่งก่อนครบกำหนด
                </p>
              )}
              {deadlineUrgency === "soon" && pendingCount > 0 && (
                <p className="text-sm mt-2" style={{ color: "var(--foreground-warning-default)" }}>
                  มี {pendingCount} สถานีที่ยังค้างอยู่ กรุณาดำเนินการโดยเร็ว
                </p>
              )}
              {deadlineUrgency === "overdue" && (
                <p className="text-sm mt-2" style={{ color: "var(--foreground-negative-default)" }}>
                  หมดกำหนดส่งแล้ว รายงานที่ยังค้างอยู่ไม่สามารถส่งได้อีก
                </p>
              )}
            </div>
          )}

          {/* No period state */}
          {!currentPeriod && (
            <div
              className="rounded-xl px-4 py-3 mb-4 text-sm"
              style={{ background: "var(--neutral-96)", color: "var(--foreground-neutral-lighter)" }}
            >
              ยังไม่มีงวดการรายงานที่เปิดอยู่
            </div>
          )}

          {/* Station list */}
          {stationsWithStatus.length > 0 && (
            <div className="flex flex-col gap-3">
              {stationsWithStatus.map((s) => (
                <div
                  key={s.stationId}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--canvas-white)",
                    border: `1.5px solid ${
                      s.reportStatus === "submitted"
                        ? "var(--positive-80)"
                        : s.reportStatus === "draft"
                        ? "var(--warning-80)"
                        : "var(--stroke-neutral-lighter)"
                    }`,
                  }}
                >
                  {/* Station card body */}
                  <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">

                    {/* Left: icon + name + status */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span
                        className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                        style={{
                          background:
                            s.reportStatus === "submitted"
                              ? "var(--background-positive-light)"
                              : "var(--primary-95)",
                        }}
                      >
                        {s.reportStatus === "submitted"
                          ? <CheckCircle2 size={20} style={{ color: "var(--foreground-positive-default)" }} />
                          : <Fuel size={20} style={{ color: "var(--primary-30-base)" }} />
                        }
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--foreground-neutral-default)" }}
                          >
                            {s.name}
                          </p>
                          <StatusBadge status={s.reportStatus} />
                        </div>
                        {s.address && (
                          <p
                            className="text-xs mt-0.5 truncate"
                            style={{ color: "var(--foreground-neutral-lighter)" }}
                          >
                            {s.address}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: primary action */}
                    <div className="flex items-center gap-2 sm:shrink-0">
                      {s.reportStatus === "submitted" && s.reportId && (
                        <Link
                          href={`/reports/${s.reportId}`}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                          style={{
                            background: "var(--background-positive-light)",
                            color: "var(--foreground-positive-default)",
                            border: "1px solid var(--positive-80)",
                          }}
                        >
                          <FileText size={14} />
                          ดูรายงาน
                          <ChevronRight size={13} />
                        </Link>
                      )}

                      {s.reportStatus === "draft" && s.reportId && (
                        <Link
                          href={`/reports/${s.reportId}`}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                          style={{
                            background: "var(--button-background-primary-solid)",
                            color: "var(--button-foreground-primary-on-solid)",
                          }}
                        >
                          <FileText size={14} />
                          แก้ไขร่าง
                          <ChevronRight size={13} />
                        </Link>
                      )}

                      {s.reportStatus === "none" && currentPeriod && (
                        <Link
                          href={`/reports/new?stationId=${s.stationId}`}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                          style={{
                            background: "var(--button-background-primary-solid)",
                            color: "var(--button-foreground-primary-on-solid)",
                          }}
                        >
                          <FilePlus size={14} />
                          ส่งรายงาน
                          <ChevronRight size={13} />
                        </Link>
                      )}

                      {s.reportStatus === "expired" && (
                        <span
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium opacity-50"
                          style={{
                            background: "var(--button-background-disabled)",
                            color: "var(--button-foreground-disabled)",
                          }}
                        >
                          <AlertTriangle size={14} />
                          หมดเวลา
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Manage strip */}
                  <div
                    className="px-5 py-2.5 flex items-center gap-3"
                    style={{
                      background: "var(--neutral-98)",
                      borderTop: "1px solid var(--stroke-neutral-lightest)",
                    }}
                  >
                    <Link
                      href={`/stations/${s.stationId}/profile`}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80"
                      style={{
                        color: "var(--foreground-neutral-lighter)",
                        background: "var(--neutral-96)",
                      }}
                    >
                      <Settings size={11} />
                      จัดการสถานี
                    </Link>
                    <RemoveStationButton stationId={s.stationId} stationName={s.name} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
