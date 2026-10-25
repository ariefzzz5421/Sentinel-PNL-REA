import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { discoverNfts, DiscoveryError, parseDiscoveryRequest } from "@/lib/nft-discovery";

export const runtime = "nodejs";
const lastScans = new Map<string, number>();
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return NextResponse.json({ error: "Request exceeds size limit." }, { status: 413 });
  try {
    const input = parseDiscoveryRequest(await request.json() as unknown);
    const peer = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = peer + ":" + input.chain + ":" + input.address.toLowerCase();
    const now = Date.now();
    for (const [k, when] of lastScans) if (now - when > 60_000) lastScans.delete(k);
    if (now - (lastScans.get(key) || 0) < 4000)
      return NextResponse.json({ error: "Please wait a few seconds before another discovery request." }, { status: 429 });
    lastScans.set(key, now);
    const result = await discoverNfts(input);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json({ error: "Use a valid chain, wallet, and optional Ink contract." }, { status: 400 });
    if (error instanceof DiscoveryError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "NFT discovery is temporarily unavailable." }, { status: 500 });
  }
}
