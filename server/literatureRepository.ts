import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { literatureRules } from "../drizzle/schema";

/** Saved histories own their snapshots; retain their original rule IDs and results. */
export async function removeLiteratureRule<TSchema extends Record<string, unknown>>(
  db: MySql2Database<TSchema>,
  id: number
) {
  return db.delete(literatureRules).where(eq(literatureRules.id, id));
}
