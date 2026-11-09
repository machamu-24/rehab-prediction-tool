import { createFimModelReferences } from "./fim-model-references.mjs";

export const FUKUDA_REVISION = "fukuda-badl-albumin-ge3.5-user-choice-2026-10-30-v1";

export function createFukudaRule(outcomeId) {
  const rule = createFimModelReferences([outcomeId, 0, 0])[0];
  rule.name = "B-ADLスコア（Fukudaら2025・Alb≥3.5運用）";
  rule.isActive = true;
  // This is an explicitly chosen local boundary, not an independently validated variant.
  rule.consensusEligible = false;
  rule.applyConditions.push(
    { field: "stroke_type", operator: "!=", value: "その他", label: "脳梗塞・脳内出血・くも膜下出血" },
    { field: "stroke_onset_concurrent_disease", operator: "boolean_negative", value: false, label: "脳卒中発症と同時期の別疾患（骨折等）なし" },
  );
  const def = rule.ruleDefinition;
  def.description = "入棟時の6因子から、発症90日後の運動FIM >61点を判定する12点満点のB-ADL。利用者指定によりAlbは3.5 g/dL以上を1点として計算する。";
  def.items.find(item => item.field === "admission_albumin_g_dl").bands = [
    { operator: ">=", value: 3.5, score: 1, label: "3.5 g/dL以上（利用者指定の運用）" },
    { operator: "<", value: 3.5, score: 0, label: "3.5 g/dL未満" },
  ];
  def.positiveMessage = "B-ADL 6点以上：発症90日後の運動FIM >61点達成を示唆（Alb≥3.5運用）";
  def.negativeMessage = "B-ADL 5点以下：発症90日後の運動FIM >61点非達成を示唆（Alb≥3.5運用）";
  def.notes = def.notes
    .replace("Table 3係数の最小係数で割って丸めるというMethodsの記述からもTable 4の配点を単純に再現できないため、独自修正しない。", "配点はTable 4の掲載値を使用し、回帰係数からの再配点は行わない。導出過程の不明点は留保として残す。")
    .replace("自動計算再開にはAlb境界・等号および配点・検証方法の原著補足資料または著者確認が必要。", "2026-10-30の利用者指定により、Albは3.5 g/dL以上＝1点、3.5未満＝0点として計算を有効化。原著の表記差を解消したという意味ではなく、この運用値での性能は独立に検証されていない。原著の性能値は文献メモとして保持し、本運用モデルの検証成績とはしない。結果は参考表示とし、支持・困難の集計には含めない。");
  def.evidenceReview = {
    status: "checked", reviewedAt: "2026-10-30", revision: FUKUDA_REVISION,
    sourceUrl: rule.sourceUrl, location: "Results p.3、Tables 2–4 pp.4–5。配点はTable 4、Alb境界は利用者指定。",
    reason: "利用者がAlb≥3.5 g/dLの運用を指定。Table 4の配点を保持して計算を有効化。原著の境界表記差、導出・検証方法の留保は文献メモに保持。",
  };
  def.localCustomization = {
    field: "admission_albumin_g_dl", operator: ">=", value: 3.5, score: 1, unit: "g/dL",
    authorizedBy: "user", authorizedOn: "2026-10-30", instruction: "アルブミンの境界は3.5以上にしておきましょう",
    originalTextCutoff: 3.55, originalTable2Cutoff: 3.5, originalEqualityConfirmed: false,
    localVariantValidated: false,
  };
  return rule;
}
