import { describe, expect, it } from "vitest";
import { parseTradeCsv, toTradeCsv } from "../lib/import-export";
import { parseWallets, type TradeEvent } from "../lib/schema";

const wallet = "0x000000000000000000000000000000000000dEaD";
const event: TradeEvent = {
  id: "one",
  date: "2026-01-01T00:00:00Z",
  chain: "ethereum",
  wallet,
  collection: "Orbit, One",
  tokenId: "7",
  type: "buy",
  amountEth: "1.00",
  feeEth: "0.01",
};

describe("ledger import and wallet input", () => {
  it("round trips quoted collection names through CSV", () => {
    expect(parseTradeCsv(toTradeCsv([event]))).toEqual([event]);
  });
  it("rejects invalid financial amounts", () => {
    expect(() =>
      parseTradeCsv(toTradeCsv([{ ...event, amountEth: "-1" }])),
    ).toThrow(/amountEth/);
  });
  it("keeps missing CSV fees unknown instead of declaring them zero", () => {
    const csv = toTradeCsv([event]).replace(",0.01,,", ",,,");
    expect(parseTradeCsv(csv)[0].feeKnown).toBe(false);
  });
  it("round trips provider fee uncertainty through CSV", () => {
    const providerEvent: TradeEvent = { ...event, id: "provider", feeEth: "0", feeKnown: false };
    expect(parseTradeCsv(toTradeCsv([providerEvent]))).toEqual([providerEvent]);
  });
  it("deduplicates public wallet addresses and rejects invalid entries", () => {
    expect(parseWallets(`${wallet}\n${wallet.toLowerCase()}`)).toHaveLength(1);
    expect(() => parseWallets("not-a-wallet")).toThrow(/Invalid wallet/);
  });
});
