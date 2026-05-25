import {
  pgTable,
  serial,
  varchar,
  text,
  date,
  timestamp,
  integer,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { stations } from "./stations";

/**
 * Ad-hoc data collection campaigns issued by ธพ. officials.
 * Campaigns are parallel to regular reporting periods — they target a specific
 * subset of stations and may request only a subset of the standard form fields.
 *
 * Lifecycle: draft → (publish) → active → (close/expire) → closed
 */
export const campaigns = pgTable("campaigns", {
  campaignId: serial("campaign_id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),

  // JSON array of FuelLineState field keys that are required, or null = all fields required.
  // Example: ["openingBalanceLiters", "receiptInLiters"] for a stock-only snapshot.
  requiredFields: jsonb("required_fields"),

  // Message shown to station operators on the dashboard.
  notificationMessage: text("notification_message"),

  // clerk_user_id of the ธพ./admin who created the campaign.
  createdBy: varchar("created_by", { length: 128 }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // Set when the campaign is published and station list is materialised.
  publishedAt: timestamp("published_at", { withTimezone: true }),

  // 'draft' | 'active' | 'closed'
  status: varchar("status", { length: 20 }).notNull().default("draft"),
});

/**
 * Materialised list of stations targeted by each campaign.
 * Populated once at publish time from a targetScope filter — immutable afterwards.
 * This gives an auditable record of exactly which stations were asked to report.
 */
export const campaignStations = pgTable(
  "campaign_stations",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaigns.campaignId, { onDelete: "cascade" }),
    stationId: integer("station_id")
      .notNull()
      .references(() => stations.stationId),
  },
  (t) => [unique().on(t.campaignId, t.stationId)]
);
