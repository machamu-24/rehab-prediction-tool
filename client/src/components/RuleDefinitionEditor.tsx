import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fieldInfo,
  fieldName,
  fieldOptions,
  isReferenceDraft,
  record,
  rows,
  type RuleDraft,
} from "@/lib/ruleForm";

const selectClass =
  "w-full min-w-0 h-9 rounded-md border bg-background px-2 text-sm";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: unknown;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        className={selectClass}
        value={String(value ?? "")}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">選択してください</option>
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function NumberControl({
  label,
  value,
  onChange,
  scale = 1,
}: {
  label: string;
  value: unknown;
  onChange: (value: number | string) => void;
  scale?: number;
}) {
  const format = (value: unknown) =>
    typeof value === "number"
      ? String(Number((value * scale).toPrecision(12)))
      : String(value ?? "");
  const [text, setText] = useState(() => format(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(format(value));
  }, [value, scale]);
  return (
    <Field label={label}>
      <Input
        inputMode="decimal"
        value={text}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          setText(format(value));
        }}
        onChange={e => {
          const raw = e.target.value;
          setText(raw);
          onChange(
            raw.trim() && Number.isFinite(Number(raw))
              ? Number(raw) / scale
              : raw
          );
        }}
      />
    </Field>
  );
}
function TextControl({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <Field label={label}>
      {multiline ? (
        <Textarea
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <Input
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
export function FieldPicker({
  value,
  onChange,
  label = "評価項目",
}: {
  value: unknown;
  onChange: (field: string) => void;
  label?: string;
}) {
  return (
    <Choice
      label={label}
      value={value}
      onChange={onChange}
      options={[
        ...(!fieldInfo(value) && value
          ? [[String(value), `${String(value)}（登録済みの追加項目）`] as const]
          : []),
        ...fieldOptions.map(field => [field.key, field.label] as const),
      ]}
    />
  );
}
export const predicateOperators = [
  [">=", "以上"],
  [">", "超"],
  ["<=", "以下"],
  ["<", "未満"],
  ["==", "等しい"],
  ["!=", "等しくない"],
  ["boolean", "あり・該当する"],
  ["boolean_negative", "なし・該当しない"],
] as const;

export function PredicateEditor({
  value,
  onChange,
  multiple = false,
  hideField = false,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
  multiple?: boolean;
  hideField?: boolean;
}) {
  const info = fieldInfo(value.field);
  const choices = info?.options ?? [];
  const options = [
    ...new Set([
      ...choices,
      ...(Array.isArray(value.value) ? value.value.map(String) : []),
    ]),
  ];
  const membership = value.operator === "in" || value.operator === "not_in";
  const allowedOperators = predicateOperators.filter(([operator]) =>
    info?.type === "select"
      ? ["==", "!="].includes(operator)
      : info?.type === "boolean"
        ? ["==", "!=", "boolean", "boolean_negative"].includes(operator)
        : info?.type === "number"
          ? !operator.startsWith("boolean")
          : true
  );
  const currentOperator = predicateOperators.find(
    ([operator]) =>
      operator === (value.operator === "equals" ? "==" : value.operator)
  );
  const operators =
    currentOperator && !allowedOperators.includes(currentOperator)
      ? [...allowedOperators, currentOperator]
      : allowedOperators;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {!hideField && (
          <FieldPicker
            value={value.field}
            onChange={field => {
              const item = fieldInfo(field);
              onChange({
                ...value,
                field,
                fieldLabel: item?.label || field,
                operator:
                  item?.type === "select"
                    ? multiple
                      ? "in"
                      : "=="
                    : item?.type === "boolean"
                      ? "boolean"
                      : ">=",
                value:
                  item?.type === "select" && multiple
                    ? []
                    : item?.type === "boolean"
                      ? true
                      : "",
              });
            }}
          />
        )}
        <Choice
          label="条件"
          value={value.operator === "equals" ? "==" : value.operator}
          options={
            multiple && (info?.type === "select" || membership)
              ? [
                  ...operators,
                  ["in", "次のいずれかに一致"],
                  ["not_in", "次のいずれにも一致しない"],
                ]
              : operators
          }
          onChange={operator =>
            onChange({
              ...value,
              operator,
              value: ["in", "not_in"].includes(operator)
                ? Array.isArray(value.value)
                  ? value.value
                  : value.value === "" || value.value === undefined
                    ? []
                    : [value.value]
                : Array.isArray(value.value)
                  ? (value.value[0] ?? "")
                  : value.value,
            })
          }
        />
      </div>
      {membership ? (
        <fieldset className="rounded-md border bg-background p-2 space-y-2">
          <legend className="px-1 text-xs">対象を1つ以上選択</legend>
          {options.length ? (
            <div className="flex flex-wrap gap-3">
              {options.map(option => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      Array.isArray(value.value) && value.value.includes(option)
                    }
                    onChange={e => {
                      const current = Array.isArray(value.value)
                        ? value.value
                        : [];
                      onChange({
                        ...value,
                        value: e.target.checked
                          ? [...current, option]
                          : current.filter(item => item !== option),
                      });
                    }}
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : (
            <TextControl
              label="選択値（1行に1つ）"
              multiline
              value={Array.isArray(value.value) ? value.value.join("\n") : ""}
              onChange={text =>
                onChange({
                  ...value,
                  value: text
                    .split("\n")
                    .map(item => item.trim())
                    .filter(Boolean),
                })
              }
            />
          )}
        </fieldset>
      ) : (
        !["boolean", "boolean_negative"].includes(String(value.operator)) &&
        (info?.type === "select" ? (
          <Choice
            label="比較する値"
            value={value.value}
            options={[
              ...new Set([
                ...choices,
                ...(typeof value.value === "string" && value.value
                  ? [value.value]
                  : []),
              ]),
            ].map(item => [item, item])}
            onChange={next => onChange({ ...value, value: next })}
          />
        ) : info?.type === "boolean" ? (
          <Choice
            label="比較する値"
            value={value.value}
            options={[
              ["true", info.booleanLabels?.true || "あり"],
              ["false", info.booleanLabels?.false || "なし"],
            ]}
            onChange={next =>
              onChange({ ...value, value: next === "" ? "" : next === "true" })
            }
          />
        ) : info?.type === "number" ||
          [">=", ">", "<=", "<"].includes(String(value.operator)) ? (
          <NumberControl
            label="比較する値"
            value={value.value}
            onChange={next => onChange({ ...value, value: next })}
          />
        ) : (
          <TextControl
            label="比較する値"
            value={value.value}
            onChange={next => onChange({ ...value, value: next })}
          />
        ))
      )}
    </div>
  );
}

export function ApplyConditionsEditor({
  value,
  onChange,
}: {
  value: readonly RuleDraft[];
  onChange: (value: RuleDraft[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        各行の条件をすべて満たす患者が対象です。病型などを複数選ぶ場合は「次のいずれかに一致」を選択します。
      </p>
      {value.map((condition, index) => (
        <div
          key={index}
          className="rounded-lg border bg-muted/20 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">適用条件 {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              条件を削除
            </Button>
          </div>
          <PredicateEditor
            multiple
            value={condition}
            onChange={next =>
              onChange(
                value.map((item, i) =>
                  i === index ? { ...next, label: fieldName(next.field) } : item
                )
              )
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() =>
          onChange([...value, { field: "", operator: ">=", value: "" }])
        }
      >
        条件を追加
      </Button>
      {!value.length && (
        <p className="text-xs text-muted-foreground">
          追加の適用条件は設定されていません。原著の対象集団を確認してください。
        </p>
      )}
    </div>
  );
}

export function CutoffExtraConditions({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const def = record(JSON.parse(value));
  const conditions = rows(def.secondaryConditions);
  const update = (next: RuleDraft[]) =>
    onChange(JSON.stringify({ ...def, secondaryConditions: next }, null, 2));
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm font-medium">判定に用いる補助条件（任意）</p>
      <p className="text-xs text-muted-foreground">
        カットオフとすべての補助条件を満たす場合に、支持と判定します。対象集団を限定する条件は「適用条件」に登録してください。
      </p>
      {conditions.map((condition, index) => (
        <div key={index} className="space-y-2 border-t pt-3">
          <PredicateEditor
            value={condition}
            onChange={next =>
              update(conditions.map((item, i) => (i === index ? next : item)))
            }
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => update(conditions.filter((_, i) => i !== index))}
          >
            補助条件を削除
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          update([
            ...conditions,
            { field: "", fieldLabel: "", operator: ">=", value: "" },
          ])
        }
      >
        補助条件を追加
      </Button>
    </div>
  );
}

const newVariable = () => ({ field: "", fieldLabel: "", coefficient: "" });
const newCondition = (): RuleDraft => ({
  logic: "CONDITION",
  field: "",
  operator: ">=",
  value: "",
});
export function emptyRuleDraft(type: string): RuleDraft {
  const messages = { positiveMessage: "", negativeMessage: "" };
  switch (type) {
    case "logistic_regression":
      return {
        type,
        outputMode: "probability",
        intercept: "",
        variables: [newVariable()],
      };
    case "nomogram":
      return {
        type,
        modelType: "reference_only",
        variables: [{ field: "", fieldLabel: "" }],
        evidenceReview: {
          status: "blocked",
          reason:
            "自動計算に必要なモデル情報が未登録のため、原文のノモグラムを参照してください。",
        },
      };
    case "scoring_system":
      return {
        type,
        ...messages,
        threshold: "",
        maxScore: "",
        items: [
          {
            field: "",
            fieldLabel: "",
            bands: [{ operator: ">=", value: "", score: "", label: "" }],
          },
        ],
      };
    case "decision_tree":
      return {
        type,
        outputMode: "binary",
        nodes: [
          {
            id: "root",
            field: "",
            operator: ">=",
            threshold: "",
            trueNodeId: "yes",
            falseNodeId: "no",
          },
          { id: "yes", isLeaf: true, message: "", isPositive: true },
          { id: "no", isLeaf: true, message: "", isPositive: false },
        ],
      };
    case "composite_rule":
      return {
        type,
        ...messages,
        root: { logic: "AND", children: [newCondition()] },
      };
    case "custom_formula":
      return {
        type,
        formula: "",
        formulaDescription: "",
        outputMode: "continuous",
        outputUnit: "",
        variables: [{ field: "", fieldLabel: "" }],
      };
    default:
      return { type };
  }
}

function Messages({
  value,
  onChange,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <TextControl
        label="条件を満たす場合の結果"
        value={value.positiveMessage}
        multiline
        onChange={text => onChange({ ...value, positiveMessage: text })}
      />
      <TextControl
        label="条件を満たさない場合の結果"
        value={value.negativeMessage}
        multiline
        onChange={text => onChange({ ...value, negativeMessage: text })}
      />
    </div>
  );
}

function VariableEditor({
  value,
  onChange,
  coefficients,
  locked = false,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
  coefficients: boolean;
  locked?: boolean;
}) {
  const variables = rows(value.variables);
  const replace = (index: number, next: RuleDraft) =>
    onChange({
      ...value,
      variables: variables.map((item, i) => (i === index ? next : item)),
    });
  return (
    <div className="space-y-3">
      {variables.map((variable, index) => (
        <div
          key={index}
          className="rounded-lg border bg-muted/20 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">評価項目 {index + 1}</p>
            {!locked && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...value,
                    variables: variables.filter((_, i) => i !== index),
                  })
                }
              >
                項目を削除
              </Button>
            )}
          </div>
          {locked ? (
            <p className="text-sm">{fieldName(variable.field)}</p>
          ) : (
            <FieldPicker
              value={variable.field}
              onChange={field => {
                const { categoryMap, ...previous } = variable;
                replace(index, {
                  ...previous,
                  field,
                  fieldLabel: fieldName(field),
                  unit: fieldInfo(field)?.unit,
                  ...(coefficients && fieldInfo(field)?.options
                    ? {
                        categoryMap: Object.fromEntries(
                          fieldInfo(field)!.options!.map(option => [option, ""])
                        ),
                      }
                    : {}),
                });
              }}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextControl
              label="評価項目の表示名"
              value={variable.fieldLabel}
              onChange={fieldLabel =>
                replace(index, { ...variable, fieldLabel })
              }
            />
            {coefficients && (
              <NumberControl
                label="非標準化回帰係数"
                value={variable.coefficient}
                onChange={coefficient =>
                  replace(index, { ...variable, coefficient })
                }
              />
            )}
          </div>
          {coefficients && (
            <>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(variable.categoryMap)}
                  onChange={e => {
                    const { categoryMap, ...previous } = variable;
                    replace(
                      index,
                      e.target.checked
                        ? {
                            ...variable,
                            categoryMap: Object.fromEntries(
                              (
                                fieldInfo(variable.field)?.options ?? [
                                  "true",
                                  "false",
                                ]
                              ).map(option => [option, ""])
                            ),
                          }
                        : previous
                    );
                  }}
                />
                選択項目を数値に変換する（原著の符号化）
              </label>
              {variable.categoryMap != null && (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(record(variable.categoryMap)).map(
                    ([category, number]) => (
                      <NumberControl
                        key={category}
                        label={`${category} の変換値`}
                        value={number}
                        onChange={next =>
                          replace(index, {
                            ...variable,
                            categoryMap: {
                              ...record(variable.categoryMap),
                              [category]: next,
                            },
                          })
                        }
                      />
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {!locked && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              variables: [
                ...variables,
                coefficients ? newVariable() : { field: "", fieldLabel: "" },
              ],
            })
          }
        >
          評価項目を追加
        </Button>
      )}
    </div>
  );
}

function LogicEditor({
  value,
  onChange,
  depth = 0,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
  depth?: number;
}) {
  if (depth > 20)
    return <p className="text-xs">深い階層は詳細編集で確認してください。</p>;
  return (
    <div className="rounded-lg border-l-4 border bg-muted/10 p-3 space-y-3">
      <Choice
        label="条件の組み合わせ"
        value={value.logic}
        options={[
          ["CONDITION", "評価項目で比較"],
          ["AND", "すべて満たす"],
          ["OR", "いずれかを満たす"],
          ["NOT", "満たさない"],
        ]}
        onChange={logic =>
          onChange(
            logic === "CONDITION"
              ? newCondition()
              : logic === "NOT"
                ? { logic, child: newCondition() }
                : { logic, children: [newCondition()] }
          )
        }
      />
      {value.logic === "CONDITION" ? (
        <PredicateEditor value={value} onChange={onChange} />
      ) : value.logic === "NOT" ? (
        <LogicEditor
          value={record(value.child)}
          onChange={child => onChange({ ...value, child })}
          depth={depth + 1}
        />
      ) : (
        <>
          {rows(value.children).map((child, index, children) => (
            <div key={index} className="space-y-1">
              <LogicEditor
                value={child}
                onChange={next =>
                  onChange({
                    ...value,
                    children: children.map((item, i) =>
                      i === index ? next : item
                    ),
                  })
                }
                depth={depth + 1}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...value,
                    children: children.filter((_, i) => i !== index),
                  })
                }
              >
                この条件を削除
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                children: [...rows(value.children), newCondition()],
              })
            }
          >
            条件・グループを追加
          </Button>
        </>
      )}
    </div>
  );
}

function DecisionEditor({
  value,
  onChange,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
}) {
  const nodes = rows(value.nodes);
  const replace = (index: number, next: RuleDraft) =>
    onChange({
      ...value,
      nodes: nodes.map((node, i) => (i === index ? next : node)),
    });
  const targetOptions = nodes.map(
    (node, index) =>
      [
        String(node.id),
        `${index + 1}番：${node.isLeaf ? String(node.message || "結果") : String(node.fieldLabel || fieldName(node.field))}`,
      ] as const
  );
  const add = (leaf: boolean) => {
    let suffix = 1;
    while (nodes.some(node => node.id === `node_${suffix}`)) suffix++;
    onChange({
      ...value,
      nodes: [
        ...nodes,
        leaf
          ? {
              id: `node_${suffix}`,
              isLeaf: true,
              message: "",
              isPositive: null,
            }
          : {
              id: `node_${suffix}`,
              field: "",
              operator: ">=",
              threshold: "",
              trueNodeId: "",
              falseNodeId: "",
            },
      ],
    });
  };
  return (
    <div className="space-y-3">
      <Choice
        label="結果の表示方法"
        value={value.outputMode ?? "binary"}
        options={[
          ["binary", "支持・困難で表示"],
          ["classified", "研究内割合と支持・困難・判定保留"],
          ["descriptive", "研究内割合のみ（集計しない）"],
        ]}
        onChange={outputMode => onChange({ ...value, outputMode })}
      />
      <p className="text-xs text-muted-foreground">
        条件を追加し、満たす場合・満たさない場合の進み先を選択します。研究内割合は患者個人の予測確率ではありません。
      </p>
      <Choice
        label="開始する条件・結果"
        value={nodes[0]?.id}
        options={targetOptions}
        onChange={id =>
          onChange({
            ...value,
            nodes: [
              ...nodes.filter(node => node.id === id),
              ...nodes.filter(node => node.id !== id),
            ],
          })
        }
      />
      {nodes.map((node, index) => (
        <div
          key={String(node.id)}
          className="rounded-lg border bg-muted/20 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {index + 1}番：{node.isLeaf ? "結果" : "分岐条件"}
              {index === 0 ? "（開始）" : ""}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={
                index === 0 ||
                nodes.some(
                  other =>
                    other.trueNodeId === node.id ||
                    other.falseNodeId === node.id
                )
              }
              title="開始位置や分岐先に使っている項目は、先に進み先を変更してください"
              onClick={() =>
                onChange({
                  ...value,
                  nodes: nodes.filter((_, i) => i !== index),
                })
              }
            >
              削除
            </Button>
          </div>
          {node.isLeaf ? (
            <>
              <TextControl
                label="結果の説明"
                multiline
                value={node.message}
                onChange={message => replace(index, { ...node, message })}
              />
              {value.outputMode !== "descriptive" && (
                <Choice
                  label="集計上の分類"
                  value={
                    node.isPositive === true
                      ? "positive"
                      : node.isPositive === false
                        ? "negative"
                        : node.isPositive === null
                          ? "hold"
                          : ""
                  }
                  options={[
                    ["positive", "支持"],
                    ["negative", "困難を示唆"],
                    ...(value.outputMode === "classified"
                      ? [["hold", "判定保留"] as const]
                      : []),
                  ]}
                  onChange={next =>
                    replace(index, {
                      ...node,
                      isPositive:
                        next === "positive"
                          ? true
                          : next === "negative"
                            ? false
                            : null,
                    })
                  }
                />
              )}
              <NumberControl
                label={
                  value.outputMode === "classified" ||
                  value.outputMode === "descriptive"
                    ? "研究内の群別割合（%）"
                    : "研究内の群別割合（%、任意）"
                }
                value={node.probability}
                scale={100}
                onChange={probability => {
                  const next = { ...node };
                  if (probability === "") delete next.probability;
                  else next.probability = probability;
                  replace(index, next);
                }}
              />
            </>
          ) : (
            <>
              <PredicateEditor
                value={{ ...node, value: node.threshold }}
                onChange={next => {
                  const { value: threshold, ...rest } = next;
                  replace(index, { ...rest, threshold });
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Choice
                  label="条件を満たす場合の進み先"
                  value={node.trueNodeId}
                  options={targetOptions.filter(([id]) => id !== node.id)}
                  onChange={trueNodeId =>
                    replace(index, { ...node, trueNodeId })
                  }
                />
                <Choice
                  label="条件を満たさない場合の進み先"
                  value={node.falseNodeId}
                  options={targetOptions.filter(([id]) => id !== node.id)}
                  onChange={falseNodeId =>
                    replace(index, { ...node, falseNodeId })
                  }
                />
              </div>
            </>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => add(false)}>
          分岐条件を追加
        </Button>
        <Button type="button" variant="outline" onClick={() => add(true)}>
          結果を追加
        </Button>
      </div>
    </div>
  );
}

function ScoreEditor({
  value,
  onChange,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
}) {
  const items = rows(value.items);
  const replace = (index: number, next: RuleDraft) =>
    onChange({
      ...value,
      items: items.map((item, i) => (i === index ? next : item)),
    });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        各項目で、上から最初に満たした条件の点数を加算します。どの値にも該当する区分を用意してください。
      </p>
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border p-3 space-y-3">
          <div className="flex justify-between">
            <p className="text-sm font-medium">採点項目 {index + 1}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...value,
                  items: items.filter((_, i) => i !== index),
                })
              }
            >
              項目を削除
            </Button>
          </div>
          <FieldPicker
            value={item.field}
            onChange={field =>
              replace(index, {
                ...item,
                field,
                fieldLabel: fieldName(field),
                unit: fieldInfo(field)?.unit,
              })
            }
          />
          {rows(item.bands).map((band, bandIndex, bands) => (
            <div
              key={bandIndex}
              className="rounded-md bg-muted/30 p-3 space-y-2"
            >
              <p className="text-xs font-medium">区分 {bandIndex + 1}</p>
              <PredicateEditor
                hideField
                value={{ ...band, field: item.field }}
                onChange={next =>
                  replace(index, {
                    ...item,
                    bands: bands.map((entry, i) =>
                      i === bandIndex
                        ? {
                            ...entry,
                            operator: next.operator,
                            value: next.value,
                          }
                        : entry
                    ),
                  })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberControl
                  label="加点"
                  value={band.score}
                  onChange={score =>
                    replace(index, {
                      ...item,
                      bands: bands.map((entry, i) =>
                        i === bandIndex ? { ...entry, score } : entry
                      ),
                    })
                  }
                />
                <TextControl
                  label="区分の説明"
                  value={band.label}
                  onChange={label =>
                    replace(index, {
                      ...item,
                      bands: bands.map((entry, i) =>
                        i === bandIndex ? { ...entry, label } : entry
                      ),
                    })
                  }
                />
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!bandIndex}
                  onClick={() => {
                    const next = [...bands];
                    [next[bandIndex - 1], next[bandIndex]] = [
                      next[bandIndex],
                      next[bandIndex - 1],
                    ];
                    replace(index, { ...item, bands: next });
                  }}
                >
                  上へ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    replace(index, {
                      ...item,
                      bands: bands.filter((_, i) => i !== bandIndex),
                    })
                  }
                >
                  区分を削除
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              replace(index, {
                ...item,
                bands: [
                  ...rows(item.bands),
                  { operator: ">=", value: "", score: "", label: "" },
                ],
              })
            }
          >
            点数区分を追加
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange({
            ...value,
            items: [...items, { field: "", fieldLabel: "", bands: [] }],
          })
        }
      >
        採点項目を追加
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <NumberControl
          label="満点"
          value={value.maxScore}
          onChange={maxScore => onChange({ ...value, maxScore })}
        />
        <NumberControl
          label="合計点の判定閾値"
          value={value.threshold}
          onChange={threshold => onChange({ ...value, threshold })}
        />
      </div>
      <Messages value={value} onChange={onChange} />
    </div>
  );
}

function FormulaEditor({
  value,
  onChange,
}: {
  value: RuleDraft;
  onChange: (value: RuleDraft) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const locked = value.modelType === "koyama_fim_total";
  const insert = (token: string) => {
    const text = String(value.formula ?? "");
    const start = area.current?.selectionStart ?? text.length;
    const end = area.current?.selectionEnd ?? text.length;
    onChange({
      ...value,
      formula: text.slice(0, start) + token + text.slice(end),
    });
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(
        start + token.length,
        start + token.length
      );
    });
  };
  return (
    <div className="space-y-3">
      <VariableEditor
        value={value}
        onChange={onChange}
        coefficients={false}
        locked={locked}
      />
      <TextControl
        label="数式の説明"
        multiline
        value={value.formulaDescription}
        onChange={formulaDescription =>
          onChange({ ...value, formulaDescription })
        }
      />
      {locked ? (
        <p className="text-xs text-muted-foreground">
          この文献は専用モデルのため、計算式と評価項目は固定です。
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            評価項目と演算子を押して式へ挿入し、原著の係数・括弧を入力してください。
          </p>
          <div className="flex flex-wrap gap-1">
            {rows(value.variables)
              .filter(variable => variable.field)
              .map((variable, index) => (
                <Button
                  key={index}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => insert(String(variable.field))}
                >
                  {String(variable.fieldLabel || fieldName(variable.field))}
                </Button>
              ))}
            {[" + ", " - ", " * ", " / ", " ^ ", "(", ")", "ln("].map(token => (
              <Button
                key={token}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => insert(token)}
              >
                {token}
              </Button>
            ))}
          </div>
        </>
      )}
      <Field label="文献の数式">
        <Textarea
          ref={area}
          value={String(value.formula ?? "")}
          readOnly={locked}
          onChange={e => onChange({ ...value, formula: e.target.value })}
        />
      </Field>
      <Choice
        label="結果の表示方法"
        value={value.outputMode ?? "binary"}
        disabled={locked}
        options={[
          ["continuous", "数値予測"],
          ["binary", "文献の閾値で支持・困難を判定"],
        ]}
        onChange={outputMode => onChange({ ...value, outputMode })}
      />
      {value.outputMode === "continuous" ? (
        <TextControl
          label="結果の単位"
          value={value.outputUnit}
          onChange={outputUnit => onChange({ ...value, outputUnit })}
        />
      ) : (
        <>
          <NumberControl
            label="文献の判定閾値"
            value={value.threshold}
            onChange={threshold => onChange({ ...value, threshold })}
          />
          <Messages value={value} onChange={onChange} />
        </>
      )}
    </div>
  );
}

export function RuleDefinitionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const def = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? record(parsed)
        : null;
    } catch {
      return null;
    }
  }, [value]);
  const update = (next: RuleDraft) => onChange(JSON.stringify(next, null, 2));
  const reference = def && isReferenceDraft(def);
  return (
    <div className="space-y-4">
      {def && !advanced && (
        <>
          {def.type === "decision_tree" && (
            <DecisionEditor value={def} onChange={update} />
          )}
          {def.type === "scoring_system" && (
            <ScoreEditor value={def} onChange={update} />
          )}
          {def.type === "composite_rule" && (
            <>
              <LogicEditor
                value={record(def.root)}
                onChange={root => update({ ...def, root })}
              />
              <Messages value={def} onChange={update} />
            </>
          )}
          {def.type === "custom_formula" && (
            <FormulaEditor value={def} onChange={update} />
          )}
          {(def.type === "logistic_regression" || def.type === "nomogram") && (
            <div className="space-y-3">
              {reference ? (
                <>
                  <p className="text-sm font-medium">
                    参考文献として登録（自動計算なし・原文確認）
                  </p>
                  <TextControl
                    label="自動計算しない理由"
                    multiline
                    value={
                      record(def.evidenceReview).reason ||
                      "このノモグラムの自動計算には対応していません。"
                    }
                    onChange={reason =>
                      update({
                        ...def,
                        evidenceReview: {
                          ...record(def.evidenceReview),
                          status: "blocked",
                          reason,
                        },
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    必要な評価項目を登録します。切片や係数の補完は行わず、支持・困難の集計には含めません。自動計算できるロジスティックモデルは「ロジスティック回帰」で登録できます。
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    切片と非標準化回帰係数を原著から入力してください。オッズ比や標準化係数をそのまま入力しません。
                  </p>
                  <NumberControl
                    label="切片"
                    value={def.intercept}
                    onChange={intercept => update({ ...def, intercept })}
                  />
                  <Choice
                    label="結果の表示方法"
                    value={def.outputMode ?? "binary"}
                    options={[
                      ["probability", "確率のみ（支持・困難に分類しない）"],
                      ["binary", "文献の閾値で支持・困難を判定"],
                    ]}
                    onChange={outputMode => update({ ...def, outputMode })}
                  />
                </>
              )}
              <VariableEditor
                value={def}
                onChange={update}
                coefficients={!reference}
              />
              {!reference && def.outputMode !== "probability" && (
                <>
                  <NumberControl
                    label="文献の確率判定閾値（%）"
                    scale={100}
                    value={
                      def.probabilityThreshold ??
                      (def.type === "nomogram" && def.outputMode === undefined
                        ? 0.5
                        : undefined)
                    }
                    onChange={probabilityThreshold =>
                      update({ ...def, probabilityThreshold })
                    }
                  />
                  {def.type === "nomogram" &&
                    def.outputMode === undefined &&
                    def.probabilityThreshold === undefined && (
                      <p className="text-xs text-muted-foreground">
                        この既存ルールは従来の50%閾値で動作しています。原著の閾値を確認してください。
                      </p>
                    )}
                  <Messages value={def} onChange={update} />
                </>
              )}
            </div>
          )}
          <TextControl
            label="文献の概要・説明"
            multiline
            value={def.description}
            onChange={description => update({ ...def, description })}
          />
          <TextControl
            label="文献の注記・適用上の注意"
            multiline
            value={def.notes}
            onChange={notes => update({ ...def, notes })}
          />
        </>
      )}
      {!def && (
        <p className="text-sm text-destructive">
          詳細編集の内容を確認してください。正しい形式に戻すとフォームで編集できます。
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAdvanced(!advanced)}
      >
        {advanced ? "フォーム入力へ戻る" : "詳細編集（JSON）を開く"}
      </Button>
      {(advanced || !def) && (
        <TextControl
          label="ルール定義（JSON・詳細編集）"
          multiline
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}
