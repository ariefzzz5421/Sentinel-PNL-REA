import { z } from "zod";

export const marketSymbols = ["BTC", "ETH", "BNB", "SOL", "HYPE"] as const;
export type MarketSymbol = (typeof marketSymbols)[number];
export type MarketAsset = {
  symbol: MarketSymbol;
  name: string;
  usd: number;
  change24h: number | null;
  image: string | null;
  updatedAt: string;
};
export type MarketSnapshot = { assets: MarketAsset[]; source: "CoinGecko"; updatedAt: string };

const ids: Record<MarketSymbol, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana", HYPE: "hyperliquid",
};
const names: Record<MarketSymbol, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", BNB: "BNB", SOL: "Solana", HYPE: "Hyperliquid",
};
const entry = z.object({
  id: z.string(),
  image: z.string().nullable().optional(),
  current_price: z.number().finite().positive(),
  price_change_percentage_24h: z.number().finite().nullable().optional(),
  last_updated: z.string().optional(),
});
function safeLogo(url: string | null | undefined): string | null {
  if (!url || url.length > 1000) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "coin-images.coingecko.com" || parsed.hostname === "assets.coingecko.com")
      ? parsed.toString() : null;
  } catch { return null; }
}

/** One market-data request for all five ticker assets, cached server-side for 90 sec. */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin%2Cethereum%2Cbinancecoin%2Csolana%2Chyperliquid&price_change_percentage=24h";
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_DEMO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_DEMO_API_KEY;
  const response = await fetch(url, {
    headers,
    next: { revalidate: 90 },
    signal: AbortSignal.timeout(8500),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "Market data rate limited." : "Market data provider unavailable.");
  const json: unknown = await response.json();
  const parsed = z.array(entry).max(30).safeParse(json);
  if (!parsed.success) throw new Error("Invalid market data response.");
  const byId = new Map(parsed.data.map((item) => [item.id, item]));
  const assets: MarketAsset[] = [];
  for (const symbol of marketSymbols) {
    const found = byId.get(ids[symbol]);
    if (!found) continue;
    const timestamp = found.last_updated && !Number.isNaN(Date.parse(found.last_updated))
      ? found.last_updated : new Date().toISOString();
    assets.push({
      symbol, name: names[symbol], usd: found.current_price,
      change24h: found.price_change_percentage_24h ?? null,
      image: safeLogo(found.image),
      updatedAt: timestamp,
    });
  }
  if (!assets.length) throw new Error("No market quotes available.");
  const updatedAt = assets.reduce((earliest, item) => item.updatedAt < earliest ? item.updatedAt : earliest, assets[0].updatedAt);
  return { assets, source: "CoinGecko", updatedAt };
}
