/**
 * update-tax-rates.ts
 *
 * Replaces all tax_rate rows with the correct อบจ. rates (10% of national excise).
 * Safe to run multiple times — deletes only rows with effectiveFrom = '2025-01-01'
 * before re-inserting, so historical rates are preserved.
 *
 * Run: npx tsx src/db/scripts/update-tax-rates.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// ── Province codes (all seeded provinces) ─────────────────────
const PROVINCE_CODES = [
  "10", "11", "20", "30", "40", "50", "56", "76", "83", "90",
];

// ── อบจ. rates: 10% of national สรรพสามิต excise rates ────────
const RATES: Array<{ fuelTypeId: string; rate: string; note: string }> = [
  { fuelTypeId: "BENZINE_95", rate: "0.7500", note: "เบนซิน 95" },
  { fuelTypeId: "GASOHOL_E10", rate: "0.6750", note: "แก๊สโซฮอล์ 95 E10 (excise = 7.50 × 0.90)" },
  { fuelTypeId: "GASOHOL_E20", rate: "0.6000", note: "แก๊สโซฮอล์ E20 (excise = 7.50 × 0.80, interpolated)" },
  { fuelTypeId: "GASOHOL_E85", rate: "0.1125", note: "แก๊สโซฮอล์ E85 (excise = 7.50 × 0.15)" },
  { fuelTypeId: "DIESEL_B7", rate: "0.7440", note: "ดีเซล B7" },
  { fuelTypeId: "DIESEL_B10", rate: "0.7440", note: "ดีเซล B10" },
  { fuelTypeId: "DIESEL_B20", rate: "0.7440", note: "ดีเซล B20" },
  { fuelTypeId: "LPG", rate: "1.6600", note: "LPG (rate TBD)" },
  { fuelTypeId: "NGV", rate: "1.6600", note: "NGV (rate TBD)" },
];

const EFFECTIVE_FROM = "2025-01-01";

async function main() {
  console.log("🔄  Updating อบจ. tax rates in RFDRS database…\n");

  // ── 1. Delete rows with this effectiveFrom across all provinces ─
  const deleted = await db
    .delete(schema.taxRates)
    .where(eq(schema.taxRates.effectiveFrom, EFFECTIVE_FROM))
    .returning({ id: schema.taxRates.id });

  console.log(`  Deleted ${deleted.length} existing rows (effectiveFrom = ${EFFECTIVE_FROM})`);

  // ── 2. Insert fresh rows ───────────────────────────────────────
  const rows = PROVINCE_CODES.flatMap((provinceCode) =>
    RATES.map((r) => ({
      provinceCode,
      fuelTypeId: r.fuelTypeId,
      ratePerLiter: r.rate,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null as string | null,
    }))
  );

  await db.insert(schema.taxRates).values(rows);

  console.log(`  Inserted ${rows.length} rows (${PROVINCE_CODES.length} provinces × ${RATES.length} fuel types)`);

  // ── 3. Summary ─────────────────────────────────────────────────
  console.log("\n  Rates applied:");
  for (const r of RATES) {
    const bar = r.rate === "0.0000" ? "—" : `${r.rate} บาท/ลิตร`;
    console.log(`    ${r.fuelTypeId.padEnd(12)}  ${bar.padStart(16)}   ${r.note}`);
  }

  console.log("\n✅  Done!\n");
}

main().catch((err) => {
  console.error("❌  Failed:", err);
  process.exit(1);
});
