import { describe, expect, it, vi } from "vitest";
import { autoEvmChains, detectAutomaticWalletFamily, scanAllEvmNetworks } from "../lib/automatic-scan";

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

describe("one-click automatic multi-network scanner", () => {
  it("detects wallet family without requiring chain selection", () => {
    expect(detectAutomaticWalletFamily(wallet)).toEqual({ kind: "evm" });
    expect(detectAutomaticWalletFamily(btc)).toEqual({ kind: "discovery", chain: "bitcoin", address: btc });
    expect(detectAutomaticWalletFamily(sol)).toEqual({ kind: "discovery", chain: "solana", address: sol });
    expect(() => detectAutomaticWalletFamily(wallet + "\n" + btc)).toThrow(/one Bitcoin or Solana/);
    expect(autoEvmChains).toEqual(["ethereum", "base", "arbitrum", "robinhood"]);
    expect(autoEvmChains).not.toContain("arc");
    expect(autoEvmChains).not.toContain("ink");
  });

  it("finds Robinhood NFT trades even without clicking RH, preserving chain identity", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      requests.push(request.chain);
      return new Response(JSON.stringify({
        events: request.chain === "robinhood" ? [rhSale] : [],
        partial: false,
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const progress: string[] = [];
    const result = await scanAllEvmNetworks([wallet], "wallet", undefined,
      fetcher, (done, total) => progress.push(done + "/" + total));
    expect(requests).toEqual(["ethereum", "base", "arbitrum", "robinhood"]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      chain: "robinhood", contract, tokenId: "683", txHash, amountEth: "0.0304",
    });
    expect(result.statuses.find(x => x.chain === "robinhood"))
      .toMatchObject({ checked: 1, failed: 0, eventCount: 1 });
    expect(result.requestsSucceeded).toBe(4);
    expect(result.partial).toBe(false);
    expect(progress).toEqual(["2/4", "4/4"]);
  });

  it("keeps successful chain results when another chain has a provider outage", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      return request.chain === "base"
        ? new Response(JSON.stringify({ error: "Base provider rate limit" }), { status: 429 })
        : new Response(JSON.stringify({
          events: request.chain === "robinhood" ? [rhSale] : [], partial: false,
        }));
    }) as unknown as typeof fetch;
    const result = await scanAllEvmNetworks([wallet], "wallet", undefined, fetcher);
    expect(result.events).toHaveLength(1);
    expect(result.requestsFailed).toBe(1);
    expect(result.partial).toBe(true);
    expect(result.warnings.join(" ")).toContain("Base provider rate limit");
    expect(result.statuses.find(s => s.chain === "base"))
      .toMatchObject({ checked: 0, failed: 1 });
  });

  it("rejects wrong-wallet, wrong-chain, wrong-contract events and retains chain filters", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({
        events: request.chain === "robinhood" ? [
          rhSale,
          { ...rhSale, id: "wrong-chain", chain: "base" },
          { ...rhSale, id: "wrong-contract", contract: "0x" + "f".repeat(40) },
        ] : [], partial: false,
      }));
    }) as unknown as typeof fetch;
    const result = await scanAllEvmNetworks([wallet], "contract", contract, fetcher);
    expect(result.events.map(event => event.id)).toEqual([rhSale.id]);
    expect(result.partial).toBe(true);
    expect(result.warnings.join(" ")).toContain("Mismatched");
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0]?.[1]?.body))).toMatchObject({
      chain: "ethereum", mode: "contract", contract,
    });
  });

  it("fails visibly when all network providers fail", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Provider unavailable" }), { status: 503 })) as unknown as typeof fetch;
    await expect(scanAllEvmNetworks([wallet], "wallet", undefined, fetcher))
      .rejects.toThrow(/All supported EVM network scans failed/);
  });

  it("scans every supported network for each input address, without duplicate wallet requests", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ events: [], partial: false }))) as unknown as typeof fetch;
    const result = await scanAllEvmNetworks([wallet, wallet.toLowerCase()], "wallet", undefined, fetcher);
    expect(result.requestsSucceeded).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
