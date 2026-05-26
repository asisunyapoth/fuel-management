import { pgTable, varchar, serial, timestamp, unique, integer, text } from "drizzle-orm/pg-core";
import { dealerLicenses } from "./dealers";
import { provinces } from "./master";
import { stations } from "./stations";
import { authUsers } from "./auth";

// Maps an Auth.js user to one or more dealer licenses (used by Brand HQ / v1 API path).
export const userLicenseLinks = pgTable(
  "user_license_links",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    licenseNo: varchar("license_no", { length: 30 })
      .notNull()
      .references(() => dealerLicenses.licenseNo),
    role: varchar("role", { length: 30 }).notNull().default("dealer_admin"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.licenseNo)]
);

// Maps an Auth.js user (station manager) to one or more stations via OTP.
// This is the primary onboarding path for individual station managers.
export const userStationLinks = pgTable(
  "user_station_links",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.stationId),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.stationId)]
);

// Maps an Auth.js user to exactly one province (อบจ. officer onboarding).
export const userProvinceLinks = pgTable("user_province_links", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }).unique(),
  provinceCode: varchar("province_code", { length: 2 })
    .notNull()
    .references(() => provinces.provinceCode),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

// OTP activation codes for station, province, and (legacy) license onboarding.
// target_type: 'station' | 'province' | 'license'
// target_id: stationId (as string) | provinceCode | licenseNo
export const activationCodes = pgTable("activation_codes", {
  id: serial("id").primaryKey(),
  targetType: varchar("target_type", { length: 10 }).notNull(),
  targetId: varchar("target_id", { length: 30 }).notNull(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
