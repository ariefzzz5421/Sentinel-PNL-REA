import { z } from "zod";

export type EthSpotQuote = {
  usd: number;
  source: "CoinGecko" | "Coinbase";
  updatedAt: string;
};

const geckoSchema = z.object({
  ethereum: z.object({
    usd: z.number().finite().positive().max(1_000_000),
    last_updated_at: z.number().int().positive(),
  }),
});
const coinbaseSchema = z.object({
  data: z.object({
    base: z.literal("ETH"),
    currency: z.literal("USD"),
    amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  }),
});
function recent(timestamp: number, now: number) {
  return Number.isFinite(timestamp) && timestamp <= now + 60_000 &&
    now - timestamp < 10 * 60_000;
}

/**
 * Dedicated ETH-only spot feed. Other ticker coins must not break USD PnL.
 * CoinGecko has a provider timestamp; Coinbase only exposes a received-at
 * timestamp, so Coinbase quotes must never be described as historical FX.
 * Both calls run server-side; API keys are never passed to the client.
 */
export async function fetchEthUsdSpot(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<EthSpotQuote> {
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (process.env.COINGECKO_DEMO_API_KEY)
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_DEMO_API_KEY;
    const res = await fetcher(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_last_updated_at=true",
      { headers, next: { revalidate: 60 }, signal: AbortSignal.timeout(6500), redirect: "error" },
    );
    if (!res.ok) throw new Error("CoinGecko quote unavailable");
    const json: unknown = await res.json();
    const parsed = geckoSchema.safeParse(json);
    if (!parsed.success) throw new Error("Malformed CoinGecko ETH/USD quote");
    const updated = parsed.data.ethereum.last_updated_at * 1000;
    if (!recent(updated, now)) throw new Error("Stale CoinGecko ETH/USD quote");
    return {
      usd: parsed.data.ethereum.usd,
      source: "CoinGecko",
      updatedAt: new Date(updated).toISOString(),
    };
  } catch {
    // Fallback to independently sourced public USD spot; no mock values.
  }

  const res = await fetcher("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(6500), redirect: "error",
  });
  if (!res.ok) throw new Error("No current ETH/USD quote available");
  const json: unknown = await res.json();
  const parsed = coinbaseSchema.safeParse(json);
  if (!parsed.success) throw new Error("Malformed Coinbase ETH/USD spot response");
  const usd = Number(parsed.data.data.amount);
  if (!Number.isFinite(usd) || usd <= 0 || usd > 1_000_000)
    throw new Error("Invalid Coinbase ETH/USD spot");
  return {
    usd,
    source: "Coinbase",
    // Coinbase's public spot response has no provider last-updated field.
    updatedAt: new Date(now).toISOString(),
  };
}
