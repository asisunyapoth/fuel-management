import { NextResponse } from "next/server";
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
import { secureRoute } from "@/lib/auth/secureRoute";
import { z } from "zod";

const createSchema = z.union([
  // Regular period report
  z.object({
    stationId: z.number().int().positive(),
    periodId: z.number().int().positive().optional(),
  }),
  // Campaign report
  z.object({
    stationId: z.number().int().positive(),
    campaignId: z.number().int().positive(),
  }),
]);

/**
 * POST /api/internal/reports
 * Find an existing draft or create a new one for a given:
 *   - station + period  (regular reporting), or
 *   - station + campaign (ad-hoc campaign)
 * Returns { reportId }.
 */
export const POST = secureRoute(async (ctx, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  const data = parsed.data;
  const { stationId } = data;
  const campaignId = "campaignId" in data ? data.campaignId : undefined;
  const periodId = "periodId" in data ? data.periodId : undefined;

  // ── Ownership check via user_station_links ────────────────────
  const [owned] = await db
    .select({ stationId: stations.stationId, provinceCode: stations.provinceCode })
    .from(stations)
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(
      and(
        eq(stations.stationId, stationId),
        eq(userStationLinks.userId, ctx.userId)
      )
    )
    .limit(1);

  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Campaign path ─────────────────────────────────────────────
  if (campaignId !== undefined) {
    // Verify station is targeted by this campaign
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

    if (!inScope) {
      return NextResponse.json(
        { error: "สถานีนี้ไม่ได้อยู่ในขอบเขตของคำขอข้อมูลพิเศษนี้" },
        { status: 404 }
      );
    }

    // Find or create campaign draft
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

    if (existing) {
      return NextResponse.json({ reportId: existing.reportId });
    }

    const [created] = await db
      .insert(reports)
      .values({ stationId, campaignId, periodId: null })
      .returning({ reportId: reports.reportId });

    return NextResponse.json({ reportId: created.reportId }, { status: 201 });
  }

  // ── Regular period path ───────────────────────────────────────
  let period;
  if (periodId) {
    [period] = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.periodId, periodId))
      .limit(1);
  } else {
    // "Current period" = latest period whose startDate ≤ today.
    // Mirrors dashboard/page.tsx so all three agree on which period is "current".
    const todayStr = new Date().toISOString().split("T")[0];
    [period] = await db
      .select()
      .from(reportingPeriods)
      .where(lte(reportingPeriods.startDate, todayStr))
      .orderBy(desc(reportingPeriods.startDate), desc(reportingPeriods.periodId))
      .limit(1);
  }

  if (!period) {
    return NextResponse.json(
      { error: "ไม่มีงวดการรายงานที่เปิดอยู่ กรุณาติดต่อ ธพ." },
      { status: 404 }
    );
  }

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

  if (existing) {
    return NextResponse.json({ reportId: existing.reportId });
  }

  const [created] = await db
    .insert(reports)
    .values({ stationId, periodId: period.periodId })
    .returning({ reportId: reports.reportId });

  return NextResponse.json({ reportId: created.reportId }, { status: 201 });
});
