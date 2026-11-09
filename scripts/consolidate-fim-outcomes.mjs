import "dotenv/config";
import mysql from "mysql2/promise";
import { createBackup } from "./lib/local-backup.mjs";
import { fingerprint } from "./lib/literature-review.mjs";

const apply = process.argv.includes("--apply");
const description = "運動FIM（13〜91点）の点数予測と到達分類を文献ごとに確認します。退院時・発症90日後など、予測対象時点は各文献に表示します。";
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true, connectTimeout: 5000 });
try {
  if (apply) console.log("変更前バックアップ:", (await createBackup(connection)).name);
  await connection.beginTransaction();
  const [outcomes] = await connection.execute("SELECT * FROM outcomes WHERE name IN (?, ?) FOR UPDATE", ["FIM運動項目", "発症90日後の運動FIM >61点"]);
  const targets = outcomes.filter(row => row.name === "FIM運動項目");
  if (targets.length !== 1 || targets[0].unit !== "点") throw new Error("統合先のFIM運動項目を一意に確認できません。");
  const target = targets[0], legacy = outcomes.find(row => row.name === "発症90日後の運動FIM >61点");
  const [rules] = await connection.execute("SELECT * FROM literature_rules WHERE source LIKE ? OR sourceUrl LIKE ? FOR UPDATE", ["%108185%", "%108185%"]);
  if (rules.length !== 1 || ![target.id, legacy?.id].includes(rules[0].outcomeId)) throw new Error("Fukudaの登録先を確認できません。変更せず停止しました。");
  const original = rules[0];
  const [maugeriBefore] = await connection.execute("SELECT * FROM literature_rules WHERE source LIKE ? OR sourceUrl LIKE ? ORDER BY id", ["%018058%", "%018058%"]);
  const status = original.outcomeId === target.id && target.description === description ? "already_consolidated" : "consolidate";
  if (apply) {
    await connection.execute("UPDATE literature_rules SET outcomeId = ? WHERE id = ?", [target.id, original.id]);
    await connection.execute("UPDATE outcomes SET description = ? WHERE id = ?", [description, target.id]);
    const [saved] = await connection.execute("SELECT * FROM literature_rules WHERE id = ?", [original.id]);
    const { updatedAt: beforeDate, outcomeId: beforeOutcome, ...before } = original;
    const { updatedAt: afterDate, outcomeId: afterOutcome, ...after } = saved[0];
    if (afterOutcome !== target.id || fingerprint(before) !== fingerprint(after)) throw new Error("Fukudaの所属以外の値が変化しました。");
    const [maugeriAfter] = await connection.execute("SELECT * FROM literature_rules WHERE source LIKE ? OR sourceUrl LIKE ? ORDER BY id", ["%018058%", "%018058%"]);
    if (fingerprint(maugeriBefore) !== fingerprint(maugeriAfter)) throw new Error("Maugeriの文献情報が変化しました。");
    await connection.commit();
  } else await connection.rollback();
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", status, fukudaRuleId: original.id, outcomeId: target.id, retainedMaugeriRuleIds: maugeriBefore.map(row => row.id), history: "preserved", selection: "旧Fukuda・Maugeriの専用アウトカムは照合画面で非表示" }));
} catch (error) { await connection.rollback(); throw error; }
finally { await connection.end(); }
