/** Arithmetic and natural logarithms only; no JavaScript evaluation. */
export function evaluateFormula(expression: string, variables: Record<string, number>): number {
  if (expression.length > 4096) throw new Error("数式が長すぎます");
  const tokens: string[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([a-zA-Z_][a-zA-Z0-9_]*)|([+\-*/^()]))/y;
  let offset = 0;
  while (offset < expression.length) {
    if (!expression.slice(offset).trim()) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(expression);
    if (!match) throw new Error("数式に不正な文字があります");
    tokens.push(match[1] ?? match[2] ?? match[3]);
    offset = pattern.lastIndex;
  }
  let position = 0;
  let depth = 0;
  const finite = (n: number) => {
    if (!Number.isFinite(n)) throw new Error("計算結果が有限の数値ではありません");
    return n;
  };
  function primary(): number {
    if (++depth > 128) throw new Error("数式の入れ子が深すぎます");
    try {
      const token = tokens[position++];
      if (token === "(") {
        const value = sum();
        if (tokens[position++] !== ")") throw new Error("括弧が閉じていません");
        return value;
      }
      if (token && /^[a-zA-Z_]/.test(token)) {
        if (token === "ln" && tokens[position] === "(") {
          position++;
          const argument = sum();
          if (tokens[position++] !== ")") throw new Error("括弧が閉じていません");
          if (argument <= 0) throw new Error("自然対数の引数は正の数にしてください");
          return finite(Math.log(argument));
        }
        if (!Object.hasOwn(variables, token)) throw new Error(`未定義の変数: ${token}`);
        return finite(variables[token]);
      }
      if (!token || !/^(\d|\.)/.test(token)) throw new Error("数値が必要です");
      return finite(Number(token));
    } finally { depth--; }
  }
  function power(): number {
    const base = primary();
    if (tokens[position] === "^") { position++; return finite(base ** unary()); }
    return base;
  }
  function unary(): number {
    if (++depth > 128) throw new Error("数式の入れ子が深すぎます");
    try {
      if (tokens[position] === "+") { position++; return unary(); }
      if (tokens[position] === "-") { position++; return -unary(); }
      return power();
    } finally { depth--; }
  }
  function product(): number {
    let value = unary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const right = unary();
      value = finite(operator === "*" ? value * right : value / right);
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = product();
      value = finite(operator === "+" ? value + right : value - right);
    }
    return value;
  }
  const result = finite(sum());
  if (position !== tokens.length) throw new Error("数式の末尾に不正な項目があります");
  return result;
}
