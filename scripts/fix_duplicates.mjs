/**
 * 重複アウトカム削除 & フィールド名統一スクリプト
 *
 * 1. アウトカム 60002・60003（空の重複「地域歩行」）を削除
 * 2. ルール ID 30005 の ruleDefinition を修正:
 *    bbs → bbs_score, fim_motor → fim_motor_total, fim_cognitive → fim_cognitive_total
 * 3. ルール ID 30006 の ruleDefinition を修正:
 *    fim_motor（重複ノード）→ fim_motor_total に統一
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ---- 1. 空の重複アウトカムを削除 ----
await conn.execute('DELETE FROM outcomes WHERE id IN (60002, 60003)');
console.log('Deleted outcomes 60002, 60003');

// ---- 2. ルール 30005 のフィールド名を統一 ----
const [rows30005] = await conn.execute('SELECT ruleDefinition FROM literature_rules WHERE id = 30005');
const def30005 = rows30005[0].ruleDefinition;

// bbs → bbs_score, fim_motor → fim_motor_total, fim_cognitive → fim_cognitive_total
for (const v of def30005.variables) {
  if (v.field === 'bbs') {
    v.field = 'bbs_score';
    v.fieldLabel = 'BBS（Berg Balance Scale）';
  }
  if (v.field === 'fim_motor') {
    v.field = 'fim_motor_total';
    v.fieldLabel = 'FIM 運動項目合計';
  }
  if (v.field === 'fim_cognitive') {
    v.field = 'fim_cognitive_total';
    v.fieldLabel = 'FIM 認知項目合計';
  }
}
// sit_up_ability も sit_up_independent に統一（フォームに合わせる）
for (const v of def30005.variables) {
  if (v.field === 'sit_up_ability') {
    v.field = 'sit_up_independent';
    v.fieldLabel = '起居動作（介助不要）';
  }
}
await conn.execute(
  'UPDATE literature_rules SET ruleDefinition = ? WHERE id = 30005',
  [JSON.stringify(def30005)]
);
console.log('Updated rule 30005: bbs/fim_motor/fim_cognitive/sit_up_ability → unified field names');

// ---- 3. ルール 30006 の fim_motor を fim_motor_total に統一 ----
const [rows30006] = await conn.execute('SELECT ruleDefinition FROM literature_rules WHERE id = 30006');
const def30006 = rows30006[0].ruleDefinition;

for (const node of def30006.nodes || []) {
  if (node.field === 'fim_motor') {
    node.field = 'fim_motor_total';
    node.fieldLabel = 'FIM 運動項目合計';
  }
}
await conn.execute(
  'UPDATE literature_rules SET ruleDefinition = ? WHERE id = 30006',
  [JSON.stringify(def30006)]
);
console.log('Updated rule 30006: fim_motor → fim_motor_total');

// ---- 4. ルール 30007 の delta_fim_cognitive を確認（フォームに delta_fim_cognitive がないため追加検討）
// delta_fim_cognitive はフォームに存在しないが、変化量セクションに追加が必要
// → フォーム側に追加する（コード修正で対応）
console.log('Note: delta_fim_cognitive field needs to be added to form (handled in code)');

await conn.end();
console.log('Done!');
