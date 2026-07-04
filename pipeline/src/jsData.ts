import vm from "node:vm";

/**
 * Cobblemon's bundled Showdown data ships as CommonJS modules
 * (`exports.Moves = {...}`). These files are part of mod jars you installed
 * yourself - trusted local content, not remote/untrusted input - so
 * evaluating them in a sandboxed vm context (no `require`, no `process`, no
 * filesystem access) is safe and far more robust than hand-rolling a JS
 * object-literal parser.
 */
export function evalCommonJs(code: string): any {
  const sandboxExports: Record<string, any> = {};
  const sandboxModule = { exports: sandboxExports };
  const context = vm.createContext({
    exports: sandboxExports,
    module: sandboxModule,
    global: undefined,
    globalThis: undefined,
  });
  const script = new vm.Script(code, { filename: "showdown-data.js" });
  script.runInContext(context, { timeout: 5000 });
  return context.module.exports && Object.keys(context.module.exports).length
    ? context.module.exports
    : context.exports;
}

/**
 * Cobblemon per-move/per-ability override files (e.g. data/cobblemon/moves/armorpress.js)
 * are a bare object literal, not a full module. Evaluate as an expression.
 */
export function evalObjectLiteral(code: string): any {
  const context = vm.createContext({});
  const script = new vm.Script(`(${code})`, { filename: "override.js" });
  return script.runInContext(context, { timeout: 5000 });
}
