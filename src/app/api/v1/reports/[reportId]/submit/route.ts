import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  form014Lines,
  form016Lines,
  stations,
  reportingPeriods,
} from "@/db/schema";
import { requirePersonalToken } from "@/lib/auth/secureRoute";
import { checkStationAccess } from "../../route";

/**
 * POST /api/v1/reports/[reportId]/submit
 *
 * Finalises a draft report: runs L2 field validation then marks it submitted.
 * Returns warnings from L3 cross-form reconciliation (informational, not blocking).
 *
 * Authentication: Authorization: Bearer <personal_token>
 *
 * Response 200 { success: true, warnings: string[] }
 * Response 404               — report not found or user not authorised
 * Response 409               — report already submitted
 * Response 410               — deadline has passed
 * Response 422               — L2 field validation failed
 */
export const POST = requirePersonalToken(async (ctx, req) => {
  const segments = new URL(req.url).pathname.split("/");
  // URL: /api/v1/reports/[reportId]/submit → segments[-2] is reportId
  const reportId = parseInt(segments[segments.length - 2]);
  if (isNaN(reportId)) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
  }

  // ── Ownership + metadata ─────────────────────────────────────
  const [reportRow] = await db
    .select({
      reportId:      reports.reportId,
      status:        reports.status,
      stationId:     reports.stationId,
      periodMode:    reportingPeriods.mode,
      periodDueDate: reportingPeriods.dueDate,
    })
    .from(reports)
    .leftJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.periodId))
    .where(eq(reports.reportId, reportId))
    .limit(1);

  if (!reportRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access check: direct station link OR license link
  const access = await checkStationAccess(ctx.userId, reportRow.stationId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (reportRow.status !== "draft") {
    return NextResponse.json({ error: "Report already submitted" }, { status: 409 });
  }

  // ── Deadline check ────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  if (reportRow.periodDueDate && reportRow.periodDueDate < today) {
    return NextResponse.json(
      { error: `Deadline has passed (due ${reportRow.periodDueDate})` },
      { status: 410 }
    );
  }

  // ── Load lines ────────────────────────────────────────────────
  const [lines014, lines016] = await Promise.all([
    db.select().from(form014Lines).where(eq(form014Lines.reportId, reportId)),
    db.select().from(form016Lines).where(eq(form016Lines.reportId, reportId)),
  ]);

  // ── L2: field-level validation ────────────────────────────────
  const errors: string[] = [];

  for (const l of lines016) {
    if (parseFloat(l.openingBalanceLiters)     < 0) errors.push(`${l.fuelTypeId}: opening balance must not be negative`);
    if (parseFloat(l.receiptInLiters)          < 0) errors.push(`${l.fuelTypeId}: receipt must not be negative`);
    if (parseFloat(l.salesInProvinceLiters)    < 0) errors.push(`${l.fuelTypeId}: in-province sales must not be negative`);
    if (parseFloat(l.salesOutOfProvinceLiters) < 0) errors.push(`${l.fuelTypeId}: out-of-province sales must not be negative`);

    const closing =
      parseFloat(l.openingBalanceLiters) +
      parseFloat(l.receiptInLiters) -
      parseFloat(l.salesInProvinceLiters) -
      parseFloat(l.salesOutOfProvinceLiters);

    if (closing < 0) {
      errors.push(`${l.fuelTypeId}: closing stock is negative — please verify figures`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", errors }, { status: 422 });
  }

  // ── L3: cross-form reconciliation (warning only) ──────────────
  const warnings: string[] = [];
  const map014 = new Map(lines014.map((l) => [l.fuelTypeId, l]));

  for (const l6 of lines016) {
    const l4 = map014.get(l6.fuelTypeId);
    if (!l4) continue;
    const sold        = parseFloat(l4.volumeSoldLiters);
    const distributed = parseFloat(l6.salesInProvinceLiters) + parseFloat(l6.salesOutOfProvinceLiters);
    if (sold > 0 && Math.abs(sold - distributed) / sold > 0.001) {
      warnings.push(`${l6.fuelTypeId}: discrepancy between form 01-4 and 01-6 — please review`);
    }
  }

  // ── Submit ────────────────────────────────────────────────────
  const now = new Date();
  await db
    .update(reports)
    .set({
      status:          "submitted",
      modeAtSubmission: reportRow.periodMode ?? null,
      submittedAt:     now,
      updatedAt:       now,
    })
    .where(eq(reports.reportId, reportId));

  return NextResponse.json({ success: true, warnings });
});
