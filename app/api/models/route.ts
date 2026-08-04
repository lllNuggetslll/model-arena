import { NextResponse } from "next/server";
import { OPENROUTER_BASE, attributionHeaders } from "@/lib/openrouter";

export const runtime = "edge";
// Revalidate the model catalogue every 10 minutes.
export const revalidate = 600;

export async function GET() {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { ...attributionHeaders() },
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `OpenRouter returned ${res.status}`, detail: text.slice(0, 500) },
        { status: 502 },
      );
    }

    const json = await res.json();
    return NextResponse.json({ data: json.data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach OpenRouter", detail: String(err) },
      { status: 502 },
    );
  }
}
