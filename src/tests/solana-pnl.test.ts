import { afterEach, describe, expect, it, vi } from "vitest";
import { getMatchedSolPnl } from "../lib/solana-pnl";

const wallet = "11111111111111111111111111111111";
const seller = "11111111111111111111111111111112";
const mint = "11111111111111111111111111111113";
afterEach(() => vi.unstubAllGlobals());

const sale = (buyer: string, sellerAddr: string, amount: number, signature: string, timestamp: number) => ({
  type: "NFT_SALE", signature, timestamp, events: { nft: {
    buyer, seller: sellerAddr, amount, nfts: [{ mint, tokenStandard: "NonFungible" }],
  } },
});

describe("Helius Solana conservative historical NFT PnL", () => {
  it("computes profit only from matched single-NFT buy and sell events in lamports", async () => {
    const rows = [sale(wallet, seller, 2_000_000_000, "buy", 1),
      sale(seller, wallet, 3_000_000_000, "sell", 2)];
    const fetcher = vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 }));
    const result = await getMatchedSolPnl(wallet, "fake-key", fetcher as typeof fetch);
    expect(result).toMatchObject({ grossSol: "1.000000", matchedSales: 1,
      unmatchedSales: 0, partialHistory: true });
  });
  it("never invents cost basis for sale-only or missing history", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      sale(seller, wallet, 4_000_000_000, "sell", 2),
    ]), { status: 200 }));
    expect(await getMatchedSolPnl(wallet, "fake-key", fetcher as typeof fetch)).toBeNull();
  });
  it("skips bundles and compressed NFT standards", async () => {
    const bundle = sale(wallet, seller, 1_000_000_000, "b1", 1);
    bundle.events.nft.nfts.push({ mint, tokenStandard: "NonFungible" });
    const compressed = sale(wallet, seller, 2_000_000_000, "c1", 1);
    compressed.events.nft.nfts[0].tokenStandard = "CompressedNonFungible";
    const fetcher = vi.fn(async () => new Response(JSON.stringify([bundle, compressed]), { status: 200 }));
    expect(await getMatchedSolPnl(wallet, "fake-key", fetcher as typeof fetch)).toBeNull();
  });
  it("keeps NFT discovery usable when Helius Enhanced API is restricted", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 403 }));
    expect(await getMatchedSolPnl(wallet, "fake-key", fetcher as typeof fetch)).toBeNull();
  });
});
