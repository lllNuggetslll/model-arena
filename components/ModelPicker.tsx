"use client";

import { useMemo, useState } from "react";
import type { OpenRouterModel } from "@/lib/openrouter";
import { pricePerMillion } from "@/lib/openrouter";

function priceLabel(m: OpenRouterModel): string {
  const inP = pricePerMillion(m.pricing?.prompt);
  const outP = pricePerMillion(m.pricing?.completion);
  if ((inP === 0 || inP === null) && (outP === 0 || outP === null)) return "free";
  const fmt = (n: number | null) => (n === null ? "?" : `$${n.toFixed(2)}`);
  return `${fmt(inP)} in / ${fmt(outP)} out per 1M`;
}

export function ModelPicker({
  models,
  loading,
  error,
  selected,
  onToggle,
  onClear,
  max,
}: {
  models: OpenRouterModel[];
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  max: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);

  const selectedModels = useMemo(
    () => selected.map((id) => models.find((m) => m.id === id) ?? ({ id, name: id } as OpenRouterModel)),
    [selected, models],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models
      .filter((m) => {
        if (freeOnly) {
          const inP = pricePerMillion(m.pricing?.prompt);
          const outP = pricePerMillion(m.pricing?.completion);
          const isFree = (inP === 0 || inP === null) && (outP === 0 || outP === null);
          if (!isFree) return false;
        }
        if (!q) return true;
        return (
          m.id.toLowerCase().includes(q) ||
          (m.name ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 200);
  }, [models, query, freeOnly]);

  const atMax = selected.length >= max;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm font-medium text-slate-300">Models</span>
        <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400">
          {selected.length}/{max} selected
        </span>
        <div className="ml-auto flex items-center gap-2">
          {selected.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-slate-200 hover:border-accent/60"
          >
            {open ? "Done" : "+ Add / edit"}
          </button>
        </div>
      </div>

      {/* Selected chips */}
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        {selectedModels.length === 0 && (
          <span className="text-xs text-slate-500">No models selected yet — click “Add / edit”.</span>
        )}
        {selectedModels.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs text-indigo-100"
          >
            <span className="font-mono">{m.id}</span>
            <button
              onClick={() => onToggle(m.id)}
              className="text-indigo-300/70 hover:text-white"
              aria-label={`Remove ${m.id}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {open && (
        <div className="border-t border-surface-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 300+ models (e.g. claude, gpt, gemini, llama)…"
              className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent"
            />
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
                className="accent-indigo-500"
              />
              Free only
            </label>
          </div>

          {loading && <p className="mt-3 text-sm text-slate-500">Loading models…</p>}
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

          {!loading && !error && (
            <div className="mt-3 max-h-72 overflow-auto scroll-thin rounded-lg border border-surface-border">
              {filtered.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No models match “{query}”.</p>
              )}
              {filtered.map((m) => {
                const checked = selected.includes(m.id);
                const disabled = !checked && atMax;
                return (
                  <button
                    key={m.id}
                    onClick={() => !disabled && onToggle(m.id)}
                    disabled={disabled}
                    className={`flex w-full items-center gap-3 border-b border-surface-border/60 px-3 py-2 text-left last:border-b-0 ${
                      checked ? "bg-accent/10" : "hover:bg-slate-700/20"
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${
                        checked ? "border-accent bg-accent text-white" : "border-slate-600"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">{m.name || m.id}</span>
                      <span className="block truncate font-mono text-[11px] text-slate-500">{m.id}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                      {priceLabel(m)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {atMax && (
            <p className="mt-2 text-xs text-amber-400/80">
              Max {max} models at once. Remove one to add another.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
