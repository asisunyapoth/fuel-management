import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  form014Lines,
  form016Lines,
  stations,
  reportingPeriods,
} from "@/db/schema";
import { requireApiKey } from "@/lib/auth/requireApiKey";
import { withIdempotency } from "@/lib/api/idempotency";
import { upsertLines } from "../route";
import { z } from "zod";

/* ── Helpers ──────────────────────────────────────────────────── */

async function verifyReportAccess(
  reportId: number,
  licenseNo: string | null
): Promise<{
  reportId: number;
  status: string;
  stationId: number;
  periodDueDate: string | null;
} | null> {
  const [row] = await db
    .select({
      reportId:      reports.reportId,
      status:        reports.status,
      stationId:     reports.stationId,
      dealerLicense: stations.dealerLicenseNo,
      periodDueDate: reportingPeriods.dueDate,
    })
    .from(reports)
    .innerJoin(stations, eq(reports.stationId, stations.stationId))
    .leftJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.periodId))
    .where(eq(reports.reportId, reportId))
    .limit(1);

  if (!row) return null;

  // Scope check: key must match or be unscoped
  if (licenseNo && row.dealerLicense !== licenseNo) return null;

  return {
    reportId:     row.reportId,
    status:       row.status,
    stationId:    row.stationId,
    periodDueDate: row.periodDueDate ?? null,
  };
}

/* ── GET /api/v1/reports/[reportId] ──────────────────────────── */

/**
 * Returns full report data including 01-4 and 01-6 lines.
 *
 * Response 200:
 * {
 *   "reportId": 123,
 *   "status": "draft",
 *   "lines014": [...],
 *   "lines016": [...]
 * }
 */
export const GET = requireApiKey(async (ctx, req: Request) => {
  const segments = new URL(req.url).pathname.split("/");
  const reportId = parseInt(segments[segments.length - 1]);
  if (isNaN(reportId)) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
  }

  const row = await verifyReportAccess(reportId, ctx.licenseNo);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [lines014, lines016] = await Promise.all([
    db.select().from(form014Lines).where(eq(form014Lines.reportId, reportId)),
    db.select().from(form016Lines).where(eq(form016Lines.reportId, reportId)),
  ]);

  return NextResponse.json({
    reportId: row.reportId,
    status:   row.status,
    lines014,
    lines016,
  });
});

/* ── PUT /api/v1/reports/[reportId] ──────────────────────────── */

const putSchema = z.object({
  lines: z.array(
    z.object({
      fuelTypeId:               z.string().min(1),
      taxRatePerLiter:          z.string(),
      openingBalanceLiters:     z.string(),
      receiptInLiters:          z.string(),
      salesInProvinceLiters:    z.string(),
      salesOutOfProvinceLiters: z.string(),
    })
  ),
});

/**
 * Replace all 01-6 lines for a draft report. Derives and stores 01-4 lines.
 *
 * Authentication: Authorization: Bearer <api_key>
 * Idempotency:    Idempotency-Key: <uuid>  (recommended on retries)
 *
 * Response 200 { success: true }
 * Response 409               — report already submitted
 * Response 410               — deadline has passed
 * Response 422               — validation error
 */
export const PUT = requireApiKey(async (ctx, req: Request) => {
  const segments = new URL(req.url).pathname.split("/");
  const reportId = parseInt(segments[segments.length - 1]);
  if (isNaN(reportId)) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
  }

  const idemKey  = req.headers.get("idempotency-key");
  const endpoint = `PUT /api/v1/reports/${reportId}`;

  return withIdempotency(idemKey, endpoint, ctx.apiKeyId, async () => {
    const row = await verifyReportAccess(reportId, ctx.licenseNo);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (row.status !== "draft") {
      return NextResponse.json({ error: "Report already submitted" }, { status: 409 });
    }

    const today = new Date().toISOString().split("T")[0];
    if (row.periodDueDate && row.periodDueDate < today) {
      return NextResponse.json(
        { error: "Deadline has passed", dueDate: row.periodDueDate },
        { status: 410 }
      );
    }

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    await upsertLines(reportId, parsed.data.lines);
    return NextResponse.json({ success: true });
  });
});
