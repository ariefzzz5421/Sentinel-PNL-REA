import { describe, expect, it } from "vitest";
import {
  bitcoinCardShareText, buildBitcoinCardView, maskedBitcoinAddress,
} from "../lib/bitcoin-card";
import type { BitcoinPnl } from "../lib/bitcoin-pnl";
import type { DiscoveryAsset } from "../lib/nft-discovery";

const wallet = "bc1pr8vjq0fk89f5sw3r4n9scrasvw7kaud9akhzw57c3ygycsjspvvseyjcma";
const assets: DiscoveryAsset[] = [{
  id: "a".repeat(64) + "i0",
  name: "Inscription #101",
  imageUrl: "https://ordiscan.com/content/abc",
  url: "https://ordiscan.com/inscription/abc",
  kind: "holding", collection: "taproot-wizards",
}, {
  id: "b".repeat(64) + "i0",
  name: "Inscription #202",
  imageUrl: null,
  url: "https://ordiscan.com/inscription/def",
  kind: "holding", collection: null,
}];

const unknownReport: BitcoinPnl = {
  realizedBtc: null, unrealizedBtc: null, roiPct: null, matchedSales: 0,
  verifiedBuys: 0, pricedHoldings: 0, unknownBasisSales: 0,
  trades: [],
  collections: [{
    slug: "taproot-wizards", held: 1, floorBtc: "0.01200000",
    realizedBtc: null, unrealizedBtc: null, roiPct: null,
    matchedSales: 0, pricedHoldings: 0, unknownBasisSales: 0,
  }, {
    slug: "Unclassified", held: 1, floorBtc: null,
    realizedBtc: null, unrealizedBtc: null, roiPct: null,
    matchedSales: 0, pricedHoldings: 0, unknownBasisSales: 0,
  }],
};

describe("read-only Bitcoin PnL card model", () => {
  it("preserves Unknown prices with Ordiscan-only holdings and never infers basis from floor", () => {
    const walletCard = buildBitcoinCardView(wallet, assets, unknownReport, "wallet");
    const collectionCard = buildBitcoinCardView(wallet, assets, unknownReport,
      "collection", "taproot-wizards");
    expect(walletCard.held).toBe(2);
    expect(walletCard.floorBtc).toBeNull();
    expect(walletCard.realizedBtc).toBeNull();
    expect(walletCard.roiPct).toBeNull();
    expect(walletCard.priceStatus).toBe("UNVERIFIED");
    expect(collectionCard.held).toBe(1);
    expect(collectionCard.floorBtc).toBe("0.01200000");
    expect(collectionCard.unrealizedBtc).toBeNull();
    expect(bitcoinCardShareText(walletCard)).toContain("Unknown");
    expect(bitcoinCardShareText(walletCard)).not.toContain("0 BTC");
  });
  it("shows verified subsets without inventing other collections' realized return", () => {
    const report: BitcoinPnl = {
      ...unknownReport,
      realizedBtc: "0.00300000",
      roiPct: 15,
      matchedSales: 1,
      collections: [
        { ...unknownReport.collections[0], realizedBtc: "0.00300000",
          roiPct: 15, matchedSales: 1 },
        unknownReport.collections[1],
      ],
    };
    const walletCard = buildBitcoinCardView(wallet, assets, report, "wallet");
    const unclassified = buildBitcoinCardView(wallet, assets, report, "collection", "Unclassified");
    expect(walletCard.realizedBtc).toBe("0.00300000");
    expect(walletCard.roiPct).toBe(15);
    expect(walletCard.priceStatus).toBe("VERIFIED SUBSET");
    expect(unclassified.realizedBtc).toBeNull();
    expect(unclassified.roiPct).toBeNull();
    expect(unclassified.priceStatus).toBe("UNVERIFIED");
  });
  it("only offers collection cards for indexed collections", () => {
    expect(() => buildBitcoinCardView(wallet, assets, unknownReport,
      "collection", "not-a-collection")).toThrow(/Choose a collection/);
    expect(maskedBitcoinAddress(wallet)).toBe("bc1pr8vjq0…vvseyjcma");
  });
});
