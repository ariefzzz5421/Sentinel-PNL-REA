import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Decimal from "decimal.js";
import { calculatePnl } from "../lib/pnl/calculate";
import { summarizeOverallWalletPnl } from "../lib/overall-wallet-pnl";
import type { TradeEvent } from "../lib/schema";

const wallet = "0x" + "a".repeat(40);
const contract = "0x" + "b".repeat(40);
function event(
  id: string, chain: TradeEvent["chain"], tokenId: string,
  type: TradeEvent["type"], eth: string, day: number,
): TradeEvent {
  return {
    id, chain, wallet, contract, collection: "Collection " + chain,
    tokenId, type, amountEth: eth, feeEth: "0", feeKnown: false,
    date: "2026-11-" + String(day).padStart(2, "0") + "T10:00:00Z",
  };
}
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Overall wallet share card matches the curated scanner ledger", () => {
  it("uses matched sell trades and EXACT realized ETH from the shared calculatePnl engine", () => {
    const events: TradeEvent[] = [
      event("eth-buy", "ethereum", "1", "buy", "0.100000011", 1),
      event("eth-sell", "ethereum", "1", "sell", "0.120000014", 2),
      event("rh-buy", "robinhood", "2", "buy", "0.2", 3),
      event("rh-sell", "robinhood", "2", "sell", "0.19", 4),
      event("missing-basis", "base", "3", "sell", "0.9000", 5),
    ];
    const curated = calculatePnl(events);
    const overall = summarizeOverallWalletPnl(events, wallet);
    expect(overall.bought).toBe(curated.buys);
    expect(overall.sold).toBe(curated.sells);
    expect(overall.matchedSales).toBe(curated.trades.filter(t =>
      t.type === "sell" && t.realizedEth !== null).length);
    expect(overall.matchedSales).toBe(2);
    expect(overall.unknownBasisSales).toBe(1);
    expect(overall.realizedEth).toBe(new Decimal(curated.realizedEth).toFixed(8));
    expect(overall.realizedEth).toBe("0.01000000");
  });

  it("never converts unknown cost basis into invented PnL", () => {
    const overall = summarizeOverallWalletPnl([
      event("sale-only", "base", "11", "sell", "10", 1),
    ], wallet);
    expect(overall.realizedEth).toBeNull();
    expect(overall.matchedSales).toBe(0);
    expect(overall.sold).toBe(1);
  });

  it("renders only three metrics, the real PFP when canvas-permitted, and project Sentinel logo", () => {
    const view = source("src/components/wallet-overall-card.tsx");
    const card = view.slice(view.indexOf("function drawOverallCard("),
      view.indexOf("export function WalletOverallCard("));
    expect(card).toContain('"REALIZED PNL • ETH"');
    expect(card).toContain('["BOUGHT", metrics.bought]');
    expect(card).toContain('["SOLD", metrics.sold]');
    expect(card).toContain('["MATCHED SALES", metrics.matchedSales]');
    expect(card).not.toContain("PRICED COLLECTIONS");
    expect(card).not.toContain("UNKNOWN BASIS SALES");
    expect(card).not.toContain("NETWORKS:");
    expect(card).not.toContain("SENTINEL / WALLET PNL");
    expect(card).not.toContain("ETH/WETH");
    expect(view).toContain('loadCardImage("/sentinel-logo.svg")');
    expect(view).toContain("assets.profile");
    expect(view).toContain("image.crossOrigin");
    expect(view).toContain("target.toBlob");
    expect(view).toContain("navigator.share");
    expect(view).toContain("setCustomName(e.target.value)");
  });

  it("renders ETH and USD with matching number font and a readable spacing", () => {
    const view = source("src/components/wallet-overall-card.tsx");
    const css = source("src/app/globals.css");
    expect(view).toContain('text(pnl, 72, 405, 57, pnlColor, 800');
    expect(view).toContain('usd === null ? "#9a90ac" : pnlColor, 800');
    expect(css).toContain(".scan-collection-pnl .scan-pnl-usd{");
    expect(css).toContain("font-family:inherit;font-size:1em;font-weight:inherit");
    expect(css).toContain("column-gap:12px");
    expect(css).toContain(".wallet-overall-summary{");
  });
});
