import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, and, desc, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  stations,
  userStationLinks,
  reportingPeriods,
  campaigns,
  campaignStations,
} from "@/db/schema";

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ stationId?: string; campaignId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { stationId: stationIdStr, campaignId: campaignIdStr } = await searchParams;
  const stationId = parseInt(stationIdStr ?? "");
  if (isNaN(stationId)) redirect("/dashboard");

  // ── Verify station belongs to user (via user_station_links) ──
  const [owned] = await db
    .select({ stationId: stations.stationId })
    .from(stations)
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(
      and(
        eq(stations.stationId, stationId),
        eq(userStationLinks.clerkUserId, userId)
      )
    )
    .limit(1);

  if (!owned) redirect("/dashboard");

  // ── Campaign path ─────────────────────────────────────────────
  const campaignId = campaignIdStr ? parseInt(campaignIdStr) : NaN;

  if (!isNaN(campaignId)) {
    // Verify station is targeted by this active campaign
    const [inScope] = await db
      .select({ campaignId: campaignStations.campaignId })
      .from(campaignStations)
      .innerJoin(campaigns, eq(campaignStations.campaignId, campaigns.campaignId))
      .where(
        and(
          eq(campaignStations.campaignId, campaignId),
          eq(campaignStations.stationId, stationId),
          eq(campaigns.status, "active")
        )
      )
      .limit(1);

    if (!inScope) redirect("/dashboard");

    // Find existing campaign draft or create one
    const [existing] = await db
      .select({ reportId: reports.reportId })
      .from(reports)
      .where(
        and(
          eq(reports.stationId, stationId),
          eq(reports.campaignId, campaignId),
          eq(reports.status, "draft")
        )
      )
      .limit(1);

    if (existing) redirect(`/reports/${existing.reportId}`);

    const [created] = await db
      .insert(reports)
      .values({ stationId, campaignId, periodId: null })
      .returning({ reportId: reports.reportId });

    redirect(`/reports/${created.reportId}`);
  }

  const today = new Date().toISOString().split("T")[0];

  // ── Regular period path ───────────────────────────────────────
  // "Current period" = latest period whose startDate ≤ today.
  // Must match the same logic as dashboard/page.tsx to avoid period mismatch.
  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(lte(reportingPeriods.startDate, today))
    .orderBy(desc(reportingPeriods.startDate), desc(reportingPeriods.periodId))
    .limit(1);

  if (!period) redirect("/dashboard?error=no-period");

  const [existing] = await db
    .select({ reportId: reports.reportId })
    .from(reports)
    .where(
      and(
        eq(reports.stationId, stationId),
        eq(reports.periodId, period.periodId),
        eq(reports.status, "draft")
      )
    )
    .limit(1);

  if (existing) redirect(`/reports/${existing.reportId}`);

  const [created] = await db
    .insert(reports)
    .values({ stationId, periodId: period.periodId })
    .returning({ reportId: reports.reportId });

  redirect(`/reports/${created.reportId}`);
}
