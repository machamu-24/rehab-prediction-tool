/** Keep saved conditions intact while presenting membership choices in Japanese. */
export function applyConditionLabel(condition: { field: string; label?: string; operator: string; value?: unknown }): string {
  const label = condition.label || condition.field;
  if ((condition.operator === "in" || condition.operator === "not_in") && Array.isArray(condition.value))
    return `${label}：${condition.value.join(" または ")}${condition.operator === "in" ? "のいずれか" : "を除く"}`;
  return `${label} ${condition.operator} ${condition.value ?? ""}`.trim();
}
