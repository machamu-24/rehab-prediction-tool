import { createHash } from 'node:crypto';
import { correctYoshimatsuClassification } from './yoshimatsu-classification.mjs';
import { correctIshinoClassification } from './ishino-classification.mjs';
import { correctSenooClassification } from './senoo-classification.mjs';
import { correctLouieRule } from './louie-2018.mjs';

export const REVIEW_REVISION = 'primary-source-review-2026-10-07-v1';
export function canonical(value) {
  // MySQL JSON normalizes binary floating-point tails; ignore only machine precision.
  if (typeof value === 'number') return Number(value.toPrecision(15));
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const branch = (id, field, operator, threshold, yes, no) => ({ id, field, fieldLabel: field, operator, threshold, trueNodeId: yes, falseNodeId: no });
const leaf = (id, rate, n) => ({ id, field: '', fieldLabel: '', operator: 'boolean', isLeaf: true, probability: rate / 100, message: `研究内の該当群：歩行自立 ${rate}%（${n}）。個人の予測確率ではありません。` });
const condition = (field, operator, value, label) => ({ field, operator, value, label });
const baselineFields = new Set(['age','bbs_score','fim_motor_total','fim_cognitive_total','sit_up_independent','cognitive_impairment','walking_status','cba_score','care_level','spatial_neglect','mmse_score']);
function admissionFields(value) {
  if (Array.isArray(value)) return value.map(admissionFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, key === 'field' && baselineFields.has(val) ? `admission_${val}` : admissionFields(val)]));
}

