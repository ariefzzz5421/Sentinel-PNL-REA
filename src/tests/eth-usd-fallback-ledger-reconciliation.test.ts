import { describe, expect, it } from "vitest";
import { fetchEthUsdSpot } from "../lib/eth-usd-provider";
import { parseEthUsdSpot, formatEthPnlUsd } from "../lib/eth-usd-spot";
import { calculatePnl } from "../lib/pnl/calculate";
import { summarizeOverallWalletPnl } from "../lib/overall-wallet-pnl";
import type { TradeEvent } from "../lib/schema";
import Decimal from "decimal.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const now = Date.parse("2026-11-09T00:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const mkFetch = (fn: (url: string) => Response | Promise<Response>) =>
  ((url: string | URL | Request) => fn(String(url))) as typeof fetch;

describe("ETH/USD spot quote source independence and provider failover", () => {
  it("reads fresh, timestamped CoinGecko ETH/USD from dedicated endpoint", async () => {
    const requests: string[] = [];
    const spot = await fetchEthUsdSpot(mkFetch(url => {
      requests.push(url);
      return json({ ethereum: { usd: 2250.45, last_updated_at: now / 1000 } });
    }), now);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/simple/price?ids=ethereum");
    expect(requests[0]).not.toContain("hyperliquid");
    expect(spot).toMatchObject({ usd: 2250.45, source: "CoinGecko" });
    expect(parseEthUsdSpot(spot, now)).toEqual(spot);
    expect(formatEthPnlUsd("-0.0180", spot)).toBe("-$40.51");
  });

  it("uses independent Coinbase ETH/USD when CoinGecko is rate-limited", async () => {
    const urls: string[] = [];
    const spot = await fetchEthUsdSpot(mkFetch(url => {
      urls.push(url);
      return url.includes("coingecko.com")
        ? json({ error: "rate limited" }, 429)
        : json({ data: { base: "ETH", currency: "USD", amount: "2225.15" } });
    }), now);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toBe("https://api.coinbase.com/v2/prices/ETH-USD/spot");
    expect(spot).toMatchObject({ source: "Coinbase", usd: 2225.15 });
    expect(parseEthUsdSpot(spot, now)).toEqual(spot);
    expect(formatEthPnlUsd("0.0482", spot)).toBe("$107.25");
  });

  it("falls back if CoinGecko has stale data, and never invents missing prices", async () => {
    const spot = await fetchEthUsdSpot(mkFetch(url =>
      url.includes("coingecko")
        ? json({ ethereum: { usd: 2100, last_updated_at: (now - 40 * 60_000) / 1000 } })
        : json({ data: { base: "ETH", currency: "USD", amount: "2200.00" } })), now);
    expect(spot.source).toBe("Coinbase");
    expect(spot.usd).toBe(2200);
    await expect(fetchEthUsdSpot(mkFetch(() => json({ message: "error" }, 503)), now)).rejects.toThrow();
    await expect(fetchEthUsdSpot(mkFetch(url =>
      url.includes("coingecko")
        ? json({ ethereum: { usd: 2300, last_updated_at: now / 1000 } }, 429)
        : json({ data: { base: "ETH", currency: "USD", amount: "NaN" } })), now)).rejects.toThrow();
    expect(parseEthUsdSpot({ source: "Coinbase", usd: 2200, updatedAt: new Date(now - 12 * 60_000).toISOString() }, now)).toBeNull();
    expect(formatEthPnlUsd("0.0482", null)).toBeNull();
  });
});

const wallet = "0x" + "a".repeat(40);
const contract = "0x" + "b".repeat(40);
function event(
  id: string, tokenId: string, type: TradeEvent["type"], eth: string, fee: string, day: number,
): TradeEvent {
  return {
    id, chain: "ethereum", wallet, contract, collection: "Example",
    tokenId, type, amountEth: eth, feeEth: fee, feeKnown: true,
    date: "2026-11-" + String(day).padStart(2, "0") + "T12:00:00Z",
  };
}

describe("Audit net realized profits after all matched losses and known fees", () => {
  it("independently reconciles signed matched sales with the canonical PnL engine", () => {
    const records = [
      event("buy1", "1", "buy", "0.10", "0.002", 1),
      event("sell1", "1", "sell", "0.20", "0.003", 2), // +0.095
      event("buy2", "2", "buy", "0.20", "0.001", 3),
      event("sell2", "2", "sell", "0.15", "0.004", 4), // -0.055
      event("unknown1", "3", "sell", "1.9", "0", 5),  // excluded
    ];
    const metrics = summarizeOverallWalletPnl(records, wallet);
    const base = calculatePnl(records);
    expect(metrics.grossProfitsEth).toBe("0.09500000");
    expect(metrics.grossLossesEth).toBe("0.05500000");
    expect(metrics.realizedEth).toBe("0.04000000");
    expect(metrics.netReconciled).toBe(true);
    expect(metrics.wins).toBe(1);
    expect(metrics.losses).toBe(1);
    expect(metrics.unknownBasisSales).toBe(1);
    expect(metrics.matchedSales).toBe(2);
    expect(new Decimal(metrics.grossProfitsEth).minus(metrics.grossLossesEth).toString()).toBe(base.realizedEth);
  });

  it("does not double count duplicate provider IDs across scan pages", () => {
    const records = [
      event("buy1", "1", "buy", "0.1", "0", 1),
      event("sale1", "1", "sell", "0.125", "0", 2),
    ];
    const baseline = calculatePnl(records);
    const twice = calculatePnl([...records, ...records]);
    expect(twice.buys).toBe(baseline.buys);
    expect(twice.sells).toBe(baseline.sells);
    expect(twice.realizedEth).toBe(baseline.realizedEth);
    expect(summarizeOverallWalletPnl([...records, ...records], wallet).matchedSales).toBe(1);
  });

  it("keeps unmatched sale basis excluded instead of calling it profitable", () => {
    const audit = summarizeOverallWalletPnl([event("sale", "999", "sell", "2", "0", 1)], wallet);
    expect(audit.realizedEth).toBeNull();
    expect(audit.matchedSales).toBe(0);
    expect(audit.unknownBasisSales).toBe(1);
    expect(audit.grossProfitsEth).toBe("0.00000000");
    expect(audit.grossLossesEth).toBe("0.00000000");
  });

  it("keeps a collapsed proof of reconciliation with no extra PNG metrics", () => {
    const card = readFileSync(join(process.cwd(), "src/components/wallet-overall-card.tsx"), "utf8");
    expect(card).toContain('<details className="wallet-overall-audit">');
    expect(card).toContain("summary.grossProfitsEth");
    expect(card).toContain("summary.grossLossesEth");
    expect(card).toContain("summary.netReconciled");
    const png = card.slice(card.indexOf("function drawOverallCard("), card.indexOf("export function WalletOverallCard("));
    expect(png).not.toContain("grossProfitsEth");
    expect(png).not.toContain("grossLossesEth");
  });
});
