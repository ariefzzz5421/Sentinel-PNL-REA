import { NextResponse } from "next/server";
import { fetchMarketSnapshot } from "@/lib/market";
export const runtime = "nodejs";
/** Compatibility with previous PnL studio currency endpoint. */
export async function GET() {
  try {
    const snapshot = await fetchMarketSnapshot();
    const eth = snapshot.assets.find((asset) => asset.symbol === "ETH");
    if (!eth) throw new Error("ETH price unavailable");
    return NextResponse.json({ usd: eth.usd, source: snapshot.source, updatedAt: eth.updatedAt,
      note: "Current conversion, not historical trade execution FX." }, {
      headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ error: "ETH/USD price unavailable." }, { status: 503,
      headers: { "Cache-Control": "no-store" } });
  }
}
