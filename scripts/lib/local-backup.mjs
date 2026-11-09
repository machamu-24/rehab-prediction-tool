import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const BACKUP_TABLES = ['outcomes', 'literature_rules', 'predictions', 'prediction_results'];
export const BACKUP_DIR = path.resolve(process.env.REHAB_DATA_DIR || process.cwd(), 'backups');
const digest = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
export const validBackupName = name => /^rehab-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9-]+\.json$/.test(name);

export async function createBackup(connection) {
  const tables = {};
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.beginTransaction();
  try {
    for (const table of BACKUP_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\` ORDER BY id`);
      tables[table] = rows;
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  const payload = { format: 'rehab-local-backup', version: 1, createdAt: new Date().toISOString(), tables };
  const data = { checksum: digest(payload), payload };
  const name = `rehab-${payload.createdAt.replace(/[:.]/g, '-')}-${randomUUID()}.json`;
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(BACKUP_DIR, name), JSON.stringify(data), { mode: 0o600, flag: 'wx' });
  return { name, createdAt: payload.createdAt, counts: Object.fromEntries(BACKUP_TABLES.map(table => [table, tables[table].length])) };
}

export async function readBackup(name) {
  if (!validBackupName(name)) throw new Error('バックアップ名が不正です');
  const data = JSON.parse(await fs.readFile(path.join(BACKUP_DIR, name), 'utf8'));
  const p = data.payload;
  if (p?.format !== 'rehab-local-backup' || p.version !== 1 || data.checksum !== digest(p)) throw new Error('バックアップ形式またはチェックサムが一致しません');
  if (!p.tables || Object.keys(p.tables).sort().join() !== [...BACKUP_TABLES].sort().join()) throw new Error('必要なテーブルがありません');
  for (const table of BACKUP_TABLES) {
    const rows = p.tables[table];
    if (!Array.isArray(rows) || rows.some(row => !row || !Number.isSafeInteger(row.id) || row.id < 1) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`不正な行: ${table}`);
  }
  return p;
}

export async function listBackups() {
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const names = (await fs.readdir(BACKUP_DIR)).filter(validBackupName).sort().reverse();
  return Promise.all(names.map(async name => {
    const stat = await fs.stat(path.join(BACKUP_DIR, name));
    return { name, bytes: stat.size, createdAt: stat.mtime.toISOString() };
  }));
}

// Restore rows only into empty, pre-created trusted schema. Never execute SQL from a backup file.
export async function restoreBackup(connection, payload) {
  await connection.beginTransaction();
  try {
    for (const table of BACKUP_TABLES) {
      const [count] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      if (Number(count[0].n) !== 0) throw new Error('復元先に既存データがあります。空のDBのみ復元できます');
      const [fields] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
      const allowed = new Map(fields.map(field => [field.Field, String(field.Type)]));
      for (const row of payload.tables[table]) {
        const keys = Object.keys(row);
        if (keys.some(key => !allowed.has(key))) throw new Error(`復元先のスキーマが対応していません: ${table}`);
        const values = keys.map(key => allowed.get(key) === 'json' && row[key] !== null ? JSON.stringify(row[key]) : row[key]);
        await connection.execute(`INSERT INTO \`${table}\` (${keys.map(key => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, values);
      }
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}
