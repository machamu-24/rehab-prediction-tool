export const ISHINO_SOURCE_URL = "https://aichi-npopt.jp/dl/info_paper_back/35_2_15.pdf";
export const ISHINO_CLASSIFICATION_BASIS = "石野ら（2023）p.100 図1・2の各終端で、自立者・非自立者の人数が多い側を集計上の支持／困難として返す。同数は判定保留とし集計対象外。群別割合は原著の表示値を保持し、患者個人の予測確率とは扱わない。入棟時と入棟1ヶ月後の変化量を使用する。";

const models = {
  30006: {
    branches: [
      ["root", "delta_bbs", ">", 20, "age", "motor"],
      ["age", "age", "<=", 67.5, "a", "b"],
      ["motor", "delta_fim_motor", ">", 23, "c", "baseline"],
      ["baseline", "fim_motor_total", "<=", 43, "d", "e"],
    ],
    leaves: [["a", 86.5, 32, 37], ["b", 42.3, 11, 26], ["c", 71.4, 10, 14], ["d", 8.1, 10, 123], ["e", 33.3, 14, 42]],
  },
  30007: {
    branches: [
      ["root", "delta_fim_motor", ">", 12, "a", "cba"],
      ["cba", "cba_score", "<=", 18, "cognition", "age"],
      ["cognition", "delta_fim_cognitive", "<=", 1, "b", "c"],
      ["age", "age", "<=", 67.5, "d", "e"],
    ],
    leaves: [["a", 95.4, 103, 108], ["b", 14.3, 4, 28], ["c", 50, 8, 16], ["d", 91.6, 11, 12], ["e", 54.7, 25, 46]],
  },
};

/** Refuse unfamiliar/custom trees instead of overwriting their logic. */
export function correctIshinoClassification(input, id) {
  const model = models[id];
  const fail = () => { throw new Error(`石野ら（2023）ID ${id}の既知の決定木と異なります。変更せずに停止しました。`); };
  const def = structuredClone(input);
  if (!model || def?.type !== "decision_tree" || !Array.isArray(def.nodes) || def.nodes.length !== 9) fail();
  const nodes = new Map(def.nodes.map(node => [node.id, node]));
  if (nodes.size !== 9 || def.nodes[0].id !== "root") fail();
  for (const [nodeId, field, operator, threshold, yes, no] of model.branches) {
    const node = nodes.get(nodeId);
    const fields = ["age", "fim_motor_total", "cba_score"].includes(field) ? [field, `admission_${field}`] : [field];
    if (!node || node.isLeaf || !fields.includes(node.field) || node.operator !== operator || node.threshold !== threshold || node.trueNodeId !== yes || node.falseNodeId !== no) fail();
  }
  for (const [nodeId, rate, independent, total] of model.leaves) {
    const leaf = nodes.get(nodeId);
    if (!leaf?.isLeaf || typeof leaf.probability !== "number" || Math.abs(leaf.probability - rate / 100) > 1e-12) fail();
    leaf.isPositive = independent * 2 === total ? null : independent * 2 > total;
    const label = leaf.isPositive === null ? "判定保留（自立・非自立が同数）" : leaf.isPositive ? "支持（自立者が多い分岐）" : "困難（非自立者が多い分岐）";
    leaf.message = `${label}。研究内の該当群の歩行自立割合：${rate}%（${independent}/${total}名）。患者個人の予測確率ではありません。`;
  }
  def.outputMode = "classified";
  if (!def.notes?.includes(ISHINO_CLASSIFICATION_BASIS))
    def.notes = [def.notes, ISHINO_CLASSIFICATION_BASIS].filter(Boolean).join("\n");
  return def;
}
