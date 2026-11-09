export const YOSHIMATSU_SOURCE_URL = "https://www.jstage.jst.go.jp/article/rika/33/1/33_145/_pdf/-char/ja";
export const YOSHIMATSU_CLASSIFICATION_BASIS = "吉松ら（2018）本文p.147「考察」および図1（p.149）：グループ1〜3は歩行自立が可能と予測された集団、グループ4は自立し難いと予測された集団。支持／困難はこの分類に対応し、群別割合に独自の閾値は設けない。群別割合は患者個人の予測確率ではない。";

/** Repair only this known tree; preserve administrator timelines and conditions. */
export function correctYoshimatsuClassification(input) {
  const def = structuredClone(input);
  const fail = () => { throw new Error("吉松ら（2018）の既知の決定木と異なります。変更せずに停止しました。"); };
  if (def?.type !== "decision_tree" || !Array.isArray(def.nodes) || def.nodes.length !== 7) fail();
  const nodes = new Map(def.nodes.map(node => [node.id, node]));
  const root = nodes.get("root"), sit = nodes.get("check_sit_up"), cognition = nodes.get("check_cognition");
  if (nodes.size !== 7 || def.nodes[0] !== root ||
      !["bbs_score", "fbs_score", "admission_bbs_score"].includes(root?.field) || root.operator !== ">=" || root.threshold !== 13 || root.trueNodeId !== "leaf_group1" || root.falseNodeId !== "check_sit_up" ||
      !["sit_up_independent", "admission_sit_up_independent"].includes(sit?.field) || sit.operator !== "boolean" || sit.trueNodeId !== "leaf_group2" || sit.falseNodeId !== "check_cognition" ||
      !["cognitive_impairment", "admission_cognitive_impairment"].includes(cognition?.field) || cognition.operator !== "boolean_negative" || cognition.trueNodeId !== "leaf_group3" || cognition.falseNodeId !== "leaf_group4") fail();
  const rates = [0.683, 0.306, 0.222, 0.055];
  rates.forEach((rate, index) => {
    const leaf = nodes.get(`leaf_group${index + 1}`);
    if (!leaf?.isLeaf || typeof leaf.probability !== "number" || Math.abs(leaf.probability - rate) > 1e-12) fail();
    leaf.isPositive = index < 3;
    leaf.message = `${leaf.isPositive ? "支持" : "困難"}：グループ${index + 1}（原著の分類）。研究内の該当群の歩行自立割合：${(rate * 100).toFixed(1)}%。患者個人の予測確率ではありません。`;
  });
  def.outputMode = "binary";
  if (!def.notes?.includes(YOSHIMATSU_CLASSIFICATION_BASIS))
    def.notes = [def.notes, YOSHIMATSU_CLASSIFICATION_BASIS].filter(Boolean).join("\n");
  return def;
}
