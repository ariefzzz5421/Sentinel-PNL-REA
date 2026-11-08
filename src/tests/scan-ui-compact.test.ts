import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("compact automatic NFT scan UI", () => {
  it("shows a concise ENS result without replacing internal provider diagnostics", () => {
    const scanner = file("src/components/scanner-home.tsx");
    const resolver = file("src/lib/resolve-wallet-input.ts");
    expect(resolver).toContain("ensCount: resolved.length");
    expect(scanner).toContain('"Found " + resolved.ensCount + " ENS Address"');
    expect(scanner).toContain("sessionStorage.setItem");
    expect(scanner).not.toContain('<p className="scanner-network-note">');
    expect(scanner).not.toContain("Some networks failed; see Details below.");
  });

  it("uses repository chain artwork in compact status badges and NFT collection cards", () => {
    const results = file("src/components/scan-results.tsx");
    const css = file("src/app/globals.css");
    expect(results).toContain("scanChainById(item.chain).icon");
    expect(results).toContain("scanChainById(row.chain).icon");
    expect(results).toContain('"—" : item.eventCount} events');
    expect(results).not.toContain("owned · PnL Unknown");
    expect(results).not.toContain("<details className=\"scan-result-method\">");
    expect(results).toContain("<small>ETH PNL</small>");
    expect(results).not.toContain("<small>ETH PNL · est.</small>");
    expect(css).toContain(".scan-network-chain-icon");
    expect(css).toContain(".scan-collection-chain img");
  });
});
