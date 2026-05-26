import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  form014Lines,
  form016Lines,
  stations,
  userStationLinks,
  reportingPeriods,
  campaigns,
} from "@/db/schema";
import { secureRoute } from "@/lib/auth/secureRoute";
import { z } from "zod";

/* ── Helpers ──────────────────────────────────────────────────── */

/**
 * Verify the caller owns this report (via user_station_links).
 * Returns report metadata including the effective deadline — sourced from
 * the reporting period for regular reports, or the campaign for ad-hoc reports.
 */
async function verifyOwnership(userId: string, reportId: number) {
  const [row] = await db
    .select({
      reportId: reports.reportId,
      status: reports.status,
      campaignId: reports.campaignId,
      periodDueDate: reportingPeriods.dueDate,
      campaignDueDate: campaigns.dueDate,
      mode: reportingPeriods.mode,
    })
    .from(reports)
    .leftJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.periodId))
    .leftJoin(campaigns, eq(reports.campaignId, campaigns.campaignId))
    .innerJoin(stations, eq(reports.stationId, stations.stationId))
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(
      and(eq(reports.reportId, reportId), eq(userStationLinks.userId, userId))
    )
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    // Campaign due date takes precedence for campaign-only reports
    effectiveDueDate: row.periodDueDate ?? row.campaignDueDate ?? null,
  };
}

/* ── GET ──────────────────────────────────────────────────────── */

export const GET = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const reportId = parseInt(segments[segments.length - 1]);

  if (isNaN(reportId)) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
  }

  const row = await verifyOwnership(ctx.userId, reportId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [lines014, lines016] = await Promise.all([
    db.select().from(form014Lines).where(eq(form014Lines.reportId, reportId)),
    db.select().from(form016Lines).where(eq(form016Lines.reportId, reportId)),
  ]);

  return NextResponse.json({ lines014, lines016 });
});

/* ── PATCH ────────────────────────────────────────────────────── */

const lineSchema = z.object({
  fuelTypeId: z.string(),
  // volumeSoldLiters is NOT a user input — derived server-side as salesIn + salesOut
  taxRatePerLiter: z.string(),
  openingBalanceLiters: z.string(),
  receiptInLiters: z.string(),
  salesInProvinceLiters: z.string(),
  salesOutOfProvinceLiters: z.string(),
});

const patchSchema = z.object({
  lines: z.array(lineSchema),
});

export const PATCH = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const reportId = parseInt(segments[segments.length - 1]);

  if (isNaN(reportId)) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
  }

  const row = await verifyOwnership(ctx.userId, reportId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.status !== "draft") {
    return NextResponse.json(
      { error: "ส่งรายงานแล้ว ไม่สามารถแก้ไขได้" },
      { status: 409 }
    );
  }

  // ── Deadline check ────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  if (row.effectiveDueDate && row.effectiveDueDate < today) {
    return NextResponse.json(
      { error: "หมดเวลาส่งรายงานงวดนี้แล้ว ไม่สามารถแก้ไขได้" },
      { status: 410 }
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const { lines } = parsed.data;

  // Delete existing lines and reinsert (Neon-http: no transactions — sequential awaits)
  await db.delete(form014Lines).where(eq(form014Lines.reportId, reportId));
  await db.delete(form016Lines).where(eq(form016Lines.reportId, reportId));

  const lines014Values = lines.map((l) => {
    // Volume sold is derived: sales_in_province + sales_out_of_province
    const salesIn = parseFloat(l.salesInProvinceLiters) || 0;
    const salesOut = parseFloat(l.salesOutOfProvinceLiters) || 0;
    const vol = salesIn + salesOut;
    const rate = parseFloat(l.taxRatePerLiter) || 0;
    return {
      reportId,
      fuelTypeId: l.fuelTypeId,
      volumeSoldLiters: vol.toFixed(2),
      taxRatePerLiter: rate.toFixed(4),
      taxAmount: (vol * rate).toFixed(2),
    };
  });

  const lines016Values = lines.map((l) => ({
    reportId,
    fuelTypeId: l.fuelTypeId,
    openingBalanceLiters: (parseFloat(l.openingBalanceLiters) || 0).toFixed(2),
    receiptInLiters: (parseFloat(l.receiptInLiters) || 0).toFixed(2),
    salesInProvinceLiters: (parseFloat(l.salesInProvinceLiters) || 0).toFixed(2),
    salesOutOfProvinceLiters: (parseFloat(l.salesOutOfProvinceLiters) || 0).toFixed(2),
  }));

  if (lines014Values.length > 0) {
    await db.insert(form014Lines).values(lines014Values);
  }
  if (lines016Values.length > 0) {
    await db.insert(form016Lines).values(lines016Values);
  }

  // Touch updatedAt
  await db
    .update(reports)
    .set({ updatedAt: new Date() })
    .where(eq(reports.reportId, reportId));

  return NextResponse.json({ success: true });
});
