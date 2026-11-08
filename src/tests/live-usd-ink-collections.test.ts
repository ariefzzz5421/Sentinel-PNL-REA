import { describe, expect, it } from "vitest";
import { formatEthPnlUsd, parseEthUsdSpot } from "../lib/eth-usd-spot";
import { groupIndexedEvmCollections } from "../lib/indexed-evm-collections";
import type { DiscoveryResult } from "../lib/nft-discovery";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const now = Date.parse("2026-11-08T12:00:00Z");
const contract = "0x42411286529e1da56c7c8c7535737961b2e06955";
const base: DiscoveryResult = {
  chain: "ink", address: "0x" + "a".repeat(40), partial: true,
  mode: "recent-transfers", pnlAvailable: false, note: "Unpriced NFT movements",
  assets: [
    { id: "owned1", name: "Pupp #1", kind: "holding", collection: "Pupps",
      imageUrl: "https://example.org/nft.png", contract, tokenId: "1", url: "https://explorer.inkonchain.com/token/" + contract + "/instance/1" },
    { id: "received1", name: "Pupp #1", kind: "received", collection: "Pupps",
      imageUrl: null, contract, tokenId: "1", url: "https://explorer.inkonchain.com/tx/abc" },
    { id: "sent2", name: "Pupp #2", kind: "sent", collection: "Pupps",
      imageUrl: null, contract, tokenId: "2", url: "https://explorer.inkonchain.com/tx/def" },
  ],
};

describe("Live spot ETH/USD annotation", () => {
  it("converts signed PnL at an observed quote without invented historical FX", () => {
    const spot = parseEthUsdSpot({ source: "CoinGecko", usd: 2200, updatedAt: "2026-11-08T11:59:00Z" }, now);
    expect(spot).not.toBeNull();
    expect(formatEthPnlUsd("-0.0005", spot)).toBe("-$1.10");
    expect(formatEthPnlUsd("0.0046", spot)).toBe("$10.12");
    expect(formatEthPnlUsd("0", spot)).toBe("$0.00");
    expect(formatEthPnlUsd(null, spot)).toBeNull();
  });
  it("rejects stale, missing, future, fake, or malformed quotes", () => {
    expect(parseEthUsdSpot({ source: "CoinGecko", usd: 2200, updatedAt: "2026-11-08T11:00:00Z" }, now)).toBeNull();
    expect(parseEthUsdSpot({ source: "CoinGecko", usd: 2200, updatedAt: "2026-11-08T12:10:00Z" }, now)).toBeNull();
    expect(parseEthUsdSpot({ source: "CoinGecko", usd: -1, updatedAt: "2026-11-08T11:59:00Z" }, now)).toBeNull();
    expect(parseEthUsdSpot({ source: "mock", usd: 2200, updatedAt: "2026-11-08T11:59:00Z" }, now)).toBeNull();
    expect(formatEthPnlUsd("not-priced", null)).toBeNull();
    expect(formatEthPnlUsd("0.0046", null)).toBeNull();
  });
});

describe("Ink and Arc collection cards without false sales", () => {
  it("groups inventory and movements by contract, keeping transfer direction intact", () => {
    const rows = groupIndexedEvmCollections([base]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chain: "ink", name: "Pupps", owned: 1,
      received: 1, sent: 1, contract, imageUrl: "https://example.org/nft.png" });
    expect(rows[0]).not.toHaveProperty("pnl");
    expect(rows[0]).not.toHaveProperty("bought");
  });
  it("keeps same-named collections across chains or contracts distinct", () => {
    const other: DiscoveryResult = { ...base, chain: "arc", assets: base.assets.map(a => ({ ...a })) };
    expect(groupIndexedEvmCollections([base, other])).toHaveLength(2);
    expect(groupIndexedEvmCollections([])).toEqual([]);
    expect(groupIndexedEvmCollections([{ ...base, assets: [] }])).toEqual([]);
  });
  it("does not duplicate holdings or transfers in a repeated scan result", () => {
    const rows = groupIndexedEvmCollections([base, base]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owned: 1, received: 1, sent: 1 });
  });
  it("uses the existing PnL collection design and shows honest Not Found when empty", () => {
    const scanner = readFileSync(join(process.cwd(), "src/components/scan-results.tsx"), "utf8");
    const cards = readFileSync(join(process.cwd(), "src/components/indexed-evm-collection-cards.tsx"), "utf8");
    const home = readFileSync(join(process.cwd(), "src/components/scanner-home.tsx"), "utf8");
    expect(scanner).toContain("<IndexedEvmCollectionCards rows={indexedShown}/>");
    expect(scanner).toContain('selectedIndexerFailed ? "Indexer unavailable" : "Not Found"');
    expect(scanner).toContain("formatEthPnlUsd(row.pnl, ethUsdSpot)");
    expect(home).toContain("unpricedDiscoveries={evmDiscoveries}");
    expect(cards).toContain("scan-collection-card");
    expect(cards).toContain('className="unknown">Unknown');
    expect(cards).toContain("<span>RECEIVED</span>");
    expect(cards).not.toContain("<span>BOUGHT</span>");
  });
});
