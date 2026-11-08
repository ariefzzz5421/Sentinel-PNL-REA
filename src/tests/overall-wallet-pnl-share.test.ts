import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TradeEvent } from "../lib/schema";
import { summarizeOverallWalletPnl, safeCardName } from "../lib/overall-wallet-pnl";

const alice = "0x" + "a".repeat(40);
const bob = "0x" + "b".repeat(40);
const contract = "0x" + "c".repeat(40);
const mk = (id: string, chain: TradeEvent["chain"], wallet: string,
  tokenId: string, type: TradeEvent["type"], eth: string, day: number): TradeEvent => ({
  id, chain, wallet, tokenId, contract, type,
  collection: "Example", date: "2026-11-" + String(day).padStart(2, "0") + "T12:00:00Z",
  amountEth: eth, feeEth: "0", feeKnown: false,
});
const events = [
  mk("a1", "ethereum", alice, "1", "buy", "0.1000", 1),
  mk("a2", "ethereum", alice, "1", "sell", "0.1200", 2),
  mk("b1", "robinhood", alice, "8", "buy", "0.1000", 3),
  mk("b2", "robinhood", alice, "8", "sell", "0.0900", 4),
  mk("a3", "base", alice, "99", "sell", "0.5000", 5), // Unknown basis, never profit.
  mk("x1", "ethereum", bob, "1", "buy", "0.1000", 1),
  mk("x2", "ethereum", bob, "1", "sell", "0.1300", 2),
];

describe("Overall matched NFT wallet profit", () => {
  it("aggregates known basis matched ETH profits across chains", () => {
    const result = summarizeOverallWalletPnl(events, alice);
    expect(result.realizedEth).toBe("0.01000000");
    expect(result.matchedSales).toBe(2);
    expect(result.unknownBasisSales).toBe(1);
    expect(result.sold).toBe(3);
    expect(result.bought).toBe(2);
    expect(result.collections).toBe(3);
    expect(result.wallets).toBe(1);
    expect(result.perChain.find(c => c.chain === "base")?.realizedEth).toBeNull();
  });
  it("keeps different public wallets independent and supports multiwallet totals", () => {
    expect(summarizeOverallWalletPnl(events, bob).realizedEth).toBe("0.03000000");
    const all = summarizeOverallWalletPnl(events, null);
    expect(all.wallets).toBe(2);
    expect(all.realizedEth).toBe("0.04000000");
    expect(all.unknownBasisSales).toBe(1);
  });
  it("does not fabricate overall PnL for unmatched sales or a transfer-only wallet", () => {
    const sale = [mk("bad", "base", alice, "7", "sell", "0.4", 1)];
    const only = [mk("transfer", "ethereum", alice, "7", "transfer_in", "0", 1)];
    expect(summarizeOverallWalletPnl(sale, alice).realizedEth).toBeNull();
    expect(summarizeOverallWalletPnl(only, alice).realizedEth).toBeNull();
  });
  it("truncates unsafe custom labels and falls back to address", () => {
    expect(safeCardName("<My> Wallet", alice)).toBe("My Wallet");
    expect(safeCardName("  ", alice)).toBe(alice);
    expect(safeCardName("x".repeat(200), alice).length).toBe(48);
  });
  it("exposes public OpenSea identity fallback and downloadable editable PNG card", () => {
    const comp = readFileSync(join(process.cwd(), "src/components/wallet-overall-card.tsx"), "utf8");
    const result = readFileSync(join(process.cwd(), "src/components/scan-results.tsx"), "utf8");
    expect(comp).toContain("/api/opensea/profile?address=");
    expect(comp).toContain("fields.username");
    expect(comp).toContain('const fallback = wallet || "Multiple wallets";');
    expect(comp).toContain("setCustomName(e.target.value)");
    expect(comp).toContain("Download PNG");
    expect(comp).toContain("navigator.share");
    expect(comp).toContain("target.toBlob");
    expect(result).toContain("<WalletOverallCard events={events}");
    expect(result).toContain("scan-pnl-native");
    expect(result).toContain("scan-pnl-usd");
  });
});
