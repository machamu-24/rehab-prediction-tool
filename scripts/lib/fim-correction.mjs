export const FIM_SOURCE_URL = "https://www.jstage.jst.go.jp/article/rigaku/53/2/53_25-12662/_html/-char/ja";
export const FIM_FORMULA = "fim_motor_discharge = fim_motor_total * 0.56 + fim_cognitive_total * 0.97 - age * 0.26 - days_onset_to_admission * 0.16 + 47.2";

/** Only repair the known imported model; never overwrite a different/custom model. */
export function correctFimDefinition(input) {
  const def = structuredClone(input);
  const coefficients = def?.coefficients;
  if (def?.type !== "regression" || def.intercept !== 47.2 || !Array.isArray(coefficients) || coefficients.length !== 4) {
    throw new Error("既知のFIMモデルと定義が異なります。変更せずに停止しました。");
  }
  const find = field => coefficients.find(c => c.field === field);
  const motor = find("fim_motor_total");
  const cognitive = find("fim_cognitive_total");
  const isSwapped = motor?.coefficient === 0.97 && cognitive?.coefficient === 0.56;
  const isCorrect = motor?.coefficient === 0.56 && cognitive?.coefficient === 0.97;
  if ((!isSwapped && !isCorrect) || find("age")?.coefficient !== -0.26 || find("days_onset_to_admission")?.coefficient !== -0.16) {
    throw new Error("FIM係数が既知の値と異なります。変更せずに停止しました。");
  }
  motor.coefficient = 0.56;
  cognitive.coefficient = 0.97;
  def.formula = FIM_FORMULA;
  def.outputMode = "continuous";
  def.outputUnit = "点";
  // The paper specifies a continuous estimate, not a binary cutoff.
  delete def.threshold;
  delete def.positiveMessage;
  delete def.negativeMessage;
  def.verification = {
    sourceUrl: FIM_SOURCE_URL,
    location: "本文の回帰式および表2。切片は本文記載の47.2を採用。",
    revision: "fim-coefficients-v1",
  };
  return def;
}
