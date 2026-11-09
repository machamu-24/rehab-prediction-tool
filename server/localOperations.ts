import mysql from "mysql2/promise";
import { createBackup, listBackups, readBackup } from "../scripts/lib/local-backup.mjs";
import { LOCAL_COLUMNS } from "../scripts/lib/local-schema.mjs";
import { router, publicProcedure } from "./_core/trpc";
import { ENGINE_VERSION } from "../shared/assessment";
import { z } from "zod";

const connect = () => mysql.createConnection({ uri: process.env.DATABASE_URL ?? "", dateStrings: true, connectTimeout: 5000 });

export async function localStatus() {
  try {
    if (!process.env.DATABASE_URL) throw new Error();
    const connection = await connect();
    try {
      await connection.query("SELECT 1");
      let schemaReady = true;
      for (const [table, columns] of Object.entries(LOCAL_COLUMNS)) {
        const [rows] = await connection.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
        schemaReady &&= Object.keys(columns).every(name => rows.some(row => row.Field === name));
      }
      return { app: "rehab-prediction-tool", version: ENGINE_VERSION, database: "connected" as const, schemaReady };
    } finally { await connection.end(); }
  } catch {
    return { app: "rehab-prediction-tool", version: ENGINE_VERSION, database: "unavailable" as const, schemaReady: false };
  }
}

export const localOperationsRouter = router({
  status: publicProcedure.query(localStatus),
  backups: publicProcedure.query(listBackups),
  createBackup: publicProcedure.mutation(async () => {
    const connection = await connect();
    try { return await createBackup(connection); } finally { await connection.end(); }
  }),
  verifyBackup: publicProcedure.input(z.object({ name: z.string().max(200) })).mutation(async ({input}) => {
    const backup = await readBackup(input.name);
    return { createdAt: backup.createdAt, counts: Object.fromEntries(Object.entries(backup.tables).map(([table, rows]) => [table, (rows as unknown[]).length])) };
  }),
});
