import { describe, expect, it } from "vitest";
import { calculatePnl } from "../lib/pnl/calculate";
import type { TradeEvent } from "../lib/schema";

const wallet = "0x000000000000000000000000000000000000dEaD";
const base = {
  chain: "ethereum",
  wallet,
  collection: "Orbit",
  contract: "0x0000000000000000000000000000000000000001",
  tokenId: "7",
  feeEth: "0.01",
} as const;
const trade = (
  id: string,
  date: string,
  type: TradeEvent["type"],
  amountEth: string,
): TradeEvent => ({ ...base, id, date, type, amountEth });

describe("NFT PnL accounting", () => {
  it("includes buy and sell fees and respects a sale window with earlier cost", () => {
    const events = [
      trade("buy", "2026-01-01T00:00:00Z", "buy", "1.00"),
      trade("sell", "2026-02-01T00:00:00Z", "sell", "1.50"),
    ];
    const all = calculatePnl(events);
    expect(all.realizedEth).toBe("0.48");
    expect(all.openPositions).toBe(0);
    const feb = calculatePnl(events, new Date("2026-02-01T00:00:00Z"));
    expect(feb.realizedEth).toBe("0.48");
    expect(feb.buys).toBe(0);
  });
  it("marks missing basis as unknown rather than treating proceeds as profit", () => {
    const result = calculatePnl([
      trade("sell", "2026-02-01T00:00:00Z", "sell", "2"),
    ]);
    expect(result.unknownBasisSales).toBe(1);
    expect(result.trades[0].realizedEth).toBeNull();
  });
  it("retains open positions without inventing unrealized value", () => {
    const result = calculatePnl([
      trade("buy", "2026-01-01T00:00:00Z", "mint", "0.5"),
    ]);
    expect(result.openPositions).toBe(1);
    expect(result.realizedEth).toBe("0");
  });
  it("never classifies an unpriced mint as a free acquisition or realized gain", () => {
    const mint = { ...trade("mint-unknown", "2026-01-01T00:00:00Z", "mint", "0"), basisKnown: false };
    const sell = trade("sell-after-mint", "2026-02-01T00:00:00Z", "sell", "1");
    const result = calculatePnl([mint, sell]);
    expect(result.mints).toBe(1);
    expect(result.buys).toBe(0);
    expect(result.unknownBasisSales).toBe(1);
    expect(result.realizedEth).toBe("0");
    expect(result.trades.find((t) => t.type === "sell")?.realizedEth).toBeNull();
  });
  it("does not match a sale in a different wallet", () => {
    const otherWallet = "0x0000000000000000000000000000000000000002";
    const result = calculatePnl([
      trade("buy", "2026-01-01T00:00:00Z", "buy", "1"),
      {
        ...trade("sell", "2026-02-01T00:00:00Z", "sell", "2"),
        wallet: otherWallet,
      },
    ]);
    expect(result.unknownBasisSales).toBe(1);
    expect(result.openPositions).toBe(1);
  });
});
