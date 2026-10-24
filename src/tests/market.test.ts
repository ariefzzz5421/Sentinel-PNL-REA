import { describe, expect, it, vi } from "vitest";
import { fetchMarketSnapshot } from "../lib/market";

describe("public four-asset market snapshot", () => {
  it("maps BTC ETH BNB HYPE from one validated CoinGecko response", async () => {
    const data = [
      { id: "bitcoin", image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png", current_price: 71000, price_change_percentage_24h: 1.4, last_updated: "2026-10-24T11:00:00Z" },
      { id: "ethereum", image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png", current_price: 2000, price_change_percentage_24h: -2, last_updated: "2026-10-24T11:01:00Z" },
      { id: "binancecoin", image: null, current_price: 640, price_change_percentage_24h: 0, last_updated: "2026-10-24T11:01:00Z" },
      { id: "hyperliquid", image: "http://not-a-safe-icon.test/xyz", current_price: 20, price_change_percentage_24h: null, last_updated: "2026-10-24T11:01:00Z" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })));
    const snapshot = await fetchMarketSnapshot();
    expect(snapshot.assets.map(x => x.symbol)).toEqual(["BTC", "ETH", "BNB", "HYPE"]);
    expect(snapshot.assets[0].image).toContain("coin-images.coingecko.com");
    expect(snapshot.assets[3].image).toBe(null);
    expect(snapshot.assets[1].change24h).toBe(-2);
    expect(snapshot.updatedAt).toBe("2026-10-24T11:00:00Z");
    vi.unstubAllGlobals();
  });

  it("throws on API rate limits rather than inventing prices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(fetchMarketSnapshot()).rejects.toThrow(/rate limited/);
    vi.unstubAllGlobals();
  });
});
