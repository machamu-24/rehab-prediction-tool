export const SENOO_SOURCE_URL = "https://www.jstage.jst.go.jp/article/opta/3/1/3_16/_pdf/-char/ja";
export const SENOO_CLASSIFICATION_BASIS = "妹尾・井上（2022）p.19 図1の各終端に示された自立者／非自立者の人数に基づき、多い側を支持／困難として集計する。脳出血で入棟時FIM運動47点超、または脳梗塞で要介護2以下かつ入棟時FIM認知19点超の分岐は支持。それ以外の対象分岐は困難。原著の群別割合は併記し、患者個人の予測確率とは扱わない。";

/** Only repair the known imported tree; retain administrator metadata and ranges. */
export function correctSenooClassification(input) {
  const def = structuredClone(input);
  const fail = () => { throw new Error("妹尾・井上（2022）の既知の決定木と異なります。変更せずに停止しました。"); };
  if (def?.type !== "decision_tree" || !Array.isArray(def.nodes) || def.nodes.length !== 9) fail();
  const nodes = new Map(def.nodes.map(node => [node.id, node]));
  if (nodes.size !== 9 || def.nodes[0].id !== "root") fail();
  const branches = [
    ["root", ["stroke_type"], "equals", "脳出血", "motor", "care"],
    ["motor", ["fim_motor_total", "admission_fim_motor_total"], ">", 47, "a", "b"],
    ["care", ["care_level", "admission_care_level"], "<=", 2, "cognitive", "c"],
    ["cognitive", ["fim_cognitive_total", "admission_fim_cognitive_total"], ">", 19, "d", "e"],
  ];
  for (const [id, fields, operator, threshold, yes, no] of branches) {
    const node = nodes.get(id);
    if (!node || node.isLeaf || !fields.includes(node.field) || node.operator !== operator || node.threshold !== threshold || node.trueNodeId !== yes || node.falseNodeId !== no) fail();
  }
  for (const [id, rate, independent, total] of [["a",100,13,13],["b",8.7,2,23],["c",11.8,2,17],["d",97.4,37,38],["e",42.9,6,14]]) {
    const leaf = nodes.get(id);
    if (!leaf?.isLeaf || typeof leaf.probability !== "number" || Math.abs(leaf.probability - rate / 100) > 1e-12) fail();
    leaf.isPositive = independent * 2 > total;
    leaf.message = `${leaf.isPositive ? "支持（自立者が多い分岐）" : "困難（非自立者が多い分岐）"}。研究内の該当群の歩行自立割合：${rate}%（${independent}/${total}名）。患者個人の予測確率ではありません。`;
  }
  def.outputMode = "classified";
  if (!def.notes?.includes(SENOO_CLASSIFICATION_BASIS))
    def.notes = [def.notes, SENOO_CLASSIFICATION_BASIS].filter(Boolean).join("\n");
  return def;
}
