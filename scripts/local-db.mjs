import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createBackup, readBackup, restoreBackup, BACKUP_TABLES } from './lib/local-backup.mjs';
import { migrateLocalSchema, createLocalTables } from './lib/local-schema.mjs';

const command = process.argv[2];
const config = { uri: process.env.DATABASE_URL, dateStrings: true };
if (!config.uri) throw new Error('DATABASE_URLを.envに設定してください');
// Restoration must still work after the original database is lost.
const adminUri = new URL(config.uri); adminUri.pathname = "/";
const source = await mysql.createConnection(command === 'restore' ? {...config, uri: adminUri.toString()} : config);
try {
  if (command === 'backup') {
    console.log(JSON.stringify(await createBackup(source), null, 2));
  } else if (command === 'migrate') {
    console.log('変更前バックアップ:', (await createBackup(source)).name);
    await migrateLocalSchema(source);
    console.log('通常版スキーマを更新しました（既存データは保持）');
  } else if (command === 'restore') {
    const name = process.argv[3];
    const database = process.argv[4];
    if (!/^rehab_restore_[a-zA-Z0-9_]{1,40}$/.test(database ?? '')) throw new Error('復元先は新しいDB名 rehab_restore_... を指定してください');
    const payload = await readBackup(name);
    // CREATE without IF NOT EXISTS refuses every existing database.
    await source.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    const uri = new URL(config.uri); uri.pathname = `/${database}`;
    const target = await mysql.createConnection({ uri: uri.toString(), dateStrings: true });
    try {
      await createLocalTables(target);
      await restoreBackup(target, payload);
      for (const table of BACKUP_TABLES) {
        const [rows] = await target.query(`SELECT * FROM \`${table}\` ORDER BY id`);
        if (rows.length !== payload.tables[table].length) throw new Error(`復元件数が不一致: ${table}`);
        rows.sort((a,b) => a.id-b.id);
        const expected = [...payload.tables[table]].sort((a,b) => a.id-b.id);
        // Verify every restored source field, including JSON and evaluation details.
        for (let i = 0; i < payload.tables[table].length; i++) {
          for (const key of Object.keys(expected[i])) {
            if (JSON.stringify(rows[i]?.[key]) !== JSON.stringify(expected[i][key])) throw new Error(`復元検証が不一致: ${table}.${key}`);
          }
        }
        console.log(`${table}: ${rows.length}件 復元・照合済み`);
      }
      console.log(`復元先: ${database}。通常版DB・.envは変更していません。切替前に接続先を確認してください。`);
    } finally { await target.end(); }
  } else {
    throw new Error('使い方: node scripts/local-db.mjs backup | migrate | restore <バックアップ名> <新しいDB名 rehab_restore_...>');
  }
} finally { await source.end(); }
