/**
 * Runs model-written JavaScript against user-written test cases.
 *
 * Isolation: the code runs in a Web Worker created inside a hidden
 * `<iframe sandbox="allow-scripts">` (no allow-same-origin), so it gets an
 * opaque origin — it can't touch this page, its storage, or our API routes
 * with the visitor's cookies. Each test has a time limit; a hung worker is
 * terminated and replaced, so an infinite loop can't freeze the page.
 */

export type TestCase = {
  /** The expression under test, e.g. `add(2, 3)`. */
  actual: string;
  /** Expected-value expression. When absent, `actual` just has to be truthy. */
  expected?: string;
  /** The original line, for display. */
  source: string;
};

export type TestOutcome = {
  pass: boolean;
  got?: string;
  expected?: string;
  error?: string;
  ms?: number;
};

/**
 * One test per line: `expression ==> expected`, or a bare expression that
 * must be truthy. Blank lines and `//` comments are ignored.
 */
export function parseTests(text: string): TestCase[] {
  const tests: TestCase[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;
    const arrow = line.indexOf("==>");
    if (arrow === -1) {
      tests.push({ actual: line, source: line });
    } else {
      tests.push({
        actual: line.slice(0, arrow).trim(),
        expected: line.slice(arrow + 3).trim(),
        source: line,
      });
    }
  }
  return tests;
}

/**
 * Pull the JavaScript out of a model reply and make it runnable as a plain
 * script: prefer a js/ts fenced block, and strip ES-module `export` keywords
 * (the CommonJS `module.exports` case is handled by a shim in the worker).
 */
export function extractJs(raw: string): string | null {
  if (!raw.trim()) return null;
  const fences = [...raw.matchAll(/```(\w+)?\n([\s\S]*?)```/g)];
  const preferred = fences.find((m) =>
    ["js", "javascript", "jsx", "ts", "typescript", "mjs"].includes((m[1] ?? "").toLowerCase()),
  );
  const code = (preferred ?? fences[0])?.[2] ?? raw;
  return code
    .replace(/^(\s*)export\s+(default\s+)?(?=(async\s+)?(function|class|const|let|var)\b)/gm, "$1")
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+[\w$]+\s*;?\s*$/gm, "")
    .trim();
}

// --- Code that runs inside the sandbox. -------------------------------------
// These functions are serialized with .toString(), so they must be fully
// self-contained (no imports or references to module scope).

function workerMain() {
  /**
   * Format a value as a JS literal, like a debugger/console would:
   * `{ a: 1, b: "x" }` on one line when it fits, otherwise indented.
   */
  function fmt(v: unknown): string {
    const s = lit(v, "", [], 0);
    return s.length > 4000 ? s.slice(0, 4000) + "\n…" : s;
  }

  function lit(v: any, ind: string, seen: object[], depth: number): string {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    switch (typeof v) {
      case "string":
        return JSON.stringify(v);
      case "number":
        return Object.is(v, -0) ? "-0" : String(v);
      case "bigint":
        return v + "n";
      case "boolean":
      case "symbol":
        return String(v);
      case "function":
        return (/^class\b/.test(Function.prototype.toString.call(v)) ? "class " : "function ") + (v.name || "anonymous");
    }
    if (v instanceof Date) return "new Date(" + JSON.stringify(isNaN(v.getTime()) ? "Invalid Date" : v.toISOString()) + ")";
    if (v instanceof RegExp) return String(v);
    if (v instanceof Error) return v.name + "(" + JSON.stringify(v.message) + ")";
    if (seen.includes(v)) return "[Circular]";
    if (depth > 6) return Array.isArray(v) ? "[Array]" : "[Object]";

    const next = seen.concat([v]);
    const child = (x: any) => lit(x, ind + "  ", next, depth + 1);
    const MAX_ITEMS = 100;
    let open: string;
    let close: string;
    let items: string[];
    let extra = 0;

    if (Array.isArray(v)) {
      open = "[";
      close = "]";
      items = v.slice(0, MAX_ITEMS).map(child);
      extra = v.length - items.length;
    } else if (v instanceof Map) {
      open = "Map(" + v.size + ") {";
      close = "}";
      const entries = [...v.entries()];
      items = entries.slice(0, MAX_ITEMS).map(([k, x]) => child(k) + " => " + child(x));
      extra = entries.length - items.length;
    } else if (v instanceof Set) {
      open = "Set(" + v.size + ") {";
      close = "}";
      const values = [...v.values()];
      items = values.slice(0, MAX_ITEMS).map(child);
      extra = values.length - items.length;
    } else {
      const ctor = v.constructor && v.constructor !== Object ? v.constructor.name + " " : "";
      open = ctor + "{";
      close = "}";
      const keys = Object.keys(v);
      items = keys
        .slice(0, MAX_ITEMS)
        .map((k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + child(v[k]));
      extra = keys.length - items.length;
    }
    if (extra > 0) items.push("/* … " + extra + " more */");
    if (items.length === 0) return open + close;

    // Widths are sized for the narrow result cards.
    const WIDTH = 44;
    const pad = open.endsWith("{") ? " " : "";
    const oneLine = open + pad + items.join(", ") + pad + close;
    if (oneLine.length + ind.length <= WIDTH && !oneLine.includes("\n")) return oneLine;

    // Lists of short values: pack several per line, like Node's console does.
    if (items.every((s) => s.length <= 14 && !s.includes("\n"))) {
      const lines: string[] = [];
      let line = "";
      for (const s of items) {
        const piece = line ? line + ", " + s : s;
        if (line && piece.length + ind.length + 2 > WIDTH) {
          lines.push(line + ",");
          line = s;
        } else {
          line = piece;
        }
      }
      lines.push(line);
      return open + "\n" + lines.map((l) => ind + "  " + l).join("\n") + "\n" + ind + close;
    }
    return open + "\n" + items.map((s) => ind + "  " + s).join(",\n") + "\n" + ind + close;
  }

  function eq(a: any, b: any): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a === "number" && typeof b === "number") {
      return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    }
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof Map) a = [...a.entries()];
    if (b instanceof Map) b = [...b.entries()];
    if (a instanceof Set) a = [...a.values()];
    if (b instanceof Set) b = [...b.values()];
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
  }

  const SHIM = "var module = { exports: {} }; var exports = module.exports;\n";

  self.onmessage = async (e: MessageEvent) => {
    const { code, test, index } = e.data;
    const t0 = performance.now();
    const out: Record<string, unknown> = { index, pass: false };
    try {
      // Re-evaluate the code for every test so tests can't leak state.
      let actual = (0, eval)(SHIM + code + "\n;(" + test.actual + "\n);");
      if (actual && typeof actual.then === "function") actual = await actual;
      out.got = fmt(actual);
      if (test.expected !== undefined) {
        const expected = (0, eval)("(" + test.expected + "\n)");
        out.expected = fmt(expected);
        out.pass = eq(actual, expected);
      } else {
        out.pass = !!actual;
      }
    } catch (err: any) {
      out.error = err && err.name ? err.name + ": " + err.message : String(err);
    }
    out.ms = performance.now() - t0;
    self.postMessage(out);
  };
}

