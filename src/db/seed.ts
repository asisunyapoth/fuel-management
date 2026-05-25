/**
 * Seed script — RFDRS FQMS Phase 1
 * Run: npx tsx src/db/seed.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import bcrypt from "bcryptjs";
import { addDays, format, startOfMonth, endOfMonth } from "date-fns";
import { eq } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// ── Provinces ──────────────────────────────────────────────────
const PROVINCES = [
  { provinceCode: "10", nameTh: "กรุงเทพมหานคร", region: "กลาง" },
  { provinceCode: "40", nameTh: "ขอนแก่น", region: "ตะวันออกเฉียงเหนือ" },
  { provinceCode: "50", nameTh: "เชียงใหม่", region: "เหนือ" },
  { provinceCode: "90", nameTh: "สงขลา", region: "ใต้" },
  { provinceCode: "20", nameTh: "ชลบุรี", region: "ตะวันออก" },
  { provinceCode: "30", nameTh: "นครราชสีมา", region: "ตะวันออกเฉียงเหนือ" },
  { provinceCode: "76", nameTh: "เพชรบุรี", region: "กลาง" },
  { provinceCode: "56", nameTh: "พะเยา", region: "เหนือ" },
  { provinceCode: "83", nameTh: "ภูเก็ต", region: "ใต้" },
  { provinceCode: "11", nameTh: "สมุทรปราการ", region: "กลาง" },
];

// ── Fuel Types ─────────────────────────────────────────────────
const FUEL_TYPES = [
  { fuelTypeId: "BENZINE_95",  nameTh: "เบนซิน 95",         nameEn: "Benzine 95" },
  { fuelTypeId: "GASOHOL_E10", nameTh: "แก๊สโซฮอล์ 95 E10", nameEn: "Gasohol 95 E10" },
  { fuelTypeId: "GASOHOL_E20", nameTh: "แก๊สโซฮอล์ E20",    nameEn: "Gasohol E20" },
  { fuelTypeId: "GASOHOL_E85", nameTh: "แก๊สโซฮอล์ E85",    nameEn: "Gasohol E85" },
  { fuelTypeId: "DIESEL_B7",   nameTh: "ดีเซล B7",           nameEn: "Diesel B7" },
  { fuelTypeId: "DIESEL_B10",  nameTh: "ดีเซล B10",          nameEn: "Diesel B10" },
  { fuelTypeId: "DIESEL_B20",  nameTh: "ดีเซล B20",          nameEn: "Diesel B20" },
  { fuelTypeId: "LPG",         nameTh: "ก๊าซ LPG",           nameEn: "LPG" },
  { fuelTypeId: "NGV",         nameTh: "ก๊าซ NGV",           nameEn: "NGV" },
];

/**
 * อบจ. tax rates = 10% of national excise (สรรพสามิต) rates.
 * Source: กรมสรรพสามิต rate schedule.
 *   BENZINE_95  excise = 7.50  → อบจ. 10% = 0.75  (stored here as the full excise rate)
 *
 * NOTE: rate_per_liter stored here IS the อบจ. rate charged per litre in each province.
 * All provinces share the same national excise base, so rates are uniform.
 */
/**
 * อบจ. rates = 10% of national สรรพสามิต excise rates.
 * Uniform across all provinces.
 */
const TAX_RATE_MAP: Record<string, string> = {
  BENZINE_95:  "0.7500",   // เบนซิน 95         (excise 7.50 × 10%)
  GASOHOL_E10: "0.6750",   // แก๊สโซฮอล์ 95 E10 (excise 6.75 × 10%)
  GASOHOL_E20: "0.6000",   // แก๊สโซฮอล์ E20   (excise 6.00 × 10%, interpolated)
  GASOHOL_E85: "0.1125",   // แก๊สโซฮอล์ E85   (excise 1.125 × 10%)
  DIESEL_B7:   "0.7440",   // ดีเซล B7          (excise 7.44 × 10%)
  DIESEL_B10:  "0.7440",   // ดีเซล B10         (excise 7.44 × 10%)
  DIESEL_B20:  "0.7440",   // ดีเซล B20         (excise 7.44 × 10%)
  LPG:         "1.6600",   // LPG
  NGV:         "1.6600",   // NGV
};

