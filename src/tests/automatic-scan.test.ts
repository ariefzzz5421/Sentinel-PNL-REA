import { describe, expect, it, vi } from "vitest";
import {
  autoEvmChains, autoPricedChains, detectAutomaticWalletFamily, scanAllEvmNetworks,
} from "../lib/automatic-scan";

const wallet = "0xB5D1C17749985F8Ba6F17dA81CE42FcE59d9f9f7";
const contract = "0x42411286529e1da56c7c8c7535737961b2e06955";
const txHash = "0xb38a89fb44de22c9d82650e4dd2941fd68ad56ee96a5b194c14301b174fe8b8b";
const btc = "bc1pr8vjq0fk89f5sw3r4n9scrasvw7kaud9akhzw57c3ygycsjspvvseyjcma";
const sol = "11111111111111111111111111111111";
const rhSale = {
  id: "opensea:robinhood:example", date: "2026-11-08T04:00:00.000Z",
  chain: "robinhood", wallet, contract, collection: "chain-society",
  tokenId: "683", type: "sell", amountEth: "0.0304",
  feeEth: "0", feeKnown: false, txHash,
};
const exampleDiscovery = (chain: "ink" | "arc", address: string) => ({
  chain, address,
  assets: [{
    id: "indexed:" + chain + ":1", name: chain + " NFT #1",
    imageUrl: null, collection: "Index NFT",
    kind: chain === "ink" ? "received" : "holding",
    url: "https://explorer.arc.io/tx/" + txHash,
  }],
  mode: "recent-transfers", partial: true, pnlAvailable: false,
  note: chain + " unpriced NFT events. Purchase and sale prices Unknown.",
});
function mockNetwork(options?: { fail?: string; wrongDiscovery?: boolean; mismatches?: boolean }) {
  const calls: Array<{ endpoint: string; chain: string; contract?: string }> = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body));
    calls.push({ endpoint: String(url), chain: req.chain, contract: req.contract });
    if (req.chain === options?.fail)
      return new Response(JSON.stringify({ error: "Provider rate limit" }), { status: 429 });
    if (String(url) === "/api/nft-discovery")
      return new Response(JSON.stringify(exampleDiscovery(req.chain, options?.wrongDiscovery ? "0x" + "a".repeat(40) : req.address)));
    return new Response(JSON.stringify({
      events: req.chain === "robinhood" ? [rhSale,
        ...(options?.mismatches ? [
          { ...rhSale, id: "wrong-chain", chain: "base" },
          { ...rhSale, id: "wrong-contract", contract: "0x" + "f".repeat(40) },
        ] : [])] : [],
      partial: false,
    }));
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("one-click automatic EVM scanner for every supported network", () => {
  it("detects wallet family without requiring chain selection", () => {
    expect(detectAutomaticWalletFamily(wallet)).toEqual({ kind: "evm" });
    expect(detectAutomaticWalletFamily(btc)).toEqual({ kind: "discovery", chain: "bitcoin", address: btc });
    expect(detectAutomaticWalletFamily(sol)).toEqual({ kind: "discovery", chain: "solana", address: sol });
    expect(() => detectAutomaticWalletFamily(wallet + "\n" + btc)).toThrow(/one Bitcoin or Solana/);
    expect(autoPricedChains).toEqual(["ethereum", "base", "arbitrum", "robinhood"]);
    expect(autoEvmChains).toEqual(["ethereum", "base", "arbitrum", "robinhood", "arc", "ink"]);
  });

  it("auto-fetches RH priced trades plus Arc/Ink unpriced NFT discovery without CA", async () => {
    const { fetcher, calls } = mockNetwork();
    const progress: string[] = [];
    const result = await scanAllEvmNetworks([wallet], "wallet", undefined, fetcher,
      (complete, total) => progress.push(complete + "/" + total));
    expect(calls.map(c => c.chain)).toEqual(["ethereum", "base", "arbitrum", "robinhood", "arc", "ink"]);
    expect(calls.slice(0, 4).every(c => c.endpoint === "/api/scan")).toBe(true);
    expect(calls.slice(4).every(c => c.endpoint === "/api/nft-discovery" && !c.contract)).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      chain: "robinhood", contract, tokenId: "683", txHash, amountEth: "0.0304",
    });
    expect(result.discoveries).toHaveLength(2);
    expect(result.discoveries.map(x => x.chain)).toEqual(["arc", "ink"]);
    expect(result.discoveries.every(x => x.pnlAvailable === false)).toBe(true);
    expect(result.statuses.find(s => s.chain === "arc"))
      .toMatchObject({ checked: 1, failed: 0, eventCount: 0, holdingCount: 1, coverage: "unpriced-transfers" });
    expect(result.statuses.find(s => s.chain === "ink"))
      .toMatchObject({ checked: 1, failed: 0, eventCount: 1, holdingCount: 0, coverage: "unpriced-transfers" });
    expect(result.statuses.find(s => s.chain === "robinhood"))
      .toMatchObject({ checked: 1, failed: 0, eventCount: 1, coverage: "priced-sales" });
    expect(result.requestsSucceeded).toBe(6);
    expect(result.partial).toBe(true); // Unpriced explorers cannot prove complete PnL.
    expect(progress).toEqual(["2/6", "4/6", "6/6"]);
  });

  it("keeps RH and Ink activity when Base is rate limited", async () => {
    const { fetcher } = mockNetwork({ fail: "base" });
    const result = await scanAllEvmNetworks([wallet], "wallet", undefined, fetcher);
    expect(result.events).toHaveLength(1);
    expect(result.discoveries).toHaveLength(2);
    expect(result.requestsFailed).toBe(1);
    expect(result.partial).toBe(true);
    expect(result.warnings.join(" ")).toContain("BASE: Provider rate limit");
    expect(result.statuses.find(s => s.chain === "base"))
      .toMatchObject({ checked: 0, failed: 1 });
  });

  it("rejects mismatched EVM paid events and retains contract filters for all networks", async () => {
    const { fetcher, calls } = mockNetwork({ mismatches: true });
    const result = await scanAllEvmNetworks([wallet], "contract", contract, fetcher);
    expect(result.events.map(event => event.id)).toEqual([rhSale.id]);
    expect(result.warnings.join(" ")).toContain("Mismatched");
    expect(calls.map(c => c.contract)).toEqual(Array(6).fill(contract));
    expect(result.discoveries).toHaveLength(2);
  });

  it("does not accept another wallet's Arc/Ink activity", async () => {
    const { fetcher } = mockNetwork({ wrongDiscovery: true });
    const result = await scanAllEvmNetworks([wallet], "wallet", undefined, fetcher);
    expect(result.discoveries).toHaveLength(0);
    expect(result.requestsFailed).toBe(2);
    expect(result.events).toHaveLength(1);
  });

  it("fails clearly when every network provider is unavailable", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Provider unavailable" }), { status: 503 })) as unknown as typeof fetch;
    await expect(scanAllEvmNetworks([wallet], "wallet", undefined, fetcher))
      .rejects.toThrow(/All supported EVM network scans failed/);
  });

  it("deduplicates wallet inputs across all 6 EVM networks", async () => {
    const { fetcher } = mockNetwork();
    const result = await scanAllEvmNetworks([wallet, wallet.toLowerCase()], "wallet", undefined, fetcher);
    expect(result.requestsSucceeded).toBe(6);
    expect(vi.mocked(fetcher).mock.calls).toHaveLength(6);
  });
});
