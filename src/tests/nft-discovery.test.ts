import { afterEach, describe, expect, it, vi } from "vitest";
import { detectNonEvmWallet, isBitcoinAddress, isSolanaAddress } from "../lib/discovery-wallet";
import { discoverNfts, DiscoveryError, parseDiscoveryRequest } from "../lib/nft-discovery";

const sol = "11111111111111111111111111111111";
const btc = "bc1pr8vjq0fk89f5sw3r4n9scrasvw7kaud9akhzw57c3ygycsjspvvseyjcma";
const evm = "0xB5D1C17749985F8Ba6F17dA81CE42FcE59d9f9f7";
const contract = "0x1111111111111111111111111111111111111111";
afterEach(() => vi.unstubAllEnvs());

describe("multi-chain discovery is read-only and never fabricates profits", () => {
  it("detects 32-byte base58 Solana and Bitcoin address formats", () => {
    expect(isSolanaAddress(sol)).toBe(true);
    expect(isBitcoinAddress(btc)).toBe(true);
    expect(detectNonEvmWallet(sol)).toBe("solana");
    expect(detectNonEvmWallet(btc)).toBe("bitcoin");
    expect(detectNonEvmWallet(evm)).toBeNull();
    expect(isSolanaAddress("not-an-address")).toBe(false);
  });
  it("validates chain and bounded request body", () => {
    expect(parseDiscoveryRequest({ chain: "solana", address: sol }).chain).toBe("solana");
    expect(() => parseDiscoveryRequest({ chain: "ethereum", address: sol })).toThrow();
  });
  it("retrieves real Solana NFT metadata via Helius DAS but never calls a holding a trade", async () => {
    vi.stubEnv("HELIUS_API_KEY", "test-key");
    const fakeFetch = vi.fn(async (_url: unknown, args: RequestInit) => {
      if (String(_url).includes("/v0/addresses/"))
        return new Response(JSON.stringify([]), { status: 200 });
      const req = JSON.parse(String(args.body));
      expect(req.method).toBe("getAssetsByOwner");
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: "sentinel-discovery",
        result: { items: [
          { id: sol, interface: "V1_NFT", content: { metadata: { name: "Test NFT" },
            links: { image: "https://example.org/test.png" } } },
          { id: sol, interface: "FungibleToken", content: { metadata: { name: "Fungible" } } },
          { id: "11111111111111111111111111111112", interface: "CompressedNFT", content: { metadata: { name: "cNFT" } } },
          { id: "11111111111111111111111111111113", interface: "V1_NFT", compression: { compressed: true }, content: { metadata: { name: "Hidden cNFT" } } },
        ] },
      }), { status: 200 });
    });
    const result = await discoverNfts({ chain: "solana", address: sol }, fakeFetch as typeof fetch);
    expect(result.mode).toBe("holdings");
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].name).toBe("Test NFT");
    expect(result.pnlAvailable).toBe(false);
  });
  it("reads Ordiscan inscription ownership with bearer authentication and no invented BTC basis", async () => {
    vi.stubEnv("ORDISCAN_API_KEY", "test-token");
    const id = "a".repeat(64) + "i0";
    const fakeFetch = vi.fn(async (_url: unknown, args: RequestInit) => {
      expect((args.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      return new Response(JSON.stringify({ data: [{
        inscription_id: id, inscription_number: 123, owner_address: btc,
        content_type: "image/png", content_url: "https://ordiscan.com/content/" + id,
      }] }), { status: 200 });
    });
    const result = await discoverNfts({ chain: "bitcoin", address: btc }, fakeFetch as typeof fetch);
    expect(result.assets[0].name).toBe("Inscription #123");
    expect(result.pnlAvailable).toBe(false);
  });
  it("reads bounded Ink ERC-721 Transfer logs without classifying transfers as buys", async () => {
    vi.stubEnv("INK_RPC_URL", "https://rpc-gel.inkonchain.com");
    const topic = "0x" + evm.toLowerCase().slice(2).padStart(64, "0");
    const hash = "0x" + "a".repeat(64);
    const fakeFetch = vi.fn(async (_url: unknown, args: RequestInit) => {
      const request = JSON.parse(String(args.body));
      let result: unknown;
      if (request.method === "eth_chainId") result = "0xdef1";
      else if (request.method === "eth_blockNumber") result = "0x2710";
      else if (request.method === "eth_getLogs" && request.params[0].topics[2] === topic) result = [{
        transactionHash: hash, logIndex: "0x1",
        topics: [request.params[0].topics[0], "0x" + "0".repeat(64), topic,
          "0x" + "0".repeat(63) + "1"],
      }];
      else result = [];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    });
    const result = await discoverNfts({ chain: "ink", address: evm, contract }, fakeFetch as typeof fetch);
    expect(result.mode).toBe("recent-transfers");
    expect(result.partial).toBe(true);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].kind).toBe("received");
    expect(result.pnlAvailable).toBe(false);
  });
  it("reports missing provider configuration without returning secret values", async () => {
    vi.stubEnv("HELIUS_API_KEY", "");
    await expect(discoverNfts({ chain: "solana", address: sol })).rejects.toMatchObject({
      status: 503, message: "HELIUS_API_KEY is missing in this deployment.",
    } satisfies Partial<DiscoveryError>);
  });
});
