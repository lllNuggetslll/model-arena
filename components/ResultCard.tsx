"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractHtml, extractSvg, stripSoleFence } from "@/lib/extract";
import type { RenderKind } from "@/lib/modes";
import { extractJs, runTests, type TestCase, type TestOutcome } from "@/lib/testrunner";
import { highlight, type HighlightLang } from "@/lib/highlight";

export type GenStatus = "idle" | "streaming" | "done" | "error";

export type Result = {
  text: string;
  status: GenStatus;
  error?: string;
  startedAt?: number;
  firstTokenAt?: number;
  finishedAt?: number;
};

type Tab = "preview" | "code";

/** Rough token estimate (~4 chars/token) — good enough for relative comparison. */
function approxTokens(text: string) {
  return Math.round(text.length / 4);
}

function StatusBadge({ status }: { status: GenStatus }) {
  const map: Record<GenStatus, { label: string; cls: string }> = {
    idle: { label: "idle", cls: "text-slate-400 bg-slate-500/10" },
    streaming: { label: "generating", cls: "text-amber-300 bg-amber-500/10" },
    done: { label: "done", cls: "text-emerald-300 bg-emerald-500/10" },
    error: { label: "error", cls: "text-rose-300 bg-rose-500/10" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status === "streaming" && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse-dot" />
      )}
      {label}
    </span>
  );
}

export function ResultCard({
  modelId,
  modelName,
  result,
  render,
  tests = [],
}: {
  modelId: string;
  modelName: string;
  result: Result;
  render: RenderKind;
  /** Test cases to run against the reply (Code Tests mode only). */
  tests?: TestCase[];
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [committedHtml, setCommittedHtml] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [testRun, setTestRun] = useState<{ running: boolean; outcomes: TestOutcome[] | null }>({
    running: false,
    outcomes: null,
  });
  const testRunId = useRef(0);

  const jsCode = useMemo(() => (render === "tests" ? extractJs(result.text) : null), [result.text, render]);

  const liveHtml = useMemo(() => {
    if (render === "markdown" || render === "tests") return null;
    return render === "svg" ? extractSvg(result.text) : extractHtml(result.text);
  }, [result.text, render]);
  const code = useMemo(() => stripSoleFence(result.text), [result.text]);
  const view = useMemo(() => codeView(result.text, render, jsCode), [result.text, render, jsCode]);

  async function executeTests() {
    if (!jsCode || tests.length === 0) return;
    const runId = ++testRunId.current;
    setTestRun({ running: true, outcomes: null });
    const outcomes = await runTests(jsCode, tests);
    // Ignore results from a run that has since been superseded.
    if (runId === testRunId.current) setTestRun({ running: false, outcomes });
  }

  // Run the tests automatically once the model finishes writing its code, and
  // clear old scores when a new generation starts.
  useEffect(() => {
    if (render !== "tests") return;
    if (result.status === "done") {
      executeTests();
    } else {
      testRunId.current++;
      setTestRun({ running: false, outcomes: null });
    }
  }, [render, result.status]);

  // Commit the preview once when generation finishes so the iframe doesn't
  // reload on every streamed token.
  useEffect(() => {
    if (result.status === "done") {
      setCommittedHtml(liveHtml);
      setNonce((n) => n + 1);
    }
  }, [result.status, liveHtml]);

  const elapsed =
    result.startedAt && result.finishedAt
      ? ((result.finishedAt - result.startedAt) / 1000).toFixed(1) + "s"
      : result.startedAt && result.status === "streaming"
        ? "…"
        : null;

  const ttft =
    result.startedAt && result.firstTokenAt
      ? ((result.firstTokenAt - result.startedAt) / 1000).toFixed(1) + "s"
      : null;
  const tokens = approxTokens(result.text);
  const genSeconds =
    result.firstTokenAt && result.finishedAt ? (result.finishedAt - result.firstTokenAt) / 1000 : 0;
  const tokPerSec = result.status === "done" && genSeconds > 0.2 ? Math.round(tokens / genSeconds) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code || result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  const passed = testRun.outcomes?.filter((o) => o.pass).length ?? 0;
  const total = testRun.outcomes?.length ?? 0;

  function runPreview() {
    if (render === "tests") {
      setTab("preview");
      executeTests();
      return;
    }
    setCommittedHtml(liveHtml);
    setNonce((n) => n + 1);
    setTab("preview");
  }

  return (
    <div className="flex h-[560px] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100" title={modelName}>
            {modelName}
          </div>
          <div className="truncate font-mono text-[11px] text-slate-500" title={modelId}>
            {modelId}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {elapsed && <span className="font-mono text-[11px] text-slate-500">{elapsed}</span>}
          {render === "tests" && testRun.outcomes && total > 0 && <ScoreChip passed={passed} total={total} />}
          <StatusBadge status={result.status} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface/40 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            {render === "markdown" ? "Response" : render === "tests" ? "Tests" : "Preview"}
          </TabButton>
          <TabButton active={tab === "code"} onClick={() => setTab("code")}>
            {render === "markdown" ? "Raw" : "Code"}
          </TabButton>
        </div>
        <div className="flex items-center gap-1">
          {render !== "markdown" && (
          <button
            onClick={runPreview}
            disabled={render === "tests" ? !jsCode || tests.length === 0 || testRun.running : !liveHtml}
            className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/40 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              render === "tests"
                ? "Re-run the tests against this code"
                : "Render the latest code in the preview"
            }
          >
            ⟳ Run
          </button>
          )}
          <button
            onClick={copy}
            disabled={!result.text}
            className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative min-h-0 flex-1">
        {result.status === "error" ? (
          <div className="h-full overflow-auto scroll-thin p-4 text-sm text-rose-300">
            <div className="font-semibold">Request failed</div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-rose-200/80">
              {result.error || "Unknown error"}
            </pre>
          </div>
        ) : tab === "preview" && render === "markdown" ? (
          <div className="markdown h-full overflow-auto scroll-thin p-4 text-sm leading-relaxed text-slate-200">
            {result.text ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                }}
              >
                {result.text}
              </ReactMarkdown>
            ) : (
              <span className="text-slate-500">
                {result.status === "streaming" ? "Waiting for first token…" : "Run a prompt to see the result here."}
              </span>
            )}
            {result.status === "streaming" && result.text && <span className="animate-pulse-dot">▋</span>}
          </div>
        ) : tab === "preview" && render === "tests" ? (
          <TestsPane
            status={result.status}
            hasCode={!!jsCode}
            tests={tests}
            running={testRun.running}
            outcomes={testRun.outcomes}
          />
        ) : tab === "preview" ? (
          <PreviewPane html={committedHtml} nonce={nonce} status={result.status} hasLive={!!liveHtml} />
        ) : (
          <pre className="h-full overflow-auto scroll-thin bg-[#1e1e1e] p-3 font-mono text-[12px] leading-relaxed">
            {result.text ? (
              <Code code={view.code} lang={view.lang} />
            ) : (
              <span className="text-slate-500">Waiting for output…</span>
            )}
            {result.status === "streaming" && <span className="animate-pulse-dot">▋</span>}
          </pre>
        )}
      </div>

      {/* Stats */}
      {result.startedAt && result.status !== "error" && (
        <div className="flex items-center gap-3 border-t border-surface-border px-3 py-1.5 font-mono text-[11px] text-slate-500">
          <span title="Time to first token">TTFT {ttft ?? "…"}</span>
          <span title="Approximate output tokens (~4 chars/token)">~{tokens.toLocaleString()} tok</span>
          {tokPerSec !== null && <span title="Approximate output speed">~{tokPerSec} tok/s</span>}
        </div>
      )}
    </div>
  );
}

