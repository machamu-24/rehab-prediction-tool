import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getFimTotalCalculation, withCalculatedFimTotals } from "../shared/patientFimTotals";
import { patientInputsSchema } from "../shared/patientValidation";
import { FimTotalCalculation } from "../client/src/components/FimTotalCalculation";
import { PatientNumberInput } from "../client/src/components/PatientNumberInput";

describe("同じ評価時点のFIM総得点の自動計算", () => {
  it.each([[13, 5, 18], [40, 20, 60], [91, 35, 126]])(
    "運動%d点＋認知%d点＝総得点%d点を入院時・現在で計算する",
    (motor, cognitive, total) => {
      const entered = {
        admission_fim_motor_total: String(motor), admission_fim_cognitive_total: String(cognitive),
        fim_motor_total: motor, fim_cognitive_total: cognitive,
      };
      const result = withCalculatedFimTotals(entered);
      expect(result).toMatchObject({ admission_fim_total: total, fim_total: total });
      expect(entered).not.toHaveProperty("admission_fim_total");
    }
  );

  it("異なる評価時点の運動と認知を足し合わせない", () => {
    const result = withCalculatedFimTotals({ admission_fim_motor_total: 40, fim_cognitive_total: 20 });
    expect(result.admission_fim_total).toBeUndefined();
    expect(result.fim_total).toBeUndefined();
  });

  it("両方そろったら手入力の総得点を合計へ更新し、点数変更にも追従する", () => {
    const entered = { admission_fim_motor_total: 25, admission_fim_cognitive_total: 15, admission_fim_total: 60 };
    const calculated = withCalculatedFimTotals(entered);
    expect(calculated.admission_fim_total).toBe(40);
    expect(patientInputsSchema.safeParse(calculated).success).toBe(true);
    expect(withCalculatedFimTotals({ ...entered, admission_fim_motor_total: 30 }).admission_fim_total).toBe(45);
    expect(withCalculatedFimTotals(JSON.parse(JSON.stringify(entered))).admission_fim_total).toBe(40);
  });

  it("片方の未入力・削除・入力途中では計算せず、総得点だけの手入力を利用できる", () => {
    for (const cognitive of [undefined, "", "1"])
      expect(withCalculatedFimTotals({ admission_fim_motor_total: 25, admission_fim_cognitive_total: cognitive }).admission_fim_total).toBeUndefined();
    expect(withCalculatedFimTotals({ admission_fim_total: "40" }).admission_fim_total).toBe("40");
    expect(withCalculatedFimTotals({ admission_fim_motor_total: 25, admission_fim_total: "40" }).admission_fim_total).toBe("40");
  });

  it("範囲外・小数・不正な型や空白文字をスコアとして足さない", () => {
    for (const motor of [12, 92, 30.5, false, " ", "30x", Infinity, NaN])
      expect(withCalculatedFimTotals({ admission_fim_motor_total: motor, admission_fim_cognitive_total: 15 }).admission_fim_total).toBeUndefined();
    for (const cognitive of [4, 36, 15.5, true, " ", Infinity])
      expect(withCalculatedFimTotals({ admission_fim_motor_total: 25, admission_fim_cognitive_total: cognitive }).admission_fim_total).toBeUndefined();
  });

  it("計算内訳を表示し、自動計算中の総得点欄を読み取り専用にする", () => {
    const inputs = { admission_fim_motor_total: 25, admission_fim_cognitive_total: 15 };
    const calculation = getFimTotalCalculation(inputs, "admission_fim_total");
    const html = renderToStaticMarkup(createElement(FimTotalCalculation, { inputs, field: "admission_fim_total" }));
    expect(html).toContain("自動計算：運動25点 ＋ 認知15点 ＝ 40点");
    const field = renderToStaticMarkup(createElement(PatientNumberInput, {
      fieldKey: "admission_fim_total", value: calculation?.total,
      readOnly: !!calculation, onValueChange: () => {},
    }));
    expect(field).toContain('readOnly=""');
    expect(field).toContain('value="40"');
    expect(renderToStaticMarkup(createElement(FimTotalCalculation, { inputs: {}, field: "admission_fim_total" }))).toBe("");
  });
});
