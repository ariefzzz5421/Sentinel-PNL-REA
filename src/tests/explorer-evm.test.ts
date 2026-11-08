import { describe, expect, it, vi } from "vitest";
import { scanExplorerEvm, ExplorerEvmError } from "../lib/explorer-evm";

const wallet = "0xB5D1C17749985F8Ba6F17dA81CE42FcE59d9f9f7";
const contract = "0x42411286529e1da56c7c8c7535737961b2e06955";
const counterparty = "0x" + "a".repeat(40);
const otherContract = "0x" + "b".repeat(40);
const tx = "0x" + "1".repeat(64);
const transfer = (overrides: Record<string, unknown> = {}) => ({
  from: { hash: counterparty }, to: { hash: wallet },
  token: { address_hash: contract, type: "ERC-721", name: "chain-society" },
  token_ids: ["683"], transaction_hash: tx, log_index: 4,
  timestamp: "2026-11-08T12:00:00.000Z",
  ...overrides,
});
const held = (overrides: Record<string, unknown> = {}) => ({
  id: "683", owner: { hash: wallet },
  token: { address_hash: contract, type: "ERC-721", name: "chain-society" },
  metadata: { name: "NFT #683", image: "https://example.org/683.png" },
  ...overrides,
});
const page = (items: unknown[], next_page_params: Record<string, unknown> | null = null, status = 200) =>
  new Response(JSON.stringify({ items, next_page_params }), { status });

describe("Blockscout Arc & Ink read-only NFT indexer", () => {
  it("returns verified wallet holdings and on-chain transfers with all PnL Unknown", async () => {
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("/token-transfers"))
        return page([transfer(), transfer({
          token: { address_hash: otherContract, type: "ERC-20", name: "Token" },
          token_ids: ["1"],
        }), transfer({
          from: { hash: wallet }, to: { hash: counterparty },
          transaction_hash: "0x" + "2".repeat(64), token_ids: ["682"],
        })]);
      return page([held(), held({ id: "99", owner: { hash: counterparty } })]);
    }) as unknown as typeof fetch;
    const result = await scanExplorerEvm("arc", wallet, undefined, fetcher);
    expect(result.chain).toBe("arc");
    expect(result.mode).toBe("recent-transfers");
    expect(result.pnlAvailable).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.assets).toHaveLength(3);
    expect(result.assets.map(x => x.kind).sort()).toEqual(["holding", "received", "sent"]);
    expect(result.note).toMatch(/USDC-native gas/);
    expect(result.note).toMatch(/Unknown/);
    expect(result.assets.find(x => x.kind === "holding")?.imageUrl).toBe("https://example.org/683.png");
    expect(requests).toHaveLength(2);
    expect(requests.every(x => x.options?.method === "GET")).toBe(true);
    expect(requests.every(x => x.url.startsWith("https://explorer.arc.io/api/v2/addresses/"))).toBe(true);
  });

  it("does not classify Arc or Ink NFT transfers as purchases or verified sales", async () => {
    const fetcher = vi.fn(async (url: string) =>
      page(String(url).includes("token-transfers") ? [transfer()] : [])) as unknown as typeof fetch;
    const result = await scanExplorerEvm("ink", wallet, undefined, fetcher);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({ kind: "received", name: "chain-society #683" });
    expect(result.pnlAvailable).toBe(false);
    expect(result.bitcoinPnl).toBeUndefined();
    expect(result.matchedPnl).toBeUndefined();
  });

  it("applies a contract filter to transfers and holdings, including cross-contract spam", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      requests.push(String(url));
      return String(url).includes("token-transfers")
        ? page([transfer(), transfer({
          token: { address_hash: otherContract, name: "spam", type: "ERC-721" },
          token_ids: ["55"],
        })])
        : page([held(), held({
          id: "55", token: { address_hash: otherContract, type: "ERC-721", name: "spam" },
        })]);
    }) as unknown as typeof fetch;
    const result = await scanExplorerEvm("ink", wallet, contract, fetcher);
    expect(result.assets).toHaveLength(2);
    expect(requests.some(u => u.includes("token=" + contract.toLowerCase()))).toBe(true);
  });

  it("follows the Blockscout next_page_params cursor without unbounded pages", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      requests.push(String(url));
      if (String(url).includes("/nft")) return page([]);
      return String(url).includes("block_number=25")
        ? page([transfer({ transaction_hash: "0x" + "3".repeat(64), log_index: 5 })])
        : page([transfer()], { block_number: 25, index: 4 });
    }) as unknown as typeof fetch;
    const result = await scanExplorerEvm("arc", wallet, undefined, fetcher);
    expect(result.assets).toHaveLength(2);
    expect(requests).toHaveLength(3);
    expect(requests.some(u => u.includes("block_number=25"))).toBe(true);
  });

  it("treats explorer rate limiting as partial if another indexed feed succeeds", async () => {
    const fetcher = vi.fn(async (url: string) =>
      String(url).includes("token-transfers")
        ? new Response("rate limit", { status: 429 })
        : page([held()])) as unknown as typeof fetch;
    const result = await scanExplorerEvm("ink", wallet, undefined, fetcher);
    expect(result.assets).toHaveLength(1);
    expect(result.note).toMatch(/Transfer history is unavailable/);
    expect(result.pnlAvailable).toBe(false);
  });

  it("fails instead of presenting a false zero when both provider surfaces fail", async () => {
    const fetcher = vi.fn(async () =>
      new Response("rate limit", { status: 429 })) as unknown as typeof fetch;
    await expect(scanExplorerEvm("arc", wallet, undefined, fetcher))
      .rejects.toMatchObject({ status: 429 } satisfies Partial<ExplorerEvmError>);
  });

  it("rejects invalid wallet/contract inputs before any network call", async () => {
    const fetcher = vi.fn(async () => page([])) as unknown as typeof fetch;
    await expect(scanExplorerEvm("arc", "not-a-wallet", undefined, fetcher))
      .rejects.toMatchObject({ status: 400 });
    await expect(scanExplorerEvm("ink", wallet, "invalid", fetcher))
      .rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
