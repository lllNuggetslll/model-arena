export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
  };
};

/**
 * Resolve the API key to use for a request. A key supplied by the visitor in
 * the request body always wins; otherwise fall back to the server-side env var
 * (useful for private/internal deployments where the owner provides the key).
 */
export function resolveApiKey(bodyKey?: string | null): string | null {
  const fromBody = (bodyKey ?? "").trim();
  if (fromBody) return fromBody;
  const fromEnv = (process.env.OPENROUTER_API_KEY ?? "").trim();
  return fromEnv || null;
}

/**
 * Headers OpenRouter uses for attribution on its rankings page. Optional, but
 * good practice for a released app.
 */
export function attributionHeaders(): Record<string, string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const headers: Record<string, string> = {};
  if (site) {
    headers["HTTP-Referer"] = site;
    headers["X-Title"] = "Model Arena";
  } else {
    headers["X-Title"] = "Model Arena";
  }
  return headers;
}

/**
 * A price string from OpenRouter is USD per token. Convert to USD per
 * 1M tokens for display, returning null when the model is free or unpriced.
 */
export function pricePerMillion(raw?: string): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n * 1_000_000;
}
