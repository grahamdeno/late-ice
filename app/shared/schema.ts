// The live schema is created in server/db.ts and server/accounts.ts with plain SQL
// (CREATE TABLE IF NOT EXISTS plus additive migrations). This file mirrors the
// accounts table for drizzle tooling only; it is not the source of truth.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  number: text("number"),
  position: text("position"),
  homeRinkId: integer("home_rink_id"),
  status: text("status").notNull().default("available"),
  statusUntil: text("status_until"),
  hidden: integer("hidden").notNull().default(0),
  createdAt: text("created_at"),
});

export type User = typeof users.$inferSelect;
