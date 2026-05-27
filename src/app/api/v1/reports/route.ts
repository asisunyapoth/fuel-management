import { NextResponse } from "next/server";
import { eq, and, desc, lte } from "drizzle-orm";
import { db } from "@/db";
import { reports, stations, reportingPeriods } from "@/db/schema";
import { requireApiKey } from "@/lib/auth/requireApiKey";
import { withIdempotency } from "@/lib/api/idempotency";
import { z } from "zod";

const createSchema = z.object({
  /**
   * Internal station ID (stations.station_id).
   * The calling key's licenseNo must match the station's dealer_license_no,
   * unless the key is unscoped (licenseNo = null → full access).
   */
  stationId:  z.number().int().positive(),
  /** Specific period ID. Defaults to the latest period whose startDate ≤ today. */
  periodId:   z.number().int().positive().optional(),
  /** 01-6 lines to write immediately (optional; can also PATCH after creation). */
  lines: z
    .array(
      z.object({
        fuelTypeId:                z.string().min(1),
        taxRatePerLiter:           z.string(),
        openingBalanceLiters:      z.string(),
        receiptInLiters:           z.string(),
        salesInProvinceLiters:     z.string(),
        salesOutOfProvinceLiters:  z.string(),
      })
    )
    .optional(),
});

/**
 * POST /api/v1/reports
 *
 * Creates a new draft report (or returns an existing draft for the same
 * station + period). 01-6 lines can be supplied in the request body or via
 * a subsequent PUT.
 *
 * Authentication: Authorization: Bearer <api_key>
 * Idempotency:    Idempotency-Key: <uuid>  (recommended)
 *
 * Request body:
 * {
 *   "stationId": 42,
 *   "periodId": 7,           // optional; defaults to current period
 *   "lines": [ ... ]         // optional; same shape as PUT body
 * }
 *
 * Response 201 { reportId }  — new draft created
 * Response 200 { reportId }  — existing draft returned
 * Response 401               — missing or invalid API key
 * Response 403               — station not within API key's license scope
 * Response 404               — station or period not found
 * Response 422               — validation error
 */
export const POST = requireApiKey(async (ctx, req) => {
  const idemKey  = req.headers.get("idempotency-key");
  const endpoint = "POST /api/v1/reports";

  return withIdempotency(idemKey, endpoint, ctx.apiKeyId, async () => {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { stationId, periodId, lines } = parsed.data;

    // ── Ownership check via dealer_licenses ─────────────────────
    const [station] = await db
      .select({
        stationId:       stations.stationId,
        provinceCode:    stations.provinceCode,
        dealerLicenseNo: stations.dealerLicenseNo,
      })
      .from(stations)
      .where(eq(stations.stationId, stationId))
      .limit(1);

    if (!station) {
      return NextResponse.json({ error: "Station not found" }, { status: 404 });
    }

    // Scoped key: must match the station's license
    if (ctx.licenseNo && station.dealerLicenseNo !== ctx.licenseNo) {
      return NextResponse.json(
        { error: "Forbidden", detail: "Station is not within this API key's license scope" },
        { status: 403 }
      );
    }

    // ── Resolve period ───────────────────────────────────────────
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
        return NextResponse.json(
          { error: "No open reporting period found" },
          { status: 404 }
        );
      }
    }

    // ── Find or create draft ─────────────────────────────────────
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
      // If lines are provided, apply them to the existing draft via shared logic
      if (lines?.length) {
        await upsertLines(existing.reportId, lines);
      }
      return NextResponse.json({ reportId: existing.reportId });
    }

    const [created] = await db
      .insert(reports)
      .values({ stationId, periodId: period.periodId })
      .returning({ reportId: reports.reportId });

    if (lines?.length) {
      await upsertLines(created.reportId, lines);
    }

    return NextResponse.json({ reportId: created.reportId }, { status: 201 });
  });
});

/* ── Shared helper: upsert 01-6 + derive 01-4 ─────────────────── */

type LineInput = {
  fuelTypeId: string;
  taxRatePerLiter: string;
  openingBalanceLiters: string;
  receiptInLiters: string;
  salesInProvinceLiters: string;
  salesOutOfProvinceLiters: string;
};

export async function upsertLines(reportId: number, lines: LineInput[]) {
  const { form014Lines, form016Lines } = await import("@/db/schema");

  await db.delete(form014Lines).where(eq(form014Lines.reportId, reportId));
  await db.delete(form016Lines).where(eq(form016Lines.reportId, reportId));

  const vals014 = lines.map((l) => {
    const salesIn  = parseFloat(l.salesInProvinceLiters)     || 0;
    const salesOut = parseFloat(l.salesOutOfProvinceLiters)  || 0;
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
    fuelTypeId:                l.fuelTypeId,
    openingBalanceLiters:      (parseFloat(l.openingBalanceLiters)     || 0).toFixed(2),
    receiptInLiters:           (parseFloat(l.receiptInLiters)          || 0).toFixed(2),
    salesInProvinceLiters:     (parseFloat(l.salesInProvinceLiters)    || 0).toFixed(2),
    salesOutOfProvinceLiters:  (parseFloat(l.salesOutOfProvinceLiters) || 0).toFixed(2),
  }));

  if (vals014.length > 0) await db.insert(form014Lines).values(vals014);
  if (vals016.length > 0) await db.insert(form016Lines).values(vals016);

  await db
    .update(reports)
    .set({ updatedAt: new Date() })
    .where(eq(reports.reportId, reportId));
}
