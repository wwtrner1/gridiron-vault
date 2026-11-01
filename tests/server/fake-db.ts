import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pglite } from "drizzle-orm/pglite";

/**
 * Netlify Database in the server tests: the same Drizzle calls, against Postgres compiled to WebAssembly in this
 * process. `migrate()` runs every generated migration in order, so the tests see the production schema.
 */
export const client = new PGlite();

export function drizzle(opts: Record<string, unknown>) {
  return pglite({ client, ...opts } as never);
}

export async function migrate() {
  const root = new URL("../../netlify/database/migrations/", import.meta.url);
  for (const dir of readdirSync(root).sort()) {
    const sql = readFileSync(new URL(`${dir}/migration.sql`, root), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement);
  }
}
