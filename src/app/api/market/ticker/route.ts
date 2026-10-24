import { NextResponse } from "next/server";
import { fetchMarketSnapshot } from "@/lib/market";
export const runtime = "nodejs";
/** Cached server-side source: no private secrets or synthetic quotes returned. */
export async function GET() {
  try {
    const snapshot = await fetchMarketSnapshot();
    return NextResponse.json(snapshot, { headers: {
      "Cache-Control": "public, s-maxage=90, stale-while-revalidate=120",
    } });
  } catch {
    return NextResponse.json({ error: "Live market data unavailable. Retry later." }, { status: 503,
      headers: { "Cache-Control": "no-store" } });
  }
}
