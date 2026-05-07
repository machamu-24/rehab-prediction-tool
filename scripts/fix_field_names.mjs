/**
 * フィールド名統一スクリプト
 * - applyConditions の days_post_stroke → days_since_onset
 * - routers.ts・schema.ts の days_post_stroke は後でコード側で対応
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// applyConditions の days_post_stroke → days_since_onset
const [rules] = await conn.execute('SELECT id, name, applyConditions FROM literature_rules');

for (const r of rules) {
  const conds = r.applyConditions;
  if (!conds || !Array.isArray(conds)) continue;
  
  let changed = false;
  for (const c of conds) {
    if (c.field === 'days_post_stroke') {
      c.field = 'days_since_onset';
      c.label = c.label || '発症後日数';
      changed = true;
    }
  }
  
  if (changed) {
    await conn.execute(
      'UPDATE literature_rules SET applyConditions = ? WHERE id = ?',
      [JSON.stringify(conds), r.id]
    );
    console.log(`Updated rule ${r.id} (${r.name}): applyConditions days_post_stroke → days_since_onset`);
  }
}

await conn.end();
console.log('Done!');
