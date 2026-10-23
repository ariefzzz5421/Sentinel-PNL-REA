import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ ethereum: z.object({ usd: z.number().finite().positive() }) });
/** Display conversion only; present-time ETH/USD, not historical trade execution FX. */
export async function GET() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      next: { revalidate: 300 }, signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return NextResponse.json({ error: "ETH/USD price temporarily unavailable" }, { status: 503 });
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid ETH/USD quote" }, { status: 502 });
    return NextResponse.json({ usd: parsed.data.ethereum.usd, source: "CoinGecko", note: "Current conversion; not historical FX." }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "ETH/USD quote temporarily unavailable" }, { status: 503 });
  }
}
