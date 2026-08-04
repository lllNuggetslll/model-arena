"use client";

import { useEffect, useMemo, useState } from "react";
import { extractHtml, stripSoleFence } from "@/lib/extract";

export type GenStatus = "idle" | "streaming" | "done" | "error";

export type Result = {
  text: string;
  status: GenStatus;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
};

type Tab = "preview" | "code";

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
}: {
  modelId: string;
  modelName: string;
  result: Result;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [committedHtml, setCommittedHtml] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);

  const liveHtml = useMemo(() => extractHtml(result.text), [result.text]);
  const code = useMemo(() => stripSoleFence(result.text), [result.text]);

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(code || result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  function runPreview() {
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
          <StatusBadge status={result.status} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface/40 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            Preview
          </TabButton>
          <TabButton active={tab === "code"} onClick={() => setTab("code")}>
            Code
          </TabButton>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={runPreview}
            disabled={!liveHtml}
            className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/40 disabled:cursor-not-allowed disabled:opacity-40"
            title="Render the latest code in the preview"
          >
            ⟳ Run
          </button>
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
        ) : tab === "preview" ? (
          <PreviewPane html={committedHtml} nonce={nonce} status={result.status} hasLive={!!liveHtml} />
        ) : (
          <pre className="h-full overflow-auto scroll-thin bg-[#0a0c11] p-3 font-mono text-[12px] leading-relaxed text-slate-200">
            {result.text ? (
              <code>{code}</code>
            ) : (
              <span className="text-slate-500">Waiting for output…</span>
            )}
            {result.status === "streaming" && <span className="animate-pulse-dot">▋</span>}
          </pre>
        )}
      </div>
    </div>
  );
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
          <span>No runnable HTML detected in this response.</span>
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
