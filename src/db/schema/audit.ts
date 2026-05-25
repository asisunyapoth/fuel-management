import { pgTable, serial, varchar, timestamp, text } from "drizzle-orm/pg-core";

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 50 }).notNull(),
  clerkUserId: varchar("clerk_user_id", { length: 128 }),
  payloadHash: varchar("payload_hash", { length: 64 }),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
