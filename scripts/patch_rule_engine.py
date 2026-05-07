#!/usr/bin/env python3
"""ruleEngine.ts に防御コードを追加するパッチスクリプト"""

with open('server/ruleEngine.ts', 'r') as f:
    content = f.read()

# 1. extractRequiredFields の decision_tree case に防御コード追加
old1 = '    case "decision_tree": {\n      const fieldSet = new Set(def.nodes.filter((n) => !n.isLeaf).map((n) => n.field));\n      return Array.from(fieldSet);\n    }'
new1 = '    case "decision_tree": {\n      if (!Array.isArray(def.nodes)) return [];\n      const fieldSet = new Set(def.nodes.filter((n) => !n.isLeaf).map((n) => n.field));\n      return Array.from(fieldSet);\n    }'
if old1 in content:
    content = content.replace(old1, new1)
    print("Patch 1 applied: extractRequiredFields decision_tree guard")
else:
    print("Patch 1 NOT found - already patched or different content")

# 2. extractRequiredFields の composite_rule case に防御コード追加
old2 = '    case "composite_rule":\n      return extractFieldsFromLogicNode(def.root);'
new2 = '    case "composite_rule":\n      if (!def.root) return [];\n      return extractFieldsFromLogicNode(def.root);'
if old2 in content:
    content = content.replace(old2, new2)
    print("Patch 2 applied: extractRequiredFields composite_rule guard")
else:
    print("Patch 2 NOT found - already patched or different content")

# 3. evalDecisionTree に防御コード追加
old3 = 'function evalDecisionTree(def: DecisionTreeRuleDefinition, inputs: PatientInputs): EvalResult {\n  const nodeMap = new Map<string, DecisionTreeNode>(def.nodes.map((n) => [n.id, n]));\n  const rootNode = def.nodes[0];'
new3 = 'function evalDecisionTree(def: DecisionTreeRuleDefinition, inputs: PatientInputs): EvalResult {\n  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {\n    return { isPositive: false, prediction: "評価不能（ノード定義なし）", probability: null, details: [] };\n  }\n  const nodeMap = new Map<string, DecisionTreeNode>(def.nodes.map((n) => [n.id, n]));\n  const rootNode = def.nodes[0];'
if old3 in content:
    content = content.replace(old3, new3)
    print("Patch 3 applied: evalDecisionTree nodes guard")
else:
    print("Patch 3 NOT found - already patched or different content")

# 4. evalCompositeRule に防御コード追加
old4 = 'function evalCompositeRule(def: CompositeRuleDefinition, inputs: PatientInputs): EvalResult {\n  const details: string[] = [];\n  const isPositive = evalLogicNode(def.root, inputs, details);'
new4 = 'function evalCompositeRule(def: CompositeRuleDefinition, inputs: PatientInputs): EvalResult {\n  const details: string[] = [];\n  if (!def.root) {\n    return { isPositive: false, prediction: "評価不能（ルート条件未定義）", probability: null, details };\n  }\n  const isPositive = evalLogicNode(def.root, inputs, details);'
if old4 in content:
    content = content.replace(old4, new4)
    print("Patch 4 applied: evalCompositeRule root guard")
else:
    print("Patch 4 NOT found - already patched or different content")

with open('server/ruleEngine.ts', 'w') as f:
    f.write(content)

print("Done!")
