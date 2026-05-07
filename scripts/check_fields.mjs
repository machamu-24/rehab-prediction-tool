import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rules] = await conn.execute('SELECT id, name, ruleDefinition FROM literature_rules ORDER BY id');

const extractFields = (def) => {
  if (!def) return [];
  switch (def.type) {
    case 'cutoff':
      return [def.field, ...(def.secondaryConditions || []).map(c => c.field)];
    case 'regression':
      return def.coefficients.map(c => c.field);
    case 'scoring_system':
      return def.items.map(i => i.field);
    case 'nomogram':
      return def.variables.map(v => v.field);
    case 'decision_tree':
      return (def.nodes || []).filter(n => !n.isLeaf).map(n => n.field);
    case 'composite_rule': {
      const extract = (node) => {
        if (!node) return [];
        if (node.logic === 'CONDITION') return [node.field];
        if (node.logic === 'NOT') return extract(node.child);
        return (node.children || []).flatMap(extract);
      };
      return extract(def.root);
    }
    case 'custom_formula':
      return def.variables.map(v => v.field);
    default:
      return [];
  }
};

console.log('=== FIM/BBS/FMA関連フィールドを使用するルール ===');
for (const r of rules) {
  const def = r.ruleDefinition;
  if (!def || typeof def !== 'object') continue;
  const fields = extractFields(def);
  const interesting = fields.filter(f => f && (f.includes('fim') || f.includes('bbs') || f.includes('fma') || f.includes('fugl') || f.includes('delta')));
  if (interesting.length > 0) {
    console.log(`ID ${r.id} | ${r.name}`);
    console.log(`  フィールド: ${interesting.join(', ')}`);
  }
}

console.log('\n=== 全ルールの全フィールド一覧 ===');
const allFields = new Set();
for (const r of rules) {
  const def = r.ruleDefinition;
  if (!def || typeof def !== 'object') continue;
  extractFields(def).forEach(f => f && allFields.add(f));
}
console.log([...allFields].sort().join('\n'));

await conn.end();
