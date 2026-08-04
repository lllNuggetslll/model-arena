# 🏟️ Model Arena

Run **one coding prompt across multiple AI models** at the same time (via
[OpenRouter](https://openrouter.ai)) and compare the generated code — and the
**live, playable game** — side by side.

![side-by-side model comparison](https://openrouter.ai) <!-- replace with a screenshot after deploying -->

## Features

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

## Tech

Next.js 14 (App Router) · React 18 · Tailwind CSS · Edge runtime API routes.
