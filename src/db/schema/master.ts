import { pgTable, varchar, boolean, decimal, date, serial, text } from "drizzle-orm/pg-core";

export const fuelTypes = pgTable("fuel_types", {
  fuelTypeId: varchar("fuel_type_id", { length: 20 }).primaryKey(),
  nameTh: varchar("name_th", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const provinces = pgTable("provinces", {
  provinceCode: varchar("province_code", { length: 2 }).primaryKey(),
  nameTh: varchar("name_th", { length: 100 }).notNull(),
  region: varchar("region", { length: 50 }).notNull(),
});

export const taxRates = pgTable("tax_rates", {
  id: serial("id").primaryKey(),
  provinceCode: varchar("province_code", { length: 2 })
    .notNull()
    .references(() => provinces.provinceCode),
  fuelTypeId: varchar("fuel_type_id", { length: 20 })
    .notNull()
    .references(() => fuelTypes.fuelTypeId),
  ratePerLiter: decimal("rate_per_liter", { precision: 8, scale: 4 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
});
