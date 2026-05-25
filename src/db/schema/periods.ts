import { pgTable, serial, varchar, date, timestamp } from "drizzle-orm/pg-core";

export const reportingPeriods = pgTable("reporting_periods", {
  periodId: serial("period_id").primaryKey(),
  mode: varchar("mode", { length: 1 }).notNull(), // 'M' | 'W' | 'D'
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  dueDate: date("due_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
