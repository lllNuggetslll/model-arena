"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenRouterModel } from "@/lib/openrouter";
import { ModelPicker } from "@/components/ModelPicker";
import { ResultCard, type Result } from "@/components/ResultCard";
import { MODES, getMode, type ModeId } from "@/lib/modes";
import { parseTests, type TestCase } from "@/lib/testrunner";

const MAX_MODELS = 6;

// Preferred defaults — intersected with whatever OpenRouter currently offers.
const PREFERRED_DEFAULTS = [
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
  "meta-llama/llama-3.3-70b-instruct",
];

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [modeId, setModeId] = useState<ModeId>("game");
  const [prompt, setPrompt] = useState(MODES[0].examples[0].text);
  // The mode the current results were generated with, so switching modes
  // afterwards doesn't re-render old results the wrong way.
  const [runModeId, setRunModeId] = useState<ModeId>("game");
  // Code Tests mode: one test per line, and whether models get to see them.
  const [testsText, setTestsText] = useState(getMode("tests").examples[0].tests ?? "");
  const [shareTests, setShareTests] = useState(false);
  // Tests snapshotted at run time, so editing the box doesn't re-score old code.
  const [runTests, setRunTests] = useState<TestCase[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mode = getMode(modeId);
  const parsedTests = useMemo(() => parseTests(testsText), [testsText]);

  // Restore persisted settings.
  useEffect(() => {
    try {
      const k = localStorage.getItem("or_api_key");
      if (k) setApiKey(k);
      const sel = localStorage.getItem("or_selected");
      if (sel) setSelected(JSON.parse(sel));
      const p = localStorage.getItem("or_prompt");
      if (p) setPrompt(p);
      const m = localStorage.getItem("or_mode");
      if (m) setModeId(getMode(m).id);
      const t = localStorage.getItem("or_tests");
      if (t !== null) setTestsText(t);
      setShareTests(localStorage.getItem("or_share_tests") === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist settings.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("or_api_key", apiKey);
      localStorage.setItem("or_selected", JSON.stringify(selected));
      localStorage.setItem("or_prompt", prompt);
      localStorage.setItem("or_mode", modeId);
      localStorage.setItem("or_tests", testsText);
      localStorage.setItem("or_share_tests", shareTests ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [apiKey, selected, prompt, modeId, testsText, shareTests, hydrated]);

  const applyExample = useCallback((ex: { text: string; tests?: string }) => {
    setPrompt(ex.text);
    if (ex.tests !== undefined) setTestsText(ex.tests);
  }, []);

  const switchMode = useCallback(
    (id: ModeId) => {
      // Swap in the new mode's first example unless the user wrote their own prompt.
      const isExample = MODES.some((m) => m.examples.some((ex) => ex.text === prompt));
      if (isExample || !prompt.trim()) applyExample(getMode(id).examples[0]);
      setModeId(id);
    },
    [prompt, applyExample],
  );

  // Load the model catalogue.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Failed to load models");
        const list: OpenRouterModel[] = (json.data ?? []).sort(
          (a: OpenRouterModel, b: OpenRouterModel) => a.id.localeCompare(b.id),
        );
        setModels(list);
        setModelsError(null);
      } catch (err) {
        if (!cancelled) setModelsError(String(err instanceof Error ? err.message : err));
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed default selection once models are loaded (only if nothing persisted).
  useEffect(() => {
    if (!hydrated || models.length === 0) return;
    setSelected((prev) => {
      if (prev.length > 0) return prev;
      const ids = new Set(models.map((m) => m.id));
      return PREFERRED_DEFAULTS.filter((id) => ids.has(id)).slice(0, MAX_MODELS);
    });
  }, [models, hydrated]);

  const toggleModel = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_MODELS ? prev : [...prev, id],
    );
  }, []);

  const modelName = useCallback(
    (id: string) => models.find((m) => m.id === id)?.name || id,
    [models],
  );

  const canRun = prompt.trim().length > 0 && selected.length > 0 && !running;

  // In Code Tests mode, optionally show the models the tests they'll be graded on.
  const fullPrompt =
    mode.render === "tests" && shareTests && parsedTests.length > 0
      ? `${prompt}\n\nYour code will be checked with these tests (\`expression ==> expected\`, or an expression that must be truthy):\n\`\`\`\n${parsedTests.map((t) => t.source).join("\n")}\n\`\`\``
      : prompt;

  const streamOne = useCallback(
    async (model: string, signal: AbortSignal) => {
      const started = performance.now();
      setResults((prev) => ({
        ...prev,
        [model]: { text: "", status: "streaming", startedAt: started },
      }));

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: fullPrompt, model, apiKey, system: mode.system }),
          signal,
        });

        if (!res.ok || !res.body) {
          let msg = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            msg = [j.error, j.detail].filter(Boolean).join(" — ") || msg;
          } catch {
            /* non-json */
          }
          setResults((prev) => ({
            ...prev,
            [model]: { ...prev[model], status: "error", error: msg, finishedAt: performance.now() },
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const now = performance.now();
          setResults((prev) => ({
            ...prev,
            [model]: {
              ...prev[model],
              text: (prev[model]?.text ?? "") + chunk,
              firstTokenAt: prev[model]?.firstTokenAt ?? (chunk ? now : undefined),
            },
          }));
        }
        setResults((prev) => ({
          ...prev,
          [model]: { ...prev[model], status: "done", finishedAt: performance.now() },
        }));
      } catch (err) {
        if (signal.aborted) {
          setResults((prev) => ({
            ...prev,
            [model]: { ...prev[model], status: "done", finishedAt: performance.now() },
          }));
          return;
        }
        setResults((prev) => ({
          ...prev,
          [model]: {
            ...prev[model],
            status: "error",
            error: String(err instanceof Error ? err.message : err),
            finishedAt: performance.now(),
          },
        }));
      }
    },
    [fullPrompt, apiKey, mode],
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRunModeId(modeId);
    setRunTests(parsedTests);
    setResults(
      Object.fromEntries(selected.map((id) => [id, { text: "", status: "idle" } as Result])),
    );
    await Promise.all(selected.map((id) => streamOne(id, controller.signal)));
    setRunning(false);
    abortRef.current = null;
  }, [canRun, selected, streamOne, modeId, parsedTests]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const gridCols = useMemo(() => {
    const n = selected.length;
    if (n <= 1) return "grid-cols-1";
    if (n === 2) return "grid-cols-1 md:grid-cols-2";
    if (n === 3) return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
    return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  }, [selected.length]);

  const hasResults = Object.keys(results).length > 0;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            🏟️ Model Arena
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Run one prompt across multiple AI models via OpenRouter and compare the results
            side by side — playable games, chat answers, or SVG drawings.
          </p>
        </div>
      </header>

      {/* Controls */}
      <section className="grid gap-4">
        {/* API key */}
        <div className="rounded-xl border border-surface-border bg-surface-raised p-3">
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-300">
            OpenRouter API key
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-normal text-indigo-400 hover:text-indigo-300"
            >
              get a key ↗
            </a>
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent"
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-slate-300 hover:border-accent/60"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            A key is <span className="text-slate-400">free to create</span> and is required even for
            the free models — OpenRouter needs it on every request (free models just don&apos;t charge
            per token). Stored only in this browser (localStorage) and sent directly to your own API
            route. Leave blank only if the deployment provides a server-side key.
          </p>
        </div>

        {/* Prompt */}
        <div className="rounded-xl border border-surface-border bg-surface-raised p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-surface-border bg-surface p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => switchMode(m.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    m.id === modeId
                      ? "bg-accent/25 text-indigo-100"
                      : "text-slate-400 hover:bg-slate-700/30 hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {mode.examples.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => applyExample(ex)}
                  className="rounded-full border border-surface-border bg-surface px-2.5 py-1 text-xs text-slate-300 hover:border-accent/60 hover:text-white"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={mode.placeholder}
            className="w-full resize-y rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent"
          />
          <p className="mt-1.5 text-xs text-slate-500">{mode.blurb}</p>

          {mode.render === "tests" && (
            <div className="mt-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-slate-300">Test cases</span>
                <span className="font-mono text-xs text-slate-500">
                  {parsedTests.length} test{parsedTests.length === 1 ? "" : "s"}
                </span>
                <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={shareTests}
                    onChange={(e) => setShareTests(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  Show tests to models (off = hidden tests, a fairer benchmark)
                </label>
              </div>
              <textarea
                value={testsText}
                onChange={(e) => setTestsText(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'add(2, 3) ==> 5\nadd(-1, 1) ==> 0\nisPrime(7)'}
                className="w-full resize-y rounded-lg border border-surface-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent"
              />
              <p className="mt-1 text-xs text-slate-500">
                One per line: <code className="text-slate-400">expression ==&gt; expected</code> (deep
                equality) or just an expression that must be truthy. Lines starting with{" "}
                <code className="text-slate-400">//</code> are ignored. Each test has a 2s limit.
              </p>
            </div>
          )}
        </div>

        {/* Models */}
        <ModelPicker
          models={models}
          loading={modelsLoading}
          error={modelsError}
          selected={selected}
          onToggle={toggleModel}
          onClear={() => setSelected([])}
          max={MAX_MODELS}
        />

        {/* Run */}
        <div className="flex items-center gap-3">
          {running ? (
            <button
              onClick={stop}
              className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!canRun}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              ▶ Run on {selected.length || "…"} model{selected.length === 1 ? "" : "s"}
            </button>
          )}
          {!apiKey && (
            <span className="text-xs text-amber-400/80">
              A (free) OpenRouter key is required — even for free models.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-amber-300"
              >
                Create one
              </a>
              , then paste it above.
            </span>
          )}
        </div>
      </section>

      {/* Results */}
      {hasResults && (
        <section className={`mt-6 grid gap-4 ${gridCols}`}>
          {selected
            .filter((id) => results[id])
            .map((id) => (
              <ResultCard
                key={id}
                modelId={id}
                modelName={modelName(id)}
                result={results[id]}
                render={getMode(runModeId).render}
                tests={runTests}
              />
            ))}
        </section>
      )}

      {!hasResults && (
        <section className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border py-16 text-center">
          <div className="text-4xl">🎮</div>
          <p className="mt-3 text-slate-300">Pick a few models, choose a prompt, and hit Run.</p>
          <p className="mt-1 text-sm text-slate-500">
            Every model gets the same prompt — watch them race and compare the results live.
          </p>
        </section>
      )}

      <footer className="mt-12 border-t border-surface-border pt-6 text-center text-xs text-slate-600">
        Built with Next.js · Powered by{" "}
        <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
          OpenRouter
        </a>
        . Your API key never leaves your browser except to call the models you choose.
      </footer>
    </main>
  );
}
