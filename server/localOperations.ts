import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getStore,
  defaultDataDirectory,
  backupChecksum,
  validateBackup,
  restoreAsNewDatabase,
  BACKUP_TABLES,
} from "./sqliteStore";
import { router, publicProcedure } from "./_core/trpc";
import { ENGINE_VERSION } from "../shared/assessment";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const validName = (name: string) =>
  /^rehab-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9-]+\.json$/.test(name);
const backupDirectory = () => path.join(defaultDataDirectory(), "backups");
async function readLocalBackup(name: string) {
  if (!validName(name)) throw new Error("バックアップ名が不正です");
  return JSON.parse(
    await fs.readFile(path.join(backupDirectory(), name), "utf8")
  ) as unknown;
}
export async function localStatus() {
  try {
    const store = getStore();
    store.db.prepare("SELECT 1").get();
    return {
      app: "rehab-prediction-tool",
      version: ENGINE_VERSION,
      database: "connected" as const,
      schemaReady: true,
      storage: "sqlite" as const,
      dataDirectory: defaultDataDirectory(),
      databaseFile: store.file,
      desktop: process.env.REHAB_DESKTOP === "1",
    };
  } catch {
    return {
      app: "rehab-prediction-tool",
      version: ENGINE_VERSION,
      database: "unavailable" as const,
      schemaReady: false,
      storage: "sqlite" as const,
      dataDirectory: defaultDataDirectory(),
      databaseFile: null,
      desktop: process.env.REHAB_DESKTOP === "1",
    };
  }
}
export async function createSqliteBackup() {
  const payload = {
    format: "rehab-local-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    timestampTimeZone: "UTC",
    tables: getStore().exportTables(),
  };
  const data = { checksum: backupChecksum(payload), payload };
  const name = `rehab-${payload.createdAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  await fs.mkdir(backupDirectory(), { recursive: true, mode: 0o700 });
  const temp = path.join(backupDirectory(), `${name}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: "wx" });
    await fs.rename(temp, path.join(backupDirectory(), name));
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  return {
    name,
    createdAt: payload.createdAt,
    counts: Object.fromEntries(
      BACKUP_TABLES.map(table => [
        table,
        (payload.tables[table] as unknown[]).length,
      ])
    ),
  };
}
export const localOperationsRouter = router({
  status: publicProcedure.query(localStatus),
  backups: publicProcedure.query(async () => {
    await fs.mkdir(backupDirectory(), { recursive: true, mode: 0o700 });
    const files = (await fs.readdir(backupDirectory()))
      .filter(validName)
      .sort()
      .reverse();
    return Promise.all(
      files.map(async name => {
        const stat = await fs.stat(path.join(backupDirectory(), name));
        return { name, bytes: stat.size, createdAt: stat.mtime.toISOString() };
      })
    );
  }),
  createBackup: publicProcedure.mutation(createSqliteBackup),
  verifyBackup: publicProcedure
    .input(z.object({ name: z.string().max(200) }))
    .mutation(async ({ input }) => {
      const backup = validateBackup(await readLocalBackup(input.name));
      return {
        createdAt: String(backup.createdAt),
        counts: Object.fromEntries(
          BACKUP_TABLES.map(table => [table, backup.tables[table].length])
        ),
      };
    }),
  downloadBackup: publicProcedure
    .input(z.object({ name: z.string().max(200) }))
    .query(async ({ input }) => {
      const data = await readLocalBackup(input.name);
      validateBackup(data);
      return { name: input.name, content: JSON.stringify(data) };
    }),
  inspectBackup: publicProcedure
    .input(z.object({ content: z.string().max(40_000_000) }))
    .mutation(({ input }) => {
      const backup = validateBackup(JSON.parse(input.content));
      return {
        createdAt: String(backup.createdAt),
        legacyTimeZone: backup.timestampTimeZone !== "UTC",
        counts: Object.fromEntries(
          BACKUP_TABLES.map(table => [table, backup.tables[table].length])
        ),
      };
    }),
  restoreBackup: publicProcedure
    .input(
      z.object({
        name: z.string().max(200).optional(),
        content: z.string().max(40_000_000).optional(),
        confirmed: z.literal(true),
        legacyUTC: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      if (Boolean(input.name) === Boolean(input.content))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "復元するバックアップを1つ指定してください",
        });
      const data = input.name
        ? await readLocalBackup(input.name)
        : JSON.parse(input.content!);
      validateBackup(data);
      const previousBackup = await createSqliteBackup();
      return {
        ...restoreAsNewDatabase(data, input.legacyUTC),
        previousBackup: previousBackup.name,
      };
    }),
});