export function reviewLiterature(original) {
  if ([60001, 60002].includes(original.id)) return correctLouieRule(original);
  const rule = structuredClone(original), id = rule.id;
  let def = rule.ruleDefinition;
  let status = 'checked', reason = '', location = '', timepoint = 'current';
  const phases = [30003,30004,30005,30006,30007,30008,60001,60002,60006];
  if (phases.includes(id)) timepoint = 'admission';
  if ([30001,30002].includes(id)) {
    rule.source = '松下武矢ら（2022）理学療法学 49(4):275–280';
    location = '本文・図1（p.278）';
    def.notes = '回復期の脳卒中片麻痺658名。随意膝伸展が不能、または指示理解困難な患者は除外。同時点の病棟歩行の判別であり、退院時の予後確率ではない。単位はトルク体重比 Nm/kg。';
    reason = 'カットオフ、単位、感度・特異度・AUCを確認。著者名・掲載誌を訂正。';
    rule.consensusEligible = false;
  } else if (id === 30003) {
    location = '本文p.147「考察」・図1・表2（p.149）';
    def = correctYoshimatsuClassification(def);
    reason = '本文の分類に合わせグループ1〜3を支持、4を困難として返す。群別割合は併記し、割合に独自の閾値は設けない。';
    rule.consensusEligible = true;
  } else if (id === 30004) {
    location = '表4・5・7'; rule.accuracy = 0.83;
    reason = '4因子の境界、3点閾値、性能指標を確認。入棟時FIM歩行5点以下の集団。';
    rule.applyConditions = [condition('admission_fim_walk', '<=', 5, '入棟時FIM歩行項目5点以下')];
  } else if (id === 30005) {
    status = 'blocked'; location = '抄録・登録モデル'; rule.auc = null;
    reason = 'Coxモデルに必要なベースライン生存関数が未登録。C-indexをAUCとして表示しない。時点別確率は算出不可。';
  } else if (id === 30006) {
    location = '原著p.100 図1';
    def = { type: 'decision_tree', outputMode: 'descriptive', nodes: [
      branch('root','delta_bbs','>',20,'age','motor'),
      branch('age','age','<=',67.5,'a','b'),
      branch('motor','delta_fim_motor','>',23,'c','baseline'),
      branch('baseline','fim_motor_total','<=',43,'d','e'),
      leaf('a',86.5,'32/37名'), leaf('b',42.3,'11/26名'), leaf('c',71.4,'10/14名'), leaf('d',8.1,'10/123名'), leaf('e',33.3,'14/42名'),
    ], notes: '入棟時と入棟1ヶ月後の差分を使用。学習用242名の群内割合を表示。原著図1の指標を記載。' };
    rule.sourceUrl = 'https://aichi-npopt.jp/dl/info_paper_back/35_2_15.pdf';
    rule.accuracy = 0.823; rule.sensitivity = 0.634; rule.specificity = 0.839; rule.auc = null;
    def = correctIshinoClassification(def, id);
    reason = '分岐順・境界・群内割合を図1に照合。自立／非自立の人数が多い側を支持／困難として集計する。'; timepoint = 'month1'; rule.consensusEligible = true;
  } else if (id === 30007) {
    location = '原著p.100 図2';
    def = { type: 'decision_tree', outputMode: 'descriptive', nodes: [
      branch('root','delta_fim_motor','>',12,'a','cba'),
      branch('cba','cba_score','<=',18,'cognition','age'),
      branch('cognition','delta_fim_cognitive','<=',1,'b','c'),
      branch('age','age','<=',67.5,'d','e'),
      leaf('a',95.4,'103/108名'), leaf('b',14.3,'4/28名'), leaf('c',50,'8/16名'), leaf('d',91.6,'11/12名'), leaf('e',54.7,'25/46名'),
    ], notes: '入棟時CBAと、入棟時から1ヶ月後までの変化量を使用。学習用210名の群内割合を表示。図中の表示値を使用。' };
    rule.sourceUrl = 'https://aichi-npopt.jp/dl/info_paper_back/35_2_15.pdf';
    rule.accuracy = 0.863; rule.sensitivity = 0.814; rule.specificity = 0.595; rule.auc = null;
    def = correctIshinoClassification(def, id);
    reason = '分岐順・境界・群内割合を図2に照合。人数が多い側を支持／困難として集計し、8/16名の同数分岐は判定保留。'; timepoint = 'month1'; rule.consensusEligible = true;
  } else if (id === 30008) {
    location = '本文回帰式・表2'; reason = '運動0.56・認知0.97・年齢−0.26・入院日数−0.16、切片は本文の47.2。入院時評価を分離。線形推定値はFIMの範囲外でも丸めない。';
    def.notes = reason;
  } else if ([60003,60004,60005].includes(id)) {
    location = 'Subjects and Methods・Table 2';
    const metrics = {60003:[0.88,0.79,0.88],60004:[0.79,0.76,0.79],60005:[0.76,0.86,0.87]}[id];
    [rule.sensitivity,rule.specificity,rule.auc] = metrics;
    rule.applyConditions = [condition('months_since_onset','>',6,'研究対象：発症6ヶ月超'),condition('mmse_score','>=',24,'MMSE24点以上'),condition('diabetes','==',false,'糖尿病なし')];
    def.notes = '慢性期の同時点の地域歩行速度の判別。対象75名（地域歩行33名・限定的地域歩行42名）。将来の回復予測ではない。10m歩行可能、重篤な心血管・運動器等の問題がない対象。補助具の扱いに本文と表1の不一致があるため、対象への適合を原著で確認すること。';
    reason = 'Table 2の感度・特異度・AUCに訂正。慢性期・MMSE・糖尿病の条件を追加。';
    rule.consensusEligible = false;
  } else if (id === 60006) {
    rule.source = '妹尾祐太・井上優（2022）理学療法おかやま 3(1):16–24';
    location = '原著p.19 図1';
    def = { type:'decision_tree', outputMode:'descriptive', nodes:[
      branch('root','stroke_type','equals','脳出血','motor','care'),
      branch('motor','fim_motor_total','>',47,'a','b'),
      branch('care','care_level','<=',2,'cognitive','c'),
      branch('cognitive','fim_cognitive_total','>',19,'d','e'),
      leaf('a',100,'13/13名'),leaf('b',8.7,'2/23名'),leaf('c',11.8,'2/17名'),leaf('d',97.4,'37/38名'),leaf('e',42.9,'6/14名'),
    ], notes:'脳梗塞・脳出血105名。入棟時情報から退棟時FIM歩行6点以上を検討。要介護2以下の群がFIM認知で分岐する。要支援・未申請は要介護2以下に含める。' };
    rule.applyConditions = [condition('stroke_type','!=','くも膜下出血','脳梗塞・脳出血のみ'),condition('stroke_type','!=','その他','脳梗塞・脳出血のみ')];
    def = correctSenooClassification(def);
    rule.consensusEligible = true; reason = '要介護分岐・群内割合を図1に照合し、各終端の自立／非自立の人数に対応する支持／困難も返す。';
  } else if (id === 60007) {
    status = 'blocked'; location = '抄録・結果';
    rule.source = 'Kurosaki M, Tosaka M, et al. (2022) Progress in Rehabilitation Medicine 7:20220039';
    reason = 'FIM総点100以上との関連因子の観察研究。3条件をAND結合した歩行自立判定は検証されておらず、アウトカムも異なるため計算対象外。';
  } else if (id === 60008) {
    status = 'blocked'; location = 'Methods・Results';
    rule.source = 'Kimura Y, Yamada M, et al. (2019) J Rehabil Med 51(1):26–31';
    reason = 'USNとMMSE<24の併存に関する関連は報告されているが、併存なしを歩行自立とする二択モデルは検証されていない。参考文献として保持。';
  } else if (id === 60009) {
    status = 'blocked'; location = '抄録・レビューの方法';
    rule.source = 'Preston E, et al. (2021) Stroke 52(10):3217–3224';
    reason = '15研究・2344名の予測因子レビュー。各1点・合計5点のスコアは原著で検証されていないため計算対象外。';
  } else throw new Error(`未登録のレビュー対象: ${id}`);
  if (phases.includes(id)) {
    def = admissionFields(def);
    rule.applyConditions = admissionFields(rule.applyConditions);
    if (def.formula) for (const key of baselineFields) def.formula = def.formula.replace(new RegExp(`\\b${key}\\b`,'g'), `admission_${key}`);
  }
  if (status === 'blocked') rule.consensusEligible = false;
  def.inputTimepoint = timepoint;
  def.evidenceReview = { status, reason, location, sourceUrl: rule.sourceUrl, reviewedAt:'2026-10-07', revision:REVIEW_REVISION };
  rule.ruleDefinition = def;
  return rule;
}
