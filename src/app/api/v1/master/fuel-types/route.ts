import { NextResponse } from "next/server";
import { db } from "@/db";
import { fuelTypes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * GET /api/v1/master/fuel-types
 *
 * Returns all active fuel types.
 * Public — no authentication required.
 *
 * Response 200:
 * {
 *   "fuelTypes": [
 *     { "fuelTypeId": "diesel", "nameTh": "ดีเซล", "nameEn": "Diesel" },
 *     ...
 *   ]
 * }
 */
export async function GET() {
  const rows = await db
    .select({
      fuelTypeId: fuelTypes.fuelTypeId,
      nameTh:     fuelTypes.nameTh,
      nameEn:     fuelTypes.nameEn,
    })
    .from(fuelTypes)
    .where(eq(fuelTypes.isActive, true))
    .orderBy(asc(fuelTypes.fuelTypeId));

  return NextResponse.json(
    { fuelTypes: rows },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    }
  );
}
