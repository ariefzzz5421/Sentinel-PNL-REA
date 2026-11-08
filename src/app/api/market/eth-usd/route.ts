import { NextResponse } from "next/server";
import { fetchEthUsdSpot } from "@/lib/eth-usd-provider";

export const runtime = "nodejs";
export async function GET() {
  try {
    const quote = await fetchEthUsdSpot();
    return NextResponse.json({
      ...quote,
      note: "Current spot-value conversion, not historical trade execution FX.",
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "Verified ETH/USD spot unavailable." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
