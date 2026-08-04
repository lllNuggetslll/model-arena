import { OPENROUTER_BASE, resolveApiKey, attributionHeaders } from "@/lib/openrouter";

export const runtime = "edge";

type Body = {
  prompt?: string;
  model?: string;
  system?: string;
  apiKey?: string;
  temperature?: number;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const prompt = (body.prompt ?? "").trim();
  const model = (body.model ?? "").trim();
  if (!prompt) return json({ error: "Missing prompt" }, 400);
  if (!model) return json({ error: "Missing model" }, 400);

  const apiKey = resolveApiKey(body.apiKey);
  if (!apiKey) {
    return json(
      {
        error:
          "An OpenRouter API key is required — even for free models. Create a free key at openrouter.ai/keys and paste it into the app (or set OPENROUTER_API_KEY on the server).",
      },
      401,
    );
  }

  const messages = [
    ...(body.system ? [{ role: "system", content: body.system }] : []),
    { role: "user", content: prompt },
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...attributionHeaders(),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      }),
    });
  } catch (err) {
    return json({ error: `Failed to reach OpenRouter: ${String(err)}` }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return json(
      { error: `OpenRouter error ${upstream.status}`, detail: detail.slice(0, 800) },
      upstream.status === 401 ? 401 : 502,
    );
  }

  // Transform OpenRouter's SSE stream into a plain-text stream of content
  // deltas, which is trivial for the browser to consume with a reader.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; process complete lines.
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex).trimEnd();
            buffer = buffer.slice(newlineIndex + 1);

            if (!line || line.startsWith(":")) continue; // keep-alive comment
            if (!line.startsWith("data:")) continue;

            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
              const errMsg: string | undefined = parsed?.error?.message;
              if (errMsg) controller.enqueue(encoder.encode(`\n\n[error] ${errMsg}`));
            } catch {
              // Ignore unparseable keep-alive / partial frames.
            }
          }
        }
        controller.close();
      } catch (err) {
        try {
          controller.enqueue(encoder.encode(`\n\n[stream error] ${String(err)}`));
        } catch {
          /* controller already closed */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
