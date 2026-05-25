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

export const POST = secureRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const reportId = parseInt(segments[segments.length - 2]);

  if (isNaN(reportId)) {
    return NextResponse.json({ error: "Invalid reportId" }, { status: 400 });
  }

  // ── Ownership + metadata (LEFT JOINs for nullable period/campaign) ──
  const [reportRow] = await db
    .select({
      reportId: reports.reportId,
      status: reports.status,
      stationId: reports.stationId,
      provinceCode: stations.provinceCode,
      // Period fields (null for campaign-only reports)
      periodMode: reportingPeriods.mode,
      periodDueDate: reportingPeriods.dueDate,
      // Campaign fields (null for regular period reports)
      campaignDueDate: campaigns.dueDate,
      campaignRequiredFields: campaigns.requiredFields,
    })
    .from(reports)
    .innerJoin(stations, eq(reports.stationId, stations.stationId))
    .leftJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.periodId))
    .leftJoin(campaigns, eq(reports.campaignId, campaigns.campaignId))
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(
      and(eq(reports.reportId, reportId), eq(userStationLinks.clerkUserId, ctx.userId))
    )
    .limit(1);

  if (!reportRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (reportRow.status !== "draft") {
    return NextResponse.json({ error: "ส่งรายงานแล้ว" }, { status: 409 });
  }

  // ── Deadline check (effective due date from period or campaign) ──
  const effectiveDueDate = reportRow.periodDueDate ?? reportRow.campaignDueDate;
  const today = new Date().toISOString().split("T")[0];
  if (effectiveDueDate && effectiveDueDate < today) {
    return NextResponse.json(
      { error: `หมดเวลาส่งรายงานแล้ว (กำหนดส่ง ${effectiveDueDate})` },
      { status: 410 }
    );
  }

  // ── Load lines ────────────────────────────────────────────────
  const [lines014, lines016] = await Promise.all([
    db.select().from(form014Lines).where(eq(form014Lines.reportId, reportId)),
    db.select().from(form016Lines).where(eq(form016Lines.reportId, reportId)),
  ]);

  // ── L2: field-level validation ────────────────────────────────
  // For campaign reports with requiredFields, empty optional fields are treated as
  // valid 0s — the PATCH handler already stored them as 0.00, so validation passes.
  const errors: string[] = [];

  for (const l of lines016) {
    if (parseFloat(l.openingBalanceLiters) < 0)
      errors.push(`${l.fuelTypeId}: ยอดยกมาต้องไม่ติดลบ`);
    if (parseFloat(l.receiptInLiters) < 0)
      errors.push(`${l.fuelTypeId}: รับเข้าต้องไม่ติดลบ`);
    if (parseFloat(l.salesInProvinceLiters) < 0)
      errors.push(`${l.fuelTypeId}: จำหน่ายในจังหวัดต้องไม่ติดลบ`);
    if (parseFloat(l.salesOutOfProvinceLiters) < 0)
      errors.push(`${l.fuelTypeId}: จำหน่ายนอกจังหวัดต้องไม่ติดลบ`);
    const closing =
      parseFloat(l.openingBalanceLiters) +
      parseFloat(l.receiptInLiters) -
      parseFloat(l.salesInProvinceLiters) -
      parseFloat(l.salesOutOfProvinceLiters);
    if (closing < 0)
      errors.push(`${l.fuelTypeId}: สต็อกคงเหลือติดลบ กรุณาตรวจสอบข้อมูล`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 422 });
  }

  // ── L3: cross-form reconciliation (warning only) ──────────────
  const warnings: string[] = [];
  const map014 = new Map(lines014.map((l) => [l.fuelTypeId, l]));

  for (const l6 of lines016) {
    const l4 = map014.get(l6.fuelTypeId);
    if (!l4) continue;
    const sold = parseFloat(l4.volumeSoldLiters);
    const distributed =
      parseFloat(l6.salesInProvinceLiters) + parseFloat(l6.salesOutOfProvinceLiters);
    if (sold > 0 && Math.abs(sold - distributed) / sold > 0.001) {
      warnings.push(
        `${l6.fuelTypeId}: ตรวจพบความไม่สอดคล้องระหว่าง 01-4 และ 01-6 กรุณาบันทึกใหม่`
      );
    }
  }

  // ── Submit ────────────────────────────────────────────────────
  const now = new Date();
  await db
    .update(reports)
    .set({
      status: "submitted",
      // Use period mode if available; null for campaign-only reports
      modeAtSubmission: reportRow.periodMode ?? null,
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(reports.reportId, reportId));

  return NextResponse.json({ success: true, warnings });
});
