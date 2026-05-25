/**
 * Historical mock data — 12 months of submitted reports (May 2025 – Apr 2026)
 *
 * Run: npx tsx src/db/scripts/seed-historical.ts
 *
 * Safe to run multiple times (skips existing periods and reports).
 *
 * What it creates:
 *   • 12 reporting periods, one per calendar month
 *   • Submitted reports for every station in each period — except:
 *       Mar 2026: 1 station left missing (to demonstrate dashboard gap)
 *       Apr 2026: 2 stations left missing (most recent period, shows urgency)
 *   • Opening balance of each month = closing balance of previous month
 *   • Receipt = 1.08 × (salesIn + salesOut) so stock grows ~8 % monthly
 *   • Seasonal multiplier applied: higher Dec / Jan, lower May / Sep
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import {
  startOfMonth,
  endOfMonth,
  addDays,
  subMonths,
  format,
  getMonth,
} from "date-fns";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

/* ── Monthly seasonal demand multipliers (1 = base) ────────── */
// Index 0 = January, 11 = December
const SEASONAL: Record<number, number> = {
  0: 1.10, // Jan — post-New Year traffic
  1: 1.00,
  2: 1.02,
  3: 0.95,
  4: 0.92, // May — low season
  5: 0.95,
  6: 0.97,
  7: 0.95,
  8: 0.93, // Sep — low rainfall
  9: 0.98,
  10: 1.05, // Nov — high season starts
  11: 1.15, // Dec — holiday peak
};

/* ── Base monthly sales volumes per station size ─────────────── */
type FuelSales = { salesIn: number; salesOut: number };
type VolumeProfile = Record<string, FuelSales>;

// Large PTT urban station (BKK branches)
const LARGE: VolumeProfile = {
  BENZINE_95:  { salesIn: 37000, salesOut: 2800 },
  GASOHOL_E10: { salesIn: 70000, salesOut: 4800 },
  GASOHOL_E20: { salesIn: 21000, salesOut: 1400 },
  GASOHOL_E85: { salesIn:  8800, salesOut:  420 },
  DIESEL_B7:   { salesIn: 86000, salesOut: 8500 },
  DIESEL_B10:  { salesIn: 51000, salesOut: 4200 },
  DIESEL_B20:  { salesIn: 17000, salesOut: 1100 },
  LPG:         { salesIn:  7000, salesOut:  380 },
  NGV:         { salesIn:  4200, salesOut:  180 },
};

// Medium PTT provincial station (KKN branch)
const MEDIUM: VolumeProfile = {
  BENZINE_95:  { salesIn: 19000, salesOut: 1400 },
  GASOHOL_E10: { salesIn: 44000, salesOut: 2800 },
  GASOHOL_E20: { salesIn: 11500, salesOut:  750 },
  GASOHOL_E85: { salesIn:  4800, salesOut:  190 },
  DIESEL_B7:   { salesIn: 52000, salesOut: 4800 },
  DIESEL_B10:  { salesIn: 29000, salesOut: 2400 },
  DIESEL_B20:  { salesIn:  9800, salesOut:  720 },
  LPG:         { salesIn:  3400, salesOut:  180 },
  NGV:         { salesIn:  1900, salesOut:   90 },
};

// Small independent station (ปั๊มมือหมุน / ปั๊มสุภาพร)
const SMALL: VolumeProfile = {
  BENZINE_95:  { salesIn:  7500, salesOut:  280 },
  GASOHOL_E10: { salesIn: 17000, salesOut:  720 },
  GASOHOL_E20: { salesIn:  4800, salesOut:  180 },
  GASOHOL_E85: { salesIn:  1900, salesOut:   70 },
  DIESEL_B7:   { salesIn: 21000, salesOut: 1400 },
  DIESEL_B10:  { salesIn: 11500, salesOut:  740 },
  DIESEL_B20:  { salesIn:  3800, salesOut:  260 },
  LPG:         { salesIn:  1400, salesOut:   70 },
  NGV:         { salesIn:   750, salesOut:   35 },
};

/** Assign a volume profile by station branchCode / name heuristic */
function profileFor(branchCode: string | null, name: string): VolumeProfile {
  if (branchCode?.startsWith("BKK")) return LARGE;
  if (branchCode?.startsWith("KKN")) return MEDIUM;
  return SMALL;
}

