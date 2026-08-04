/**
 * Pull the most likely runnable HTML document out of a model's response.
 *
 * Models usually return a single self-contained HTML file wrapped in a
 * ```html fenced code block. We prefer that; if there's no fence but the text
 * clearly contains a full document, we use the raw text.
 */
export function extractHtml(raw: string): string | null {
  if (!raw) return null;

  const fences = [...raw.matchAll(/```(\w+)?\n([\s\S]*?)```/g)];

  // Prefer an explicitly html/xml fenced block.
  for (const m of fences) {
    const lang = (m[1] ?? "").toLowerCase();
    const code = m[2] ?? "";
    if (lang === "html" || lang === "xml" || /<html[\s>]/i.test(code)) {
      return code.trim();
    }
  }

  // Otherwise, the first fenced block that looks like markup.
  for (const m of fences) {
    const code = m[2] ?? "";
    if (/<\/?[a-z][\s\S]*>/i.test(code) && /<(canvas|body|div|svg|script|style)[\s>]/i.test(code)) {
      return code.trim();
    }
  }

  // No fences: maybe the whole response is a document.
  if (/<html[\s>]/i.test(raw) || /<!doctype html/i.test(raw)) {
    return raw.trim();
  }

  return null;
}

/**
 * Strip a single leading/trailing markdown code fence so the "Code" tab shows
 * clean source when the whole reply is one code block.
 */
export function stripSoleFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  return match ? match[1] : raw;
}
