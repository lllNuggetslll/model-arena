# 🏟️ Model Arena

Run **one prompt across multiple AI models** at the same time (via
[OpenRouter](https://openrouter.ai)) and compare the results side by side —
**live, playable games**, **chat answers**, or **SVG drawings**.

![side-by-side model comparison](https://openrouter.ai) <!-- replace with a screenshot after deploying -->

## Features

- **Four comparison modes** — 🎮 Game / App (runnable HTML preview),
  💬 Chat (rendered markdown answers), 🖼️ SVG Art (models draw with code), and
  🧪 Code Tests (models write a JS function, your test cases score it).
  Modes live in `lib/modes.ts`, so adding another is one entry.
- **Code Tests scoring** — write tests one per line as `expression ==> expected`
  (deep equality) or a bare expression that must be truthy. Each model's code runs
  in a sandboxed Web Worker with a 2s limit per test, and every card gets a pass
  score plus IDE-style expected/received values. Tests can be hidden from the
  models (default) or shown to them.
- **IDE-style syntax highlighting** (VS Code Dark+ colors) for generated code and test output.
- **Speed stats** per model — time to first token, approximate output tokens and tokens/sec.
- **Fan-out to many models at once** — pick up to 6 models and run them in parallel.
- **Live model catalogue** — the model list is pulled from OpenRouter's
  `/models` API, so you always see everything that's available (300+ models),
  with search and a "free only" filter.
- **Streaming output** — watch every model generate token-by-token, racing each other.
- **Live game preview** — each response is rendered in a sandboxed iframe, so a
  "build me Snake" prompt actually shows six playable Snakes next to each other.
- **Code + Preview tabs** per model, with copy-to-clipboard.
- **Bring-your-own-key** — visitors paste their own OpenRouter key (stored only in
  their browser), so you can deploy it publicly without exposing your own key.

## How it works

- `app/api/models` proxies OpenRouter's model list (public, no key needed).
- `app/api/generate` proxies a streaming chat completion for a single model. The
  API key comes from the request (the visitor's key) or, as a fallback, the
  `OPENROUTER_API_KEY` env var. Keys are never logged or persisted server-side.
- The front-end fires one request per selected model and renders the streams
  into side-by-side cards.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and paste an [OpenRouter API key](https://openrouter.ai/keys).

## Deploy to Vercel

This is a stock Next.js App Router app — it deploys with zero configuration.

1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. In [Vercel](https://vercel.com/new), **Import** the repo. Framework preset:
   **Next.js** (auto-detected). No build settings to change.
3. **(Optional)** Add environment variables in **Project → Settings → Environment
   Variables**:
   - `OPENROUTER_API_KEY` — a fallback key so visitors don't need their own.
     Omit this to make it strictly bring-your-own-key.
   - `NEXT_PUBLIC_SITE_URL` — your deployed URL, used for OpenRouter attribution.
4. **Deploy.**

Or from the CLI:

```bash
npm i -g vercel
vercel
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | No | Server-side fallback key. If unset, each visitor must supply their own key in the UI. |
| `NEXT_PUBLIC_SITE_URL` | No | Your app's URL, sent to OpenRouter for rankings/attribution. |

See [.env.example](.env.example).

## Notes on the preview sandbox

Generated code runs inside an `<iframe sandbox="allow-scripts …">` **without**
`allow-same-origin`, so it executes in an isolated origin and cannot read your
page, cookies, or the visitor's API key. `localStorage` inside a generated game
will be unavailable by design — that's the trade-off for safely running
arbitrary model output.

Code Tests run the same way: inside a Web Worker created within a sandboxed,
opaque-origin iframe. A test that hangs is killed after 2 seconds and the worker
is replaced, so an infinite loop in model code can't freeze the page.

## Tech

Next.js 14 (App Router) · React 18 · Tailwind CSS · Edge runtime API routes.
