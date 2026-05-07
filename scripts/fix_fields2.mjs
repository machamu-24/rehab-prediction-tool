/**
 * フィールド名統一スクリプト2
 * 1. ルール30003: fbs_score → bbs_score（BBS/FBSは同一検査）
 * 2. ルール60009: sitting_balance → sitting_balance_30s（フォームに合わせる）
 * 3. ルール60009: neglect → spatial_neglect（半側空間無視を spatial_neglect に統一）
 * 4. applyConditions の nihss フィールドを確認（ルール4はnihssをruleDefinition内で使用）
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ---- 1. ルール30003: fbs_score → bbs_score ----
const [rows30003] = await conn.execute('SELECT ruleDefinition FROM literature_rules WHERE id = 30003');
const def30003 = rows30003[0].ruleDefinition;

const str30003 = JSON.stringify(def30003)
  .replace(/"fbs_score"/g, '"bbs_score"')
  .replace(/"Functional Balance Scale（FBS）"/g, '"BBS（Berg Balance Scale）"')
  .replace(/"FBS"/g, '"BBS"');

await conn.execute(
  'UPDATE literature_rules SET ruleDefinition = ? WHERE id = 30003',
  [str30003]
);
console.log('Updated rule 30003: fbs_score → bbs_score');

// ---- 2. ルール60009: sitting_balance → sitting_balance_30s、neglect → spatial_neglect ----
const [rows60009] = await conn.execute('SELECT ruleDefinition FROM literature_rules WHERE id = 60009');
const def60009 = rows60009[0].ruleDefinition;

const str60009 = JSON.stringify(def60009)
  .replace(/"field":"sitting_balance"/g, '"field":"sitting_balance_30s"')
  .replace(/"fieldLabel":"座位保持（良好）"/g, '"fieldLabel":"座位保持30秒（30秒以上）"')
  .replace(/"field":"neglect"/g, '"field":"spatial_neglect"')
  .replace(/"fieldLabel":"無視なし"/g, '"fieldLabel":"半側空間無視なし"');

await conn.execute(
  'UPDATE literature_rules SET ruleDefinition = ? WHERE id = 60009',
  [str60009]
);
console.log('Updated rule 60009: sitting_balance → sitting_balance_30s, neglect → spatial_neglect');

// ---- 3. ルール4のnihssフィールドはそのまま維持（NIHSSルールとして存在する） ----
// NIHSSはフォームから削除するが、ルール4はnihssを使用するため「入力なし→適用不可」として扱われる
// applyConditionsにnihssが含まれていないか確認
const [rows4] = await conn.execute('SELECT applyConditions FROM literature_rules WHERE id = 4');
console.log('Rule 4 applyConditions:', JSON.stringify(rows4[0].applyConditions));

await conn.end();
console.log('Done!');
