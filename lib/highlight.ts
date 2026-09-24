import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";

// Only the languages the app actually shows, to keep the bundle small.
// (xml handles HTML/SVG, and highlights embedded <script>/<style> via js/css.)
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("markdown", markdown);

export type HighlightLang = "javascript" | "xml" | "css" | "markdown";

/**
 * Syntax-highlight source code, returning HTML with `hljs-*` classes (styled
 * in globals.css). highlight.js escapes the input, so the result is safe to
 * render with dangerouslySetInnerHTML.
 */
export function highlight(code: string, lang: HighlightLang): string {
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
