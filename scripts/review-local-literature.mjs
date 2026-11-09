import 'dotenv/config';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { createBackup } from './lib/local-backup.mjs';
import { fingerprint, reviewLiterature } from './lib/literature-review.mjs';
const baseline = JSON.parse(fs.readFileSync(new URL('./local-literature.baseline.json',import.meta.url),'utf8'));
const connection = await mysql.createConnection({ uri:process.env.DATABASE_URL, dateStrings:true });
const apply = process.argv.includes('--apply');
try {
  if (apply) console.log('変更前バックアップ:',(await createBackup(connection)).name);
  await connection.beginTransaction();
  for(const before of baseline) {
    const [rows] = await connection.query('SELECT * FROM literature_rules WHERE id=? FOR UPDATE',[before.id]);
    const after = reviewLiterature(before), current = rows[0];
    const project = r => Object.fromEntries(Object.keys(before).map(k => [k, ["consensusEligible","isActive"].includes(k) ? Boolean(r?.[k]) : r?.[k]]));
    if(fingerprint(project(current)) === fingerprint(project(after))) continue;
    if(fingerprint(project(current)) !== fingerprint(project(before))) throw new Error(`ルール${before.id}は独自変更されています。上書きせず停止しました`);
    if(apply) {
      const keys=Object.keys(after).filter(k=>k!=='id');
      await connection.execute(`UPDATE literature_rules SET ${keys.map(k=>`\`${k}\`=?`).join(',')} WHERE id=?`,[...keys.map(k=>typeof after[k]==='object' && after[k]!==null?JSON.stringify(after[k]):after[k]),before.id]);
    }
    console.log(`${before.id}: ${after.ruleDefinition.evidenceReview.status} - ${after.ruleDefinition.evidenceReview.reason}`);
  }
  if(apply) await connection.commit(); else await connection.rollback();
} catch(e) { await connection.rollback(); throw e; } finally { await connection.end(); }
