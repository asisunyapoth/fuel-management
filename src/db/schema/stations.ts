import { pgTable, varchar, serial, text, decimal, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dealerLicenses } from "./dealers";
import { provinces } from "./master";

export const stations = pgTable("stations", {
  stationId: serial("station_id").primaryKey(),
  dealerLicenseNo: varchar("dealer_license_no", { length: 30 })
    .notNull()
    .references(() => dealerLicenses.licenseNo),
  branchCode: varchar("branch_code", { length: 20 }),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  provinceCode: varchar("province_code", { length: 2 })
    .notNull()
    .references(() => provinces.provinceCode),
  tambonCode: varchar("tambon_code", { length: 10 }),

  // ── Station profile fields ──
  phone: varchar("phone", { length: 20 }),
  lat: decimal("lat", { precision: 10, scale: 6 }),
  lon: decimal("lon", { precision: 11, scale: 6 }),
  /** Array of { url, name, uploadedAt } objects */
  photos: jsonb("photos")
    .$type<Array<{ url: string; name: string; uploadedAt: string }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});