// ── OTP codes (plain text — bcrypt-hashed on insert) ──────────
// Province OTPs
const PROVINCE_OTPS: Record<string, string> = {
  "10": "101010",
  "40": "404040",
  "50": "505050",
};

// Station OTPs (stationId → otp) — assigned after insert
const STATION_OTPS = ["111111", "222222", "333333", "444444", "555555"];

async function seed() {
  console.log("🌱 Seeding RFDRS test data...\n");

  // ── 1. Provinces ──────────────────────────────────────────────
  console.log("  Inserting provinces...");
  await db.insert(schema.provinces).values(PROVINCES).onConflictDoNothing();

  // ── 2. Fuel Types ─────────────────────────────────────────────
  console.log("  Inserting fuel types...");
  await db.insert(schema.fuelTypes).values(FUEL_TYPES).onConflictDoNothing();

  // ── 3. Tax Rates ──────────────────────────────────────────────
  // Rates are uniform across all provinces (national excise base).
  // effectiveTo is null → currently in effect.
  console.log("  Inserting/updating tax rates...");
  const taxRateData = PROVINCES.flatMap((p) =>
    FUEL_TYPES.map((f) => ({
      provinceCode: p.provinceCode,
      fuelTypeId: f.fuelTypeId,
      ratePerLiter: TAX_RATE_MAP[f.fuelTypeId] ?? "0.0000",
      effectiveFrom: "2025-01-01",
      effectiveTo: null as string | null,
    }))
  );
  // Insert new; existing rows (different effectiveFrom) are kept — no conflict key.
  await db.insert(schema.taxRates).values(taxRateData).onConflictDoNothing();

  // ── 4. Dealer Licenses ────────────────────────────────────────
  console.log("  Inserting dealer licenses...");
  await db
    .insert(schema.dealerLicenses)
    .values([
      {
        licenseNo: "M07-PTT001",
        section: "7",
        companyName: "บริษัท ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)",
        isActive: true,
      },
      {
        licenseNo: "M11-KKN001",
        section: "11",
        companyName: "ร้านจำหน่ายน้ำมันสมศักดิ์",
        isActive: true,
      },
      {
        licenseNo: "M11-CNX001",
        section: "11",
        companyName: "ปั๊มน้ำมันสุภาพร เชียงใหม่",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // ── 5. Stations ───────────────────────────────────────────────
  console.log("  Inserting stations...");
  const stationValues = [
    {
      dealerLicenseNo: "M07-PTT001",
      branchCode: "BKK-001",
      name: "ปตท. สาขาพระราม 4",
      address: "1234 ถ.พระราม 4 แขวงสีลม",
      provinceCode: "10",
      phone: "02-123-4567",
    },
    {
      dealerLicenseNo: "M07-PTT001",
      branchCode: "BKK-002",
      name: "ปตท. สาขาลาดพร้าว",
      address: "567 ถ.ลาดพร้าว แขวงจอมพล",
      provinceCode: "10",
      phone: "02-234-5678",
    },
    {
      dealerLicenseNo: "M07-PTT001",
      branchCode: "KKN-001",
      name: "ปตท. สาขาขอนแก่น",
      address: "89 ถ.มิตรภาพ อ.เมือง",
      provinceCode: "40",
      phone: "043-123-456",
    },
    {
      dealerLicenseNo: "M11-KKN001",
      branchCode: null,
      name: "ปั๊มมือหมุนสมศักดิ์",
      address: "12/3 ม.5 ต.บ้านทุ่ม อ.เมือง จ.ขอนแก่น",
      provinceCode: "40",
      phone: "086-111-2222",
    },
    {
      dealerLicenseNo: "M11-CNX001",
      branchCode: null,
      name: "ปั๊มน้ำมันสุภาพร",
      address: "45 ม.2 ต.หนองหอย อ.เมือง จ.เชียงใหม่",
      provinceCode: "50",
      phone: "081-333-4444",
    },
  ];

  // Insert one by one and collect IDs (onConflictDoNothing skips existing)
  const insertedStations: { stationId: number; name: string }[] = [];
  for (const s of stationValues) {
    const [row] = await db
      .insert(schema.stations)
      .values(s)
      .onConflictDoNothing()
      .returning({ stationId: schema.stations.stationId, name: schema.stations.name });
    if (row) insertedStations.push(row);
  }

  // If all stations already existed, fetch them
  if (insertedStations.length === 0) {
    const existing = await db
      .select({ stationId: schema.stations.stationId, name: schema.stations.name })
      .from(schema.stations);
    insertedStations.push(...existing);
  }

  // ── 6. Activation Codes ───────────────────────────────────────
  console.log("  Inserting activation codes...");
  const ninetyDaysFromNow = addDays(new Date(), 90);

  // Province OTPs
  for (const [provinceCode, otp] of Object.entries(PROVINCE_OTPS)) {
    const hash = await bcrypt.hash(otp, 10);
    await db
      .insert(schema.activationCodes)
      .values({
        targetType: "province",
        targetId: provinceCode,
        codeHash: hash,
        expiresAt: ninetyDaysFromNow,
        usedAt: null,
      })
      .onConflictDoNothing();
  }

  // Station OTPs (one per station, in insertion order)
  for (let i = 0; i < insertedStations.length; i++) {
    const station = insertedStations[i];
    const otp = STATION_OTPS[i] ?? `${(i + 1) * 111111}`;
    const hash = await bcrypt.hash(otp, 10);
    await db
      .insert(schema.activationCodes)
      .values({
        targetType: "station",
        targetId: String(station.stationId),
        codeHash: hash,
        expiresAt: ninetyDaysFromNow,
        usedAt: null,
      })
      .onConflictDoNothing();
    console.log(`    Station ${station.stationId} (${station.name}) OTP: ${otp}`);
  }

  // ── 7. Reporting Period ───────────────────────────────────────
  // Skip if a period already exists for this calendar month to avoid duplicates.
  console.log("  Inserting current reporting period (skip if already exists)...");
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const dueDate = addDays(monthEnd, 5); // 5 days after period end

  const startDateStr = format(monthStart, "yyyy-MM-dd");
  const existingPeriod = await db
    .select({ periodId: schema.reportingPeriods.periodId })
    .from(schema.reportingPeriods)
    .where(eq(schema.reportingPeriods.startDate, startDateStr))
    .limit(1);

  if (existingPeriod.length === 0) {
    await db.insert(schema.reportingPeriods).values({
      mode: "M",
      startDate: startDateStr,
      endDate: format(monthEnd, "yyyy-MM-dd"),
      dueDate: format(dueDate, "yyyy-MM-dd"),
    });
    console.log(`    Created period ${startDateStr} – ${format(monthEnd, "yyyy-MM-dd")}`);
  } else {
    console.log(`    Period for ${startDateStr} already exists (id=${existingPeriod[0].periodId}), skipping.`);
  }

  // ── Done ──────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!\n");
  console.log("─────────────────────────────────────────────────────");
  console.log("Station OTPs (use these on the onboarding page):");
  console.log("─────────────────────────────────────────────────────");
  for (let i = 0; i < insertedStations.length; i++) {
    const s = insertedStations[i];
    console.log(`  Station ${s.stationId.toString().padStart(3)} | ${STATION_OTPS[i]} | ${s.name}`);
  }
  console.log("\nProvince OTPs:");
  for (const [code, otp] of Object.entries(PROVINCE_OTPS)) {
    console.log(`  Province ${code}   OTP: ${otp}`);
  }
  console.log("─────────────────────────────────────────────────────\n");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