/** Seasonal-adjusted + light jitter */
function adjusted(base: number, month: number, jitter = 0.06): number {
  const factor = SEASONAL[month] ?? 1;
  const noise = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.round(base * factor * noise);
}

/** Format a number with 2 decimal places (string for decimal columns) */
const d2 = (n: number) => n.toFixed(2);
const d4 = (n: number) => n.toFixed(4);

/* ── Main ────────────────────────────────────────────────────── */
async function seedHistorical() {
  console.log("📅  Seeding historical reports (May 2025 – Apr 2026)…\n");

  // ── Load reference data ──────────────────────────────────────
  const allStations = await db
    .select({
      stationId: schema.stations.stationId,
      name: schema.stations.name,
      branchCode: schema.stations.branchCode,
    })
    .from(schema.stations);

  if (allStations.length === 0) {
    console.error("❌  No stations found. Run seed.ts first.");
    process.exit(1);
  }

  const activeFuelTypes = await db
    .select()
    .from(schema.fuelTypes)
    .where(eq(schema.fuelTypes.isActive, true));

  // Load tax rates (use the first currently-effective rate per fuel type)
  const today = new Date().toISOString().split("T")[0];
  const allRates = await db
    .select({
      fuelTypeId: schema.taxRates.fuelTypeId,
      ratePerLiter: schema.taxRates.ratePerLiter,
    })
    .from(schema.taxRates)
    .where(
      and(
        lte(schema.taxRates.effectiveFrom, today),
        or(isNull(schema.taxRates.effectiveTo), eq(schema.taxRates.effectiveTo, "9999-12-31"))
      )
    );

  // First rate per fuel type (all provinces use the same rate)
  const rateMap = new Map<string, string>();
  for (const r of allRates) {
    if (!rateMap.has(r.fuelTypeId)) rateMap.set(r.fuelTypeId, r.ratePerLiter);
  }

  console.log(`  Stations: ${allStations.length}`);
  console.log(`  Fuel types: ${activeFuelTypes.length}`);
  console.log(`  Tax rates loaded: ${rateMap.size}\n`);

  // ── Build 12 historical periods ──────────────────────────────
  const refDate = new Date("2026-05-25");
  const periods: Array<{
    periodId: number;
    startDate: string;
    endDate: string;
    monthIndex: number; // 0-based JS month
  }> = [];

  for (let i = 12; i >= 1; i--) {
    const m = subMonths(refDate, i);
    const startDate = format(startOfMonth(m), "yyyy-MM-dd");
    const endDate = format(endOfMonth(m), "yyyy-MM-dd");
    const dueDate = format(addDays(endOfMonth(m), 10), "yyyy-MM-dd");
    const monthIndex = getMonth(m); // 0=Jan … 11=Dec

    // Upsert period (skip if startDate already exists)
    const existing = await db
      .select({ periodId: schema.reportingPeriods.periodId })
      .from(schema.reportingPeriods)
      .where(eq(schema.reportingPeriods.startDate, startDate))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  Period ${startDate} already exists (id=${existing[0].periodId}), skipping create.`);
      periods.push({ periodId: existing[0].periodId, startDate, endDate, monthIndex });
    } else {
      const [created] = await db
        .insert(schema.reportingPeriods)
        .values({ mode: "M", startDate, endDate, dueDate })
        .returning({ periodId: schema.reportingPeriods.periodId });
      console.log(`  ✓ Created period ${startDate} – ${endDate} (id=${created.periodId})`);
      periods.push({ periodId: created.periodId, startDate, endDate, monthIndex });
    }
  }

  console.log();

  // ── Which stations to skip per period (deliberate gaps) ──────
  // Periods are in chronological order (oldest first).
  // periods[10] = Mar 2026, periods[11] = Apr 2026
  const periodsLen = periods.length; // 12
  const skipRules: Array<{ periodIdx: number; stationIdx: number }> = [
    { periodIdx: periodsLen - 2, stationIdx: 3 }, // Mar 2026: skip station[3] (small KKN indie)
    { periodIdx: periodsLen - 1, stationIdx: 2 }, // Apr 2026: skip station[2] (PTT KKN)
    { periodIdx: periodsLen - 1, stationIdx: 4 }, // Apr 2026: skip station[4] (small CNX)
  ];
  function shouldSkip(periodIdx: number, stIdx: number): boolean {
    return skipRules.some((r) => r.periodIdx === periodIdx && r.stationIdx === stIdx);
  }

  // ── Carry-forward opening balances per station × fuel type ───
  // Key: `${stationId}-${fuelTypeId}` → closing balance from last period
  const closingBalance = new Map<string, number>();

  // ── Insert reports ────────────────────────────────────────────
  let reportsCreated = 0;
  let reportsSkipped = 0;

  for (let pi = 0; pi < periods.length; pi++) {
    const period = periods[pi];
    const submittedAt = new Date(`${period.endDate}T14:30:00+07:00`);

    for (let si = 0; si < allStations.length; si++) {
      const station = allStations[si];
      if (shouldSkip(pi, si)) {
        console.log(`  ⊘ Skipping station "${station.name}" for period ${period.startDate} (deliberate gap)`);
        continue;
      }

      // Check if report already exists
      const existing = await db
        .select({ reportId: schema.reports.reportId })
        .from(schema.reports)
        .where(
          and(
            eq(schema.reports.stationId, station.stationId),
            eq(schema.reports.periodId, period.periodId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        reportsSkipped++;
        continue;
      }

      // Create the report
      const [report] = await db
        .insert(schema.reports)
        .values({
          stationId: station.stationId,
          periodId: period.periodId,
          status: "submitted",
          modeAtSubmission: "M",
          submittedAt,
        })
        .returning({ reportId: schema.reports.reportId });

      const profile = profileFor(station.branchCode, station.name);
      const lines014: typeof schema.form014Lines.$inferInsert[] = [];
      const lines016: typeof schema.form016Lines.$inferInsert[] = [];

      for (const ft of activeFuelTypes) {
        const base = profile[ft.fuelTypeId];
        if (!base) continue; // fuel type not in profile (unlikely — all 9 are covered)

        const salesIn  = adjusted(base.salesIn,  period.monthIndex);
        const salesOut = adjusted(base.salesOut, period.monthIndex);
        const totalSales = salesIn + salesOut;

        // Receipt = 1.08× total sales (keeps ~8 % buffer in stock)
        const receiptIn = Math.round(totalSales * 1.08);

        // Opening balance from prior period's closing (or seed value)
        const balKey = `${station.stationId}-${ft.fuelTypeId}`;
        const opening = closingBalance.get(balKey) ?? Math.round(totalSales * 0.15);

        const closing = opening + receiptIn - salesIn - salesOut;
        closingBalance.set(balKey, closing);

        const rate = parseFloat(rateMap.get(ft.fuelTypeId) ?? "0");
        const volumeSold = totalSales;
        const taxAmount = parseFloat((volumeSold * rate).toFixed(2));

        lines016.push({
          reportId: report.reportId,
          fuelTypeId: ft.fuelTypeId,
          openingBalanceLiters: d2(opening),
          receiptInLiters: d2(receiptIn),
          salesInProvinceLiters: d2(salesIn),
          salesOutOfProvinceLiters: d2(salesOut),
        });

        lines014.push({
          reportId: report.reportId,
          fuelTypeId: ft.fuelTypeId,
          volumeSoldLiters: d2(volumeSold),
          taxRatePerLiter: d4(rate),
          taxAmount: d2(taxAmount),
        });
      }

      if (lines016.length > 0) await db.insert(schema.form016Lines).values(lines016);
      if (lines014.length > 0) await db.insert(schema.form014Lines).values(lines014);

      reportsCreated++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n✅  Done!`);
  console.log(`   Periods:  ${periods.length} (12 months)`);
  console.log(`   Reports created:  ${reportsCreated}`);
  console.log(`   Reports skipped (already existed): ${reportsSkipped}`);
  console.log(`\nDeliberate gaps (for dashboard demo):`);
  console.log(`   Mar 2026 — 1 station missing`);
  console.log(`   Apr 2026 — 2 stations missing`);
  console.log(`   May 2026 — current period (use station OTPs to submit)`);
}

seedHistorical().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
