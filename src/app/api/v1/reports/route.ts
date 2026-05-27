import { NextResponse } from "next/server";
import { eq, and, desc, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  stations,
  reportingPeriods,
  userStationLinks,
  userLicenseLinks,
  form014Lines,
  form016Lines,
} from "@/db/schema";
import { requirePersonalToken } from "@/lib/auth/secureRoute";
import { z } from "zod";

const createSchema = z.object({
  /**
   * Internal station ID (stations.station_id).
   * The calling user must own this station via user_station_links OR
   * be linked to the station's dealer license via user_license_links.
   */
  stationId: z.number().int().positive(),
  /** Specific period ID. Defaults to the latest period whose startDate ≤ today. */
  periodId:  z.number().int().positive().optional(),
  /** 01-6 lines to write immediately (optional; can also PUT after creation). */
  lines: z
    .array(
      z.object({
        fuelTypeId:               z.string().min(1),
        taxRatePerLiter:          z.string(),
        openingBalanceLiters:     z.string(),
        receiptInLiters:          z.string(),
        salesInProvinceLiters:    z.string(),
        salesOutOfProvinceLiters: z.string(),
      })
    )
    .optional(),
});

/**
 * POST /api/v1/reports
 *
 * Creates a new draft report (or returns an existing draft for the same
 * station + period). Optional 01-6 lines can be submitted inline.
 *
 * Authentication:
 *   Authorization: Bearer <personal_token>
 *   The personal_token is obtained after DGA Digital ID sign-in
 *   (GET /api/internal/auth/token) and validated live against DGA on every call.
 *
 * Ownership check (either is sufficient):
 *   • user_station_links: user is a direct station manager
 *   • user_license_links: user is linked to the station's dealer license (Brand HQ)
 *
 * Response 201 { reportId }  — new draft created
 * Response 200 { reportId }  — existing draft returned
 * Response 401               — missing or expired personal_token
 * Response 403               — user is not authorised to submit for this station
 * Response 404               — station or period not found
 * Response 422               — validation error
 */
export const POST = requirePersonalToken(async (ctx, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { stationId, periodId, lines } = parsed.data;

  // ── Ownership check ─────────────────────────────────────────────
  const owned = await checkStationAccess(ctx.userId, stationId);
  if (!owned) {
    // 403 not 404 — caller knows the stationId exists (they sent it)
    return NextResponse.json(
      { error: "Forbidden", detail: "Not authorised to submit reports for this station" },
      { status: 403 }
    );
  }

  // ── Resolve period ─────────────────────────────────────────────
  let period;
  if (periodId) {
    [period] = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.periodId, periodId))
      .limit(1);
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }
  } else {
    const today = new Date().toISOString().split("T")[0];
    [period] = await db
      .select()
      .from(reportingPeriods)
      .where(lte(reportingPeriods.startDate, today))
      .orderBy(desc(reportingPeriods.startDate), desc(reportingPeriods.periodId))
      .limit(1);
    if (!period) {
      return NextResponse.json({ error: "No open reporting period found" }, { status: 404 });
    }
  }

  // ── Find or create draft ────────────────────────────────────────
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

  const reportId = existing?.reportId ?? (await db
    .insert(reports)
    .values({ stationId, periodId: period.periodId })
    .returning({ reportId: reports.reportId })
    .then(([r]) => r.reportId));

  if (lines?.length) {
    await upsertLines(reportId, lines);
  }

  return NextResponse.json(
    { reportId },
    { status: existing ? 200 : 201 }
  );
});

/* ── Station access helper ──────────────────────────────────────── */

/**
 * Returns the station row if the user can access it, null otherwise.
 * Checks both direct station links and license-level links (Brand HQ).
 */
export async function checkStationAccess(
  userId: string,
  stationId: number
): Promise<{ stationId: number; dealerLicenseNo: string | null } | null> {
  // Path 1: direct user_station_links
  const [direct] = await db
    .select({ stationId: stations.stationId, dealerLicenseNo: stations.dealerLicenseNo })
    .from(stations)
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(and(eq(stations.stationId, stationId), eq(userStationLinks.userId, userId)))
    .limit(1);

  if (direct) return direct;

  // Path 2: user_license_links → dealer license covers this station
  const [licensed] = await db
    .select({ stationId: stations.stationId, dealerLicenseNo: stations.dealerLicenseNo })
    .from(stations)
    .innerJoin(userLicenseLinks, eq(stations.dealerLicenseNo, userLicenseLinks.licenseNo))
    .where(and(eq(stations.stationId, stationId), eq(userLicenseLinks.userId, userId)))
    .limit(1);

  return licensed ?? null;
}

/* ── Shared helper: upsert 01-6 + derive 01-4 ──────────────────── */

export type LineInput = {
  fuelTypeId:               string;
  taxRatePerLiter:          string;
  openingBalanceLiters:     string;
  receiptInLiters:          string;
  salesInProvinceLiters:    string;
  salesOutOfProvinceLiters: string;
};

export async function upsertLines(reportId: number, lines: LineInput[]) {
  await db.delete(form014Lines).where(eq(form014Lines.reportId, reportId));
  await db.delete(form016Lines).where(eq(form016Lines.reportId, reportId));

  const vals014 = lines.map((l) => {
    const salesIn  = parseFloat(l.salesInProvinceLiters)    || 0;
    const salesOut = parseFloat(l.salesOutOfProvinceLiters) || 0;
    const vol  = salesIn + salesOut;
    const rate = parseFloat(l.taxRatePerLiter) || 0;
    return {
      reportId,
      fuelTypeId:       l.fuelTypeId,
      volumeSoldLiters: vol.toFixed(2),
      taxRatePerLiter:  rate.toFixed(4),
      taxAmount:        (vol * rate).toFixed(2),
    };
  });

  const vals016 = lines.map((l) => ({
    reportId,
    fuelTypeId:               l.fuelTypeId,
    openingBalanceLiters:     (parseFloat(l.openingBalanceLiters)     || 0).toFixed(2),
    receiptInLiters:          (parseFloat(l.receiptInLiters)          || 0).toFixed(2),
    salesInProvinceLiters:    (parseFloat(l.salesInProvinceLiters)    || 0).toFixed(2),
    salesOutOfProvinceLiters: (parseFloat(l.salesOutOfProvinceLiters) || 0).toFixed(2),
  }));

  if (vals014.length > 0) await db.insert(form014Lines).values(vals014);
  if (vals016.length > 0) await db.insert(form016Lines).values(vals016);

  await db
    .update(reports)
    .set({ updatedAt: new Date() })
    .where(eq(reports.reportId, reportId));
}
