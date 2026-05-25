import { pgTable, varchar, serial, timestamp, unique, integer } from "drizzle-orm/pg-core";
import { dealerLicenses } from "./dealers";
import { provinces } from "./master";
import { stations } from "./stations";

// Maps a Clerk user to one or more dealer licenses (used by Brand HQ / v1 API path).
export const userLicenseLinks = pgTable(
  "user_license_links",
  {
    id: serial("id").primaryKey(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).notNull(),
    licenseNo: varchar("license_no", { length: 30 })
      .notNull()
      .references(() => dealerLicenses.licenseNo),
    role: varchar("role", { length: 30 }).notNull().default("dealer_admin"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.clerkUserId, t.licenseNo)]
);

// Maps a Clerk user (station manager) to one or more stations via OTP.
// This is the primary onboarding path for individual station managers.
export const userStationLinks = pgTable(
  "user_station_links",
  {
    id: serial("id").primaryKey(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).notNull(),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.stationId),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.clerkUserId, t.stationId)]
);

// Maps a Clerk user to exactly one province (อบจ. officer onboarding).
export const userProvinceLinks = pgTable("user_province_links", {
  id: serial("id").primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 128 }).notNull().unique(),
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
