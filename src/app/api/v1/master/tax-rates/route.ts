import { NextResponse } from "next/server";
import { db } from "@/db";
import { taxRates, fuelTypes, provinces } from "@/db/schema";
import { eq, and, isNull, lte, gte, or } from "drizzle-orm";

/**
 * GET /api/v1/master/tax-rates
 *
 * Returns currently effective tax rates per province × fuel type.
 * Optionally filtered by `?provinceCode=<code>`.
 * Public — no authentication required.
 *
 * Query params:
 *   provinceCode  (optional)  Filter to a single province (2-digit code, e.g. "10")
 *   date          (optional)  Effective date to query; defaults to today (YYYY-MM-DD)
 *
 * Response 200:
 * {
 *   "effectiveDate": "2026-05-27",
 *   "taxRates": [
 *     {
 *       "id": 1,
 *       "provinceCode": "10",
 *       "provinceNameTh": "กรุงเทพมหานคร",
 *       "fuelTypeId": "diesel",
 *       "fuelNameTh": "ดีเซล",
 *       "ratePerLiter": "5.3700",
 *       "effectiveFrom": "2024-01-01",
 *       "effectiveTo": null
 *     },
 *     ...
 *   ]
 * }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filterProvince = searchParams.get("provinceCode");
  const dateParam = searchParams.get("date");

  const effectiveDate = dateParam ?? new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      id:              taxRates.id,
      provinceCode:    taxRates.provinceCode,
      provinceNameTh:  provinces.nameTh,
      fuelTypeId:      taxRates.fuelTypeId,
      fuelNameTh:      fuelTypes.nameTh,
      ratePerLiter:    taxRates.ratePerLiter,
      effectiveFrom:   taxRates.effectiveFrom,
      effectiveTo:     taxRates.effectiveTo,
    })
    .from(taxRates)
    .innerJoin(provinces, eq(taxRates.provinceCode, provinces.provinceCode))
    .innerJoin(fuelTypes, eq(taxRates.fuelTypeId, fuelTypes.fuelTypeId))
    .where(
      and(
        // Must have started on or before effectiveDate
        lte(taxRates.effectiveFrom, effectiveDate),
        // Must not have ended before effectiveDate (effectiveTo is null or >= today)
        or(isNull(taxRates.effectiveTo), gte(taxRates.effectiveTo, effectiveDate)),
        // Optional province filter
        filterProvince ? eq(taxRates.provinceCode, filterProvince) : undefined,
      )
    )
    .orderBy(taxRates.provinceCode, taxRates.fuelTypeId);

  return NextResponse.json(
    { effectiveDate, taxRates: rows },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    }
  );
}
