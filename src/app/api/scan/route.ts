import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  getProviderEvents,
  parseScanRequest,
  ProviderError,
} from "@/lib/providers/normalized";

export const runtime = "nodejs";
const recent = new Map<string, number>();

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 4096)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "chain" in body && (body.chain === "robinhood" || body.chain === "arc"))
      return NextResponse.json({ error: `${body.chain === "arc" ? "Arc" : "Robinhood Chain"} NFT activity scanning is not configured. A compatible indexed activity API is required; RPC alone does not provide complete trades or PnL.` }, { status: 503 });
    const input = parseScanRequest(body);
    const peer =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `${peer}:${input.chain}:${input.address.toLowerCase()}`;
    const now = Date.now();
    if (recent.size > 1000)
      for (const [entry, time] of recent)
        if (now - time > 5000) recent.delete(entry);
    if (now - (recent.get(key) || 0) < 1500)
      return NextResponse.json(
        { error: "Please wait before scanning again." },
        { status: 429 },
      );
    recent.set(key, now);
    const result = await getProviderEvents(input);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "Enter a valid EVM address and supported chain." },
        { status: 400 },
      );
    if (error instanceof ProviderError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Scan failed. Try again." },
      { status: 500 },
    );
  }
}
