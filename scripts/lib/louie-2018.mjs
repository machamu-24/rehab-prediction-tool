export const LOUIE_SOURCE_URL = "https://doi.org/10.2340/16501977-2280";
export const LOUIE_REVISION = "louie-2018-primary-source-2026-10-29-v2";
export const LOUIE_RULE_IDS = [60001, 60002];

// Both records describe the same cohort, but the 12-point analysis is restricted
// to participants unable to complete the 5MWT without hands-on assistance.
export function correctLouieRule(original) {
  if (!LOUIE_RULE_IDS.includes(original.id)) throw new Error("Louieら2018の対象IDではありません");
  const community = original.id === 60001;
  const median = community ? 19 : 20;
  const conditions = [
    { field: "days_onset_to_admission", operator: "<", value: 28, label: "研究対象：発症4週未満にリハビリ入院" },
    { field: "admission_mmse_score", operator: ">=", value: 20, label: "入院時MMSE20点以上" },
    { field: "stroke_type", operator: "!=", value: "くも膜下出血", label: "研究対象：画像で確認された脳梗塞・脳出血" },
    { field: "stroke_type", operator: "!=", value: "その他", label: "研究対象：画像で確認された脳梗塞・脳出血" },
  ];
  if (!community) conditions.push({ field: "admission_unassisted_5m", operator: "==", value: false, label: "入院時に身体的介助なしでは5m歩行テストを完遂できない" });
  const commonNotes = "カナダの5施設。RCTの両群を統合した後ろ向きコホート解析。リハビリ入院時から4週間後の歩行を評価し、日本の回復期病棟の任意の退院時期を予測するものではない。対象は発症4週未満、MMSE20点以上、画像で確認された脳梗塞・脳出血で、下肢の治療が本人・チームの目標である患者。心血管状態不安定、脳卒中以外の重大な運動器・神経疾患、受容性失語は除外。入力項目のない組み入れ・除外条件は原著に照らして別途確認する。5m歩行テストは9mの歩行区間の中央5mを計測。身体的介助なしは療法士のhands-on assistanceがないことを指し、杖・歩行器なしの独歩を意味しない。閾値の性能は同じ研究集団で評価され、独立集団での外部検証ではない。";
  return {
    ...original,
    name: community
      ? "入院時BBSによる4週後の地域歩行速度予測（≥29点、Louieら2018）"
      : "入院時BBSによる4週後の身体的介助なし5m歩行予測（非歩行者、≥12点、Louieら2018）",
    ruleType: "cutoff",
    source: "Louie DR, Eng JJ (2018) J Rehabil Med 50:37–44. doi:10.2340/16501977-2280",
    sourceUrl: LOUIE_SOURCE_URL,
    evidenceLevel: "Cohort Study",
    applyConditions: conditions,
    accuracy: null,
    sensitivity: community ? 0.86 : 0.74,
    specificity: community ? 0.84 : 0.68,
    auc: community ? 0.88 : 0.73,
    consensusEligible: false,
    ruleDefinition: {
      ...original.ruleDefinition,
      type: "cutoff", field: "admission_bbs_score", fieldLabel: "Berg Balance Scale（BBS）リハビリ入院時", unit: "点", operator: ">=", threshold: community ? 29 : 12,
      inputTimepoint: "admission",
      description: community
        ? "入院時の歩行可否を問わない123名で、4週後の5m歩行速度0.8m/s以上への到達を検討。"
        : "入院時に身体的介助なしの5m歩行ができない84名で、4週後の身体的介助なし5m歩行の獲得を検討。",
      positiveMessage: community
        ? "入院時BBS≥29点：入院から4週後の地域歩行速度（5m歩行速度≥0.8m/s）への到達を支持。屋外歩行の安全性・持久力・実生活での自立は別途評価。"
        : "入院時BBS≥12点：入院から4週後の身体的介助なし5m歩行の獲得を支持。見守り不要・病棟歩行自立を直接示す結果ではありません。",
      negativeMessage: community
        ? "入院時BBS<29点：入院から4週後の地域歩行速度（5m歩行速度≥0.8m/s）を支持する閾値を下回ります。到達できないと断定するものではありません。"
        : "入院時BBS<12点：入院から4週後の身体的介助なし5m歩行を支持する閾値を下回ります。研究内ではこの群の約40%も獲得しており、獲得困難と断定できません。",
      notes: commonNotes + (community
        ? " 全123名でのBBS単独ROC：AUC0.88（95%CI 0.81–0.95）、感度86%、特異度84%。地域歩行は速度による分類で、安全性・持久力や実生活での屋外歩行を直接評価していない。Table IIIのOR0.19は脳出血を基準とした脳梗塞のオッズ比で、BBS単独カットオフの結果とは区別する。"
        : " 非歩行者84名中53名が4週後に身体的介助なし歩行を獲得。BBS単独ROC：AUC0.73（95%CI 0.62–0.84）、感度74%、特異度68%。Table Vの陽性的中率80%、陰性的中率60%は研究集団内の値で、個人の確率ではない。FAC≥4・FIM歩行≥6と同一のアウトカムとして検証されていないため、歩行自立アウトカムでは参考結果として扱う。"),
      timeline: {
        version: 1, anchor: "stroke_onset", kind: "future",
        evaluation: {
          value: median, unit: "day", precision: "median",
          originalText: `At admission to inpatient stroke rehabilitation; median ${median} days post-stroke`,
          basis: `原著${community ? "Table I（p.39）、Results" : "Table II（p.40）"}の入院時発症後日数中央値${median}日。組み入れ条件は発症4週未満。中央値を個人の評価日や適用範囲に変換しない。`,
        },
        target: {
          value: median + 28, unit: "day", precision: "median",
          originalText: "After 4 weeks of inpatient rehabilitation (28 days after the admission assessment)",
          basis: `原著Methods（p.38）では入院時から4週後に再評価。発症後${median + 28}日は入院時中央値${median}日＋28日による集団の代表値${community ? "（Resultsにも47日と記載）" : ""}で、全患者共通の固定日や退院日ではない。現在の時間軸は発症起点のため相対28日を厳密照合せず参考扱いとし、根拠のない照合範囲は設定しない。`,
        },
      },
      evidenceReview: {
        status: "checked", reviewedAt: "2026-10-29", revision: LOUIE_REVISION, sourceUrl: LOUIE_SOURCE_URL,
        location: "Methods p.38、Tables I–II pp.39–40、Table V p.41、Discussion pp.42–43",
        reason: "対象条件、入院時BBS、入院から4週後のアウトカム、Table Vの閾値・精度を照合。身体的介助なし5m歩行とFAC/FIM歩行自立、地域歩行速度と実生活の地域歩行を区別し参考結果として保持。",
      },
    },
  };
}
