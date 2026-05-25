import { pgTable, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const dealerLicenses = pgTable("dealer_licenses", {
  licenseNo: varchar("license_no", { length: 30 }).primaryKey(),
  section: varchar("section", { length: 2 }).notNull(), // '7' or '11'
  companyName: varchar("company_name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});
