// Minimal, safe evaluator for the small subset of Molang expressions that
// show up in Bedrock Pokemon animation files (arithmetic, math.sin/cos/clamp/
// etc., ternaries). We only ever need one instant of an idle/standing loop
// (anim_time = 0) for a static render, so any query we can't resolve
// (q.life_time, variable.xxx, entity state, ...) safely evaluates to 0 -
// worst case that bone just keeps its bind-pose rotation, same as before
// this feature existed.

type Token = { type: "num" | "id" | "op" | "punct"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "num", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_.]/.test(src[j])) j++;
      tokens.push({ type: "id", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/,?:()".includes(ch)) {
      tokens.push({ type: ch === "(" || ch === ")" || ch === "," ? "punct" : "op", value: ch });
      i++;
      continue;
    }
    // Unknown character (comparison operators, brackets, etc. we don't need) - skip it.
    i++;
  }
  return tokens;
}

const MATH_FNS: Record<string, (...args: number[]) => number> = {
  "math.sin": (x) => Math.sin(((x ?? 0) * Math.PI) / 180),
  "math.cos": (x) => Math.cos(((x ?? 0) * Math.PI) / 180),
  "math.abs": (x) => Math.abs(x ?? 0),
  "math.sqrt": (x) => Math.sqrt(x ?? 0),
  "math.floor": (x) => Math.floor(x ?? 0),
  "math.ceil": (x) => Math.ceil(x ?? 0),
  "math.round": (x) => Math.round(x ?? 0),
  "math.min": (a, b) => Math.min(a ?? 0, b ?? 0),
  "math.max": (a, b) => Math.max(a ?? 0, b ?? 0),
  "math.clamp": (x, lo, hi) => Math.min(Math.max(x ?? 0, Math.min(lo ?? 0, hi ?? 0)), Math.max(lo ?? 0, hi ?? 0)),
  "math.pi": () => Math.PI,
};

// Everything under these namespaces is runtime entity state we have no static
// value for (anim_time aside) - treat as neutral/0 rather than failing.
const ZERO_NAMESPACES = ["q.", "query.", "v.", "variable.", "t.", "temp.", "c.", "context."];

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek() {
    return this.tokens[this.pos];
  }
  private next() {
    return this.tokens[this.pos++];
  }

  parseExpression(): number {
    return this.parseTernary();
  }

  private parseTernary(): number {
    const cond = this.parseAdditive();
    if (this.peek()?.value === "?") {
      this.next();
      const whenTrue = this.parseTernary();
      if (this.peek()?.value === ":") this.next();
      const whenFalse = this.parseTernary();
      return cond ? whenTrue : whenFalse;
    }
    return cond;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (this.peek()?.value === "+" || this.peek()?.value === "-") {
      const op = this.next().value;
      const rhs = this.parseMultiplicative();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (this.peek()?.value === "*" || this.peek()?.value === "/") {
      const op = this.next().value;
      const rhs = this.parseUnary();
      value = op === "*" ? value * rhs : value / (rhs || 1e-9);
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peek()?.value === "-") {
      this.next();
      return -this.parseUnary();
    }
    if (this.peek()?.value === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.peek();
    if (!tok) return 0;
    if (tok.type === "num") {
      this.next();
      return parseFloat(tok.value);
    }
    if (tok.value === "(") {
      this.next();
      const value = this.parseTernary();
      if (this.peek()?.value === ")") this.next();
      return value;
    }
    if (tok.type === "id") {
      this.next();
      const name = tok.value;
      if (this.peek()?.value === "(") {
        this.next();
        const args: number[] = [];
        if (this.peek()?.value !== ")") {
          args.push(this.parseTernary());
          while (this.peek()?.value === ",") {
            this.next();
            args.push(this.parseTernary());
          }
        }
        if (this.peek()?.value === ")") this.next();
        const fn = MATH_FNS[name];
        return fn ? fn(...args) : 0;
      }
      if (name === "q.anim_time" || name === "query.anim_time") return 0;
      if (ZERO_NAMESPACES.some((ns) => name.startsWith(ns))) return 0;
      return 0;
    }
    // Anything unexpected - bail out to 0 rather than throwing.
    this.next();
    return 0;
  }
}

/** Evaluate a Molang expression at anim_time = 0. Never throws - returns 0 on anything unrecognized. */
export function evalMolangAtRest(expr: string): number {
  try {
    const parser = new Parser(tokenize(expr));
    const value = parser.parseExpression();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** A bone's rotation/position/scale field can be a plain number, or a Molang string expression. */
export function resolveMolangValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return evalMolangAtRest(value);
  return 0;
}