function ScoreChip({ passed, total }: { passed: number; total: number }) {
  const cls =
    passed === total
      ? "text-emerald-300 bg-emerald-500/10"
      : passed === 0
        ? "text-rose-300 bg-rose-500/10"
        : "text-amber-300 bg-amber-500/10";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${cls}`} title="Tests passed">
      {passed}/{total}
    </span>
  );
}

function TestsPane({
  status,
  hasCode,
  tests,
  running,
  outcomes,
}: {
  status: GenStatus;
  hasCode: boolean;
  tests: TestCase[];
  running: boolean;
  outcomes: TestOutcome[] | null;
}) {
  const message =
    status === "streaming"
      ? "Writing code… tests run when it finishes"
      : status !== "done"
        ? "Run a prompt to see the result here."
        : tests.length === 0
          ? "No test cases defined — add some under the prompt."
          : !hasCode
            ? "No code found in this response."
            : running || !outcomes
              ? "Running tests…"
              : null;
  if (message || !outcomes) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
        <span className={status === "streaming" || running ? "animate-pulse-dot" : ""}>{message}</span>
      </div>
    );
  }

  const passed = outcomes.filter((o) => o.pass).length;
  const pct = Math.round((passed / outcomes.length) * 100);
  return (
    <div className="h-full overflow-auto scroll-thin p-3">
      <div className="mb-3 flex items-center gap-3">
        <div className="text-2xl font-bold text-white">
          {passed}
          <span className="text-slate-500">/{outcomes.length}</span>
        </div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : pct === 0 ? "bg-rose-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="font-mono text-xs text-slate-400">{pct}%</div>
      </div>
      <ul className="space-y-2">
        {outcomes.map((o, i) => (
          <li
            key={i}
            className={`overflow-hidden rounded-lg border font-mono text-[11.5px] ${
              o.pass ? "border-emerald-500/20" : "border-rose-500/30"
            }`}
          >
            {/* The expression under test, like a line in the editor. */}
            <div
              className={`flex items-start gap-2 px-2.5 py-1.5 ${o.pass ? "bg-emerald-500/5" : "bg-rose-500/5"}`}
            >
              <span className={`shrink-0 font-bold ${o.pass ? "text-emerald-400" : "text-rose-400"}`}>
                {o.pass ? "✓" : "✗"}
              </span>
              <Code
                code={tests[i]?.actual ?? ""}
                lang="javascript"
                className="min-w-0 flex-1 whitespace-pre-wrap break-all"
              />
              {o.ms !== undefined && (
                <span className="shrink-0 text-[10px] text-slate-600">{o.ms < 1 ? "<1" : Math.round(o.ms)}ms</span>
              )}
            </div>
            {/* Values, like a debugger / test-runner panel. */}
            <div className="space-y-1 border-t border-white/5 bg-[#1e1e1e] px-2.5 py-1.5">
              {o.error ? (
                <ValueRow label="Threw" tone="error">
                  <span className="whitespace-pre-wrap break-all text-[#f48771]">{o.error}</span>
                </ValueRow>
              ) : (
                <>
                  {!o.pass && o.expected !== undefined && (
                    <ValueRow label="Expected" tone="expected">
                      <Code code={o.expected} lang="javascript" className="whitespace-pre-wrap break-all" />
                    </ValueRow>
                  )}
                  <ValueRow label={o.pass ? "Returned" : "Received"} tone={o.pass ? "neutral" : "error"}>
                    <Code code={o.got ?? ""} lang="javascript" className="whitespace-pre-wrap break-all" />
                  </ValueRow>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Syntax-highlighted code, IDE colors (see .hljs-* in globals.css). */
function Code({ code, lang, className = "" }: { code: string; lang: HighlightLang; className?: string }) {
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  return <code className={`hljs ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ValueRow({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "expected" | "error" | "neutral";
  children: React.ReactNode;
}) {
  const color = tone === "expected" ? "text-emerald-400" : tone === "error" ? "text-rose-400" : "text-slate-500";
  return (
    <div className="flex items-start gap-2">
      <span className={`w-16 shrink-0 select-none text-[10px] uppercase leading-[1.7] tracking-wide ${color}`}>
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Decide what the Code tab shows and how to highlight it: the inside of a
 * sole fenced block (even while it's still streaming) in the mode's language,
 * otherwise the whole reply as markdown.
 */
function codeView(text: string, render: RenderKind, jsCode: string | null): { code: string; lang: HighlightLang } {
  const modeLang: HighlightLang =
    render === "tests" ? "javascript" : render === "markdown" ? "markdown" : "xml";
  const fence = text.trim().match(/^```([\w-]*)[^\n]*\n([\s\S]*?)(?:\n```\s*)?$/);
  if (render !== "markdown" && fence && !fence[2].includes("\n```")) {
    const tag = fence[1].toLowerCase();
    const lang: HighlightLang = ["js", "javascript", "jsx", "ts", "typescript", "mjs"].includes(tag)
      ? "javascript"
      : ["html", "svg", "xml"].includes(tag)
        ? "xml"
        : tag === "css"
          ? "css"
          : modeLang;
    return { code: fence[2], lang };
  }
  if (render === "tests" && jsCode) return { code: jsCode, lang: "javascript" };
  return { code: text, lang: "markdown" };
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
        active ? "bg-accent/20 text-indigo-200" : "text-slate-400 hover:bg-slate-700/30 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function PreviewPane({
  html,
  nonce,
  status,
  hasLive,
}: {
  html: string | null;
  nonce: number;
  status: GenStatus;
  hasLive: boolean;
}) {
  if (status === "streaming" && !html) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        <span className="animate-pulse-dot">Generating… preview appears when finished</span>
      </div>
    );
  }
  if (!html) {
    if (status === "done") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
          <span>Nothing renderable detected in this response.</span>
          {hasLive ? null : <span className="text-xs">Open the Code tab to read the raw output.</span>}
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Run a prompt to see the result here.
      </div>
    );
  }
  return (
    <iframe
      key={nonce}
      srcDoc={html}
      title="preview"
      className="h-full w-full bg-white"
      // Isolated origin: scripts run, but the generated code cannot touch the
      // parent page. (No allow-same-origin on purpose.)
      sandbox="allow-scripts allow-pointer-lock allow-modals allow-popups"
    />
  );
}
