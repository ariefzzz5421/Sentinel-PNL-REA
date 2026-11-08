import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filterNetworkItems } from "../lib/network-filter";

const records = [
  { id: "1", chain: "ethereum", amount: 12 },
  { id: "2", chain: "robinhood", amount: 30 },
  { id: "3", chain: "base", amount: 8 },
  { id: "4", chain: "robinhood", amount: 10 },
];
const discovery = [
  { chain: "arc", assets: [{ id: "arc-nft" }] },
  { chain: "ink", assets: [{ id: "ink-nft" }] },
];
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("network badge filters: default all, selected chain only, reset without rescanning", () => {
  it("shows every item for default All Chains with no mutation", () => {
    const result = filterNetworkItems(records, null);
    expect(result).toEqual(records);
    expect(result).not.toBe(records);
    expect(records).toHaveLength(4);
  });

  it("filters PnL results and preserves original scan results", () => {
    const filtered = filterNetworkItems(records, "robinhood");
    expect(filtered.map(item => item.id)).toEqual(["2", "4"]);
    expect(filterNetworkItems(records, "ethereum").map(item => item.id)).toEqual(["1"]);
    expect(filterNetworkItems(records, null)).toEqual(records);
    expect(records).toHaveLength(4);
  });

  it("filters Arc and Ink activity without treating them as priced EVM events", () => {
    expect(filterNetworkItems(discovery, "arc")).toEqual([discovery[0]]);
    expect(filterNetworkItems(discovery, "ink")).toEqual([discovery[1]]);
    expect(filterNetworkItems(records, "arc")).toEqual([]);
    expect(filterNetworkItems(discovery, "robinhood")).toEqual([]);
    expect(filterNetworkItems(discovery, null)).toEqual(discovery);
  });

  it("offers keyboard accessible clickable badges with All Chains reset", () => {
    const results = source("src/components/scan-results.tsx");
    const scanner = source("src/components/scanner-home.tsx");
    expect(results).toContain("All Chains");
    expect(results).toContain("aria-pressed={selectedChain === item.chain}");
    expect(results).toContain('onChainSelect?.(selectedChain === item.chain ? null : item.chain)');
    expect(results).toContain("filterNetworkItems(events, selectedChain)");
    expect(scanner).toContain("unpricedDiscoveries={evmDiscoveries}");
    expect(results).toContain("filterNetworkItems(unpricedDiscoveries, selectedChain)");
    expect(scanner).toContain("setSelectedChain(null)");
  });

  it("marquees have equal-length copies and reduced-motion fallbacks", () => {
    const scanner = source("src/components/scanner-home.tsx");
    const tape = source("src/components/market-tape.tsx");
    const css = source("src/app/globals.css");
    expect(scanner).toContain("[0, 1, 2].map");
    expect(tape).toContain('symbol === "SOL" ? "/chains/solana.svg"');
    expect(tape).toContain("tape-icon-solana");
    expect(css).toContain("sentinel-chain-marquee");
    expect(css).toContain("translate3d(-33.333333%,0,0)");
    expect(css).toContain("translate3d(-50%,0,0)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("scanner-side-right{margin-top:15px}");
  });
});
