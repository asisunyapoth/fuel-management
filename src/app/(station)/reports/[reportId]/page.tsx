import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq, and, lte, gte, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  stations,
  userStationLinks,
  reportingPeriods,
  campaigns,
  fuelTypes,
  taxRates,
  form014Lines,
  form016Lines,
} from "@/db/schema";
import { ReportForm } from "@/components/forms/ReportForm";
import type { ReportFormState, FuelTypeInfo, CampaignInfo } from "@/components/forms/types";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const { reportId: reportIdStr } = await params;
  const reportId = parseInt(reportIdStr);
  if (isNaN(reportId)) redirect("/dashboard");

  // ── Load report with ownership check (via user_station_links) ─
  // LEFT JOIN on both reportingPeriods and campaigns — one will be null.
  const [row] = await db
    .select({
      reportId: reports.reportId,
      status: reports.status,
      stationId: reports.stationId,
      periodId: reports.periodId,
      campaignId: reports.campaignId,
      stationName: stations.name,
      stationAddress: stations.address,
      provinceCode: stations.provinceCode,
      // Period (null for campaign-only reports)
      periodMode: reportingPeriods.mode,
      periodStart: reportingPeriods.startDate,
      periodEnd: reportingPeriods.endDate,
      periodDue: reportingPeriods.dueDate,
      // Campaign (null for regular period reports)
      campaignName: campaigns.name,
      campaignDue: campaigns.dueDate,
      campaignMessage: campaigns.notificationMessage,
      campaignRequiredFields: campaigns.requiredFields,
    })
    .from(reports)
    .innerJoin(stations, eq(reports.stationId, stations.stationId))
    .leftJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.periodId))
    .leftJoin(campaigns, eq(reports.campaignId, campaigns.campaignId))
    .innerJoin(userStationLinks, eq(stations.stationId, userStationLinks.stationId))
    .where(
      and(eq(reports.reportId, reportId), eq(userStationLinks.userId, userId))
    )
    .limit(1);

  if (!row) redirect("/dashboard");

  // ── Load active fuel types ────────────────────────────────────
  const allFuelTypes = await db
    .select()
    .from(fuelTypes)
    .where(eq(fuelTypes.isActive, true));

  // ── Load tax rates for this province (currently effective) ───
  const today = new Date().toISOString().split("T")[0];
  const provinceRates = await db
    .select({ fuelTypeId: taxRates.fuelTypeId, ratePerLiter: taxRates.ratePerLiter })
    .from(taxRates)
    .where(
      and(
        eq(taxRates.provinceCode, row.provinceCode),
        lte(taxRates.effectiveFrom, today),
        or(isNull(taxRates.effectiveTo), gte(taxRates.effectiveTo, today))
      )
    );

  const rateMap = new Map(provinceRates.map((r) => [r.fuelTypeId, r.ratePerLiter]));

  const fuelTypesWithRates: FuelTypeInfo[] = allFuelTypes.map((ft) => ({
    fuelTypeId: ft.fuelTypeId,
    nameTh: ft.nameTh,
    nameEn: ft.nameEn,
    taxRatePerLiter: rateMap.get(ft.fuelTypeId) ?? null,
  }));

  // ── Load existing lines (016 is primary; 014 for tax rate) ───
  const [existingLines014, existingLines016] = await Promise.all([
    db.select().from(form014Lines).where(eq(form014Lines.reportId, reportId)),
    db.select().from(form016Lines).where(eq(form016Lines.reportId, reportId)),
  ]);

  const map014 = new Map(existingLines014.map((l) => [l.fuelTypeId, l]));
  const map016 = new Map(existingLines016.map((l) => [l.fuelTypeId, l]));

  // ── Build initial form state (no volumeSoldLiters — derived) ─
  const initialFormState: ReportFormState = {};
  for (const ft of allFuelTypes) {
    const l4 = map014.get(ft.fuelTypeId);
    const l6 = map016.get(ft.fuelTypeId);
    const defaultRate = rateMap.get(ft.fuelTypeId) ?? "0.0000";
    initialFormState[ft.fuelTypeId] = {
      taxRatePerLiter: l4?.taxRatePerLiter ?? defaultRate,
      openingBalanceLiters: l6?.openingBalanceLiters ?? "",
      receiptInLiters: l6?.receiptInLiters ?? "",
      salesInProvinceLiters: l6?.salesInProvinceLiters ?? "",
      salesOutOfProvinceLiters: l6?.salesOutOfProvinceLiters ?? "",
    };
  }

  // ── Build period and campaign props ──────────────────────────
  const periodProp =
    row.periodId && row.periodMode && row.periodStart && row.periodEnd && row.periodDue
      ? {
          periodId: row.periodId,
          mode: row.periodMode,
          startDate: row.periodStart,
          endDate: row.periodEnd,
          dueDate: row.periodDue,
        }
      : undefined;

  const campaignProp: CampaignInfo | undefined =
    row.campaignId && row.campaignName && row.campaignDue
      ? {
          campaignId: row.campaignId,
          name: row.campaignName,
          dueDate: row.campaignDue,
          notificationMessage: row.campaignMessage ?? null,
          requiredFields: (row.campaignRequiredFields as string[] | null) ?? null,
        }
      : undefined;

  return (
    <ReportForm
      reportId={reportId}
      report={{
        reportId: row.reportId,
        status: row.status,
        stationId: row.stationId,
      }}
      station={{
        name: row.stationName,
        address: row.stationAddress,
        provinceCode: row.provinceCode,
      }}
      period={periodProp}
      campaign={campaignProp}
      fuelTypes={fuelTypesWithRates}
      initialFormState={initialFormState}
    />
  );
}