function frameMain(workerSrc: string, perTestMs: number) {
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const { code, tests } = e.data;
    const url = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
    const results: any[] = [];
    let i = 0;
    let current = -1;
    let w: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (w) w.terminate();
      window.parent.postMessage({ type: "arena-test-results", results }, "*");
    };
    const failCurrent = (msg: string) => {
      results[current] = { index: current, pass: false, error: msg };
    };
    const start = (): boolean => {
      try {
        w = new Worker(url);
      } catch (err) {
        for (let j = 0; j < tests.length; j++) {
          results[j] = { index: j, pass: false, error: "Could not start the test sandbox: " + err };
        }
        finish();
        return false;
      }
      w.onmessage = (ev) => {
        clearTimeout(timer);
        results[ev.data.index] = ev.data;
        next();
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        clearTimeout(timer);
        failCurrent(ev.message || "Uncaught error in test");
        w!.terminate();
        if (start()) next();
      };
      return true;
    };
    const next = () => {
      if (i >= tests.length) return finish();
      current = i++;
      w!.postMessage({ code, test: tests[current], index: current });
      timer = setTimeout(() => {
        w!.terminate();
        failCurrent("Timed out after " + perTestMs / 1000 + "s (infinite loop?)");
        if (start()) next();
      }, perTestMs);
    };

    if (start()) next();
  });
  window.parent.postMessage({ type: "arena-test-ready" }, "*");
}

// ----------------------------------------------------------------------------

const PER_TEST_MS = 2000;

export function runTests(code: string, tests: TestCase[]): Promise<TestOutcome[]> {
  return new Promise((resolve) => {
    if (tests.length === 0) return resolve([]);

    const workerSrc = `(${workerMain.toString()})()`;
    // Escape "<" so nothing in the serialized source can close the <script> tag.
    const arg = JSON.stringify(workerSrc).replace(/</g, "\\u003c");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.display = "none";
    iframe.srcdoc = `<!doctype html><script>(${frameMain.toString()})(${arg}, ${PER_TEST_MS})</script>`;

    let settled = false;
    const settle = (outcomes: TestOutcome[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(safety);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(outcomes);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const data = e.data;
      if (data?.type === "arena-test-ready") {
        iframe.contentWindow!.postMessage({ code, tests }, "*");
      } else if (data?.type === "arena-test-results" && Array.isArray(data.results)) {
        // Only keep the fields we expect, as plain strings/booleans.
        settle(
          tests.map((_, idx) => {
            const r = data.results[idx] ?? {};
            return {
              pass: r.pass === true,
              got: typeof r.got === "string" ? r.got : undefined,
              expected: typeof r.expected === "string" ? r.expected : undefined,
              error: typeof r.error === "string" ? r.error : undefined,
              ms: typeof r.ms === "number" ? r.ms : undefined,
            };
          }),
        );
      }
    };

    // Backstop in case the sandbox never answers at all.
    const safety = setTimeout(
      () => settle(tests.map(() => ({ pass: false, error: "Test sandbox did not respond" }))),
      tests.length * PER_TEST_MS + 5000,
    );

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
}
