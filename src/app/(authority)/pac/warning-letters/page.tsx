import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  userProvinceLinks,
  stations,
  reports,
  reportingPeriods,
  provinces,
} from "@/db/schema";
import { PrintLettersClient } from "./PrintLettersClient";

/* ── Server page — data fetching ────────────────────────────── */

export default async function WarningLettersPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; stationIds?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  // ── Province link ─────────────────────────────────────────────
  const [link] = await db
    .select({ provinceCode: userProvinceLinks.provinceCode })
    .from(userProvinceLinks)
    .where(eq(userProvinceLinks.userId, userId))
    .limit(1);

  if (!link) redirect("/pac/onboarding");
  const { provinceCode } = link;

  // ── Province info ─────────────────────────────────────────────
  const [province] = await db
    .select({ nameTh: provinces.nameTh, region: provinces.region })
    .from(provinces)
    .where(eq(provinces.provinceCode, provinceCode))
    .limit(1);

  const provinceName = province?.nameTh ?? provinceCode;

  // ── Period ────────────────────────────────────────────────────
  const { periodId: periodIdStr, stationIds: stationIdsStr } = await searchParams;
  const periodId = periodIdStr ? parseInt(periodIdStr) : NaN;

  const period = isNaN(periodId)
    ? await db
        .select()
        .from(reportingPeriods)
        .orderBy(desc(reportingPeriods.startDate))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.periodId, periodId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

  if (!period) redirect("/pac");

  // ── Stations in province ──────────────────────────────────────
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

  const stationIds = allStations.map((s) => s.stationId);

  // ── Reports for period ─────────────────────────────────────────
  const periodReports =
    stationIds.length > 0
      ? await db
          .select({ stationId: reports.stationId, status: reports.status })
          .from(reports)
          .where(
            and(
              eq(reports.periodId, period.periodId),
              inArray(reports.stationId, stationIds)
            )
          )
      : [];

  const reportStatusMap = new Map(periodReports.map((r) => [r.stationId, r.status]));

  // ── Filter to non-submitting stations (or specific stationIds from QS) ──
  const filterIds = stationIdsStr
    ? stationIdsStr.split(",").map(Number).filter(Boolean)
    : null;

  const nonCompliant = allStations.filter((s) => {
    const status = reportStatusMap.get(s.stationId);
    const isNonCompliant = status !== "submitted";
    return filterIds ? filterIds.includes(s.stationId) && isNonCompliant : isNonCompliant;
  });

  if (nonCompliant.length === 0) redirect(`/pac?periodId=${period.periodId}`);

  const issueDate = new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "buddhist",
  } as Intl.DateTimeFormatOptions);

  const periodLabel = `${period.startDate} – ${period.endDate}`;

  return (
    <PrintLettersClient
      provinceName={provinceName}
      provinceCode={provinceCode}
      period={{ ...period }}
      periodLabel={periodLabel}
      issueDate={issueDate}
      stations={nonCompliant}
      backHref={`/pac?periodId=${period.periodId}`}
    />
  );
}
