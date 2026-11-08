import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Decimal from "decimal.js";
import { calculatePnl } from "../lib/pnl/calculate";
import { summarizeOverallWalletPnl } from "../lib/overall-wallet-pnl";
import { rankCollectionsByRealizedPnl } from "../lib/collection-pnl-ranking";
import type { TradeEvent } from "../lib/schema";

const wallet = "0x" + "a".repeat(40), contract = "0x" + "b".repeat(40);
function event(
  id: string, chain: TradeEvent["chain"], tokenId: string,
  type: TradeEvent["type"], amountEth: string, feeEth: string, day: number,
): TradeEvent {
  return {
    id, chain, wallet, contract, collection: "Test " + chain, tokenId, type,
    amountEth, feeEth, feeKnown: true, basisKnown: true,
    date: "2026-11-" + String(day).padStart(2, "0") + "T12:00:00Z",
  };
}
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Realized profit and loss are netted over curated matched sales", () => {
  it("sums gains and losses including known buy and sale fees, excluding unknown-basis sales", () => {
    const events: TradeEvent[] = [
      event("eth-buy", "ethereum", "1", "buy", "0.1", "0.002", 1),
      event("eth-sale", "ethereum", "1", "sell", "0.2", "0.004", 2), // +0.094
      event("base-buy", "base", "1", "buy", "0.5", "0.005", 3),
      event("base-sale", "base", "1", "sell", "0.4", "0.001", 4), // -0.106
      event("missing-cost", "robinhood", "1", "sell", "0.9", "0.01", 5),
    ];
    const curated = calculatePnl(events);
    const matched = curated.trades.filter(t => t.type === "sell" && t.realizedEth !== null);
    const signedSum = matched.reduce((sum, t) => sum.plus(new Decimal(t.realizedEth!)), new Decimal(0));
    const overall = summarizeOverallWalletPnl(events, wallet);
    expect(curated.wins).toBe(1);
    expect(curated.losses).toBe(1);
    expect(curated.unknownBasisSales).toBe(1);
    expect(matched).toHaveLength(2);
    expect(signedSum.toFixed(8)).toBe("-0.01200000");
    expect(overall.realizedEth).toBe(signedSum.toFixed(8));
    expect(overall.matchedSales).toBe(2);
    expect(overall.sold).toBe(3);
    expect(overall.bought).toBe(2);
  });

  it("retains zero net realized PnL if opposite matched sales cancel exactly", () => {
    const events: TradeEvent[] = [
      event("buy1", "ethereum", "1", "buy", "0.1", "0", 1),
      event("sell1", "ethereum", "1", "sell", "0.2", "0", 2),
      event("buy2", "base", "1", "buy", "0.2", "0", 3),
      event("sell2", "base", "1", "sell", "0.1", "0", 4),
    ];
    const overall = summarizeOverallWalletPnl(events, wallet);
    expect(overall.realizedEth).toBe("0.00000000");
    expect(overall.matchedSales).toBe(2);
  });
});

describe("Worst PNL: negative verified results only", () => {
  it("ranks the largest losses first using Decimal without touching the scan data", () => {
    const data = [
      { name: "positive", pnl: "0.05" },
      { name: "unknown", pnl: null },
      { name: "small loss", pnl: "-0.00000000000000012" },
      { name: "big loss", pnl: "-0.43" },
      { name: "breakeven", pnl: "0" },
    ];
    expect(rankCollectionsByRealizedPnl(data, "worst").map(x => x.name))
      .toEqual(["big loss", "small loss"]);
    expect(rankCollectionsByRealizedPnl(data, "best").map(x => x.name))
      .toEqual(["positive", "breakeven", "small loss", "big loss"]);
    expect(data[0].name).toBe("positive");
    expect(data).toHaveLength(5);
    expect(rankCollectionsByRealizedPnl([{ pnl: null }], "worst")).toEqual([]);
  });

  it("shows the new tab directly after Best PNL, including empty-state text", () => {
    const page = source("src/components/scan-results.tsx");
    const best = page.indexOf(">Best PNL</button>");
    const worst = page.indexOf(">Worst PNL</button>");
    const holding = page.indexOf(">Holding</button>");
    expect(best).toBeGreaterThan(0);
    expect(worst).toBeGreaterThan(best);
    expect(holding).toBeGreaterThan(worst);
    expect(page).toContain("rankCollectionsByRealizedPnl(rows, filter)");
    expect(page).toContain('filter === "worst" ? "No verified negative realized PnL found');
  });
});

describe("Overall Wallet PNL modal layout and user-selected local raster PFP", () => {
  it("allows custom raster uploads, PFP reset and reuses the selected image in export", () => {
    const view = source("src/components/wallet-overall-card.tsx");
    expect(view).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(view).toContain("file.size > 4 * 1024 * 1024");
    expect(view).toContain("reader.readAsDataURL(file)");
    expect(view).toContain("setCustomAvatar({ wallet, dataUrl: reader.result })");
    expect(view).toContain("const effectiveAvatarUrl = customAvatarUrl || avatarUrl");
    expect(view).toContain("loadCardAssets(effectiveAvatarUrl)");
    expect(view).toContain("Upload PFP");
    expect(view).toContain("Reset");
    expect(view).toContain("target.toBlob");
    expect(view).toContain("navigator.share");
    expect(view).not.toContain("The label is editable; it does not change ownership");
    expect(view).not.toContain("Only matched sale prices are included; gas/fees may be missing.");
  });

  it("retains invisible methodological context while removing verbose on-screen paragraphs", () => {
    const view = source("src/components/wallet-overall-card.tsx");
    expect(view).toContain('title="Matched priced sales only.');
    const css = source("src/app/globals.css");
    expect(css).toContain(".wallet-overall-avatar-tools");
    expect(css).toContain(".wallet-overall-dialog .wallet-overall-export");
    expect(css).toContain(".wallet-overall-dialog .scan-modal-head");
  });
});
