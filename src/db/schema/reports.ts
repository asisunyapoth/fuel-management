import { pgTable, serial, integer, varchar, timestamp, decimal } from "drizzle-orm/pg-core";
import { stations } from "./stations";
import { reportingPeriods } from "./periods";
import { fuelTypes } from "./master";
import { campaigns } from "./campaigns";

export const reports = pgTable("reports", {
  reportId: serial("report_id").primaryKey(),
  stationId: integer("station_id")
    .notNull()
    .references(() => stations.stationId),
  // Nullable — null for campaign-only reports that fall outside a regular period.
  periodId: integer("period_id")
    .references(() => reportingPeriods.periodId),
  // Nullable — null for regular period reports.
  // At least one of periodId / campaignId must be non-null (enforced at application layer).
  campaignId: integer("campaign_id")
    .references(() => campaigns.campaignId),
  // 'draft' | 'submitted' | 'flagged'
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  modeAtSubmission: varchar("mode_at_submission", { length: 1 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// อบจ. 01-4: sales volume and local tax per fuel type
export const form014Lines = pgTable("form_014_lines", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.reportId, { onDelete: "cascade" }),
  fuelTypeId: varchar("fuel_type_id", { length: 20 })
    .notNull()
    .references(() => fuelTypes.fuelTypeId),
  volumeSoldLiters: decimal("volume_sold_liters", { precision: 12, scale: 2 }).notNull(),
  taxRatePerLiter: decimal("tax_rate_per_liter", { precision: 8, scale: 4 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 14, scale: 2 }).notNull(),
});

// อบจ. 01-6: inventory flow per fuel type
// closing_balance = (opening_balance + receipt_in) - (sales_in_province + sales_out_of_province)
export const form016Lines = pgTable("form_016_lines", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.reportId, { onDelete: "cascade" }),
  fuelTypeId: varchar("fuel_type_id", { length: 20 })
    .notNull()
    .references(() => fuelTypes.fuelTypeId),
  openingBalanceLiters: decimal("opening_balance_liters", { precision: 12, scale: 2 }).notNull(),
  receiptInLiters: decimal("receipt_in_liters", { precision: 12, scale: 2 }).notNull(),
  salesInProvinceLiters: decimal("sales_in_province_liters", { precision: 12, scale: 2 }).notNull(),
  salesOutOfProvinceLiters: decimal("sales_out_of_province_liters", { precision: 12, scale: 2 }).notNull(),
});
