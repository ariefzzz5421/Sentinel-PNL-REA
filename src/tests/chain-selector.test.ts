import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanChains, scanChainById } from "../lib/scan-chains";

describe("extra blockchain selector options", () => {
  it("shows SOL and INK immediately after ARC without claiming backend scan support", () => {
    expect(scanChains.map((chain) => chain.label)).toEqual(["ETH", "Base", "ARB", "RH", "ARC", "SOL", "INK"]);
    expect(scanChainById("solana")).toMatchObject({ chainId: null, currency: "SOL", scanReady: false });
    expect(scanChainById("ink")).toMatchObject({ chainId: 57073, currency: "ETH", scanReady: false });
  });

  it("includes checked-in official SVG assets for both new chains", () => {
    for (const id of ["solana", "ink"] as const) {
      const content = readFileSync(join(process.cwd(), "public", scanChainById(id).icon), "utf8");
      expect(content).toMatch(/<svg[\s>]/);
      expect(content).toContain("<path");
      expect(content).not.toContain("<script");
    }
  });
});
