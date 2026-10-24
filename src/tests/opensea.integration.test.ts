import { describe, expect, it, vi } from "vitest";
import { getOpenSeaEvents } from "../lib/providers/opensea";
import { calculatePnl } from "../lib/pnl/calculate";
import type { ScanRequest } from "../lib/providers/normalized";

const wallet = "0xB5D1C17749985F8Ba6F17dA81CE42FcE59d9f9f7";
const contract = "0x0000000000000000000000000000000000000001";
const counterparty = "0x0000000000000000000000000000000000000002";
const zero = "0x0000000000000000000000000000000000000000";
const request: ScanRequest = { address: wallet, chain: "ethereum", mode: "wallet" };
const sale = (type: "buy" | "sell", eth: string, time: number) => ({
  event_type: "sale",
  event_timestamp: time,
  chain: "ethereum",
  buyer: type === "buy" ? wallet : counterparty,
  seller: type === "sell" ? wallet : counterparty,
  nft: { contract, identifier: "9", collection: "Original Collection", token_standard: "erc721" },
  quantity: 1,
  payment: { symbol: "ETH", quantity: eth, decimals: 18, token_address: zero },
  transaction: "0x" + (type === "buy" ? "1" : "2").repeat(64),
});
describe("OpenSea adapter and PnL engine", () => {
  it("follows next cursor and calculates matched ETH-denominated NFT PnL", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const kind = url.searchParams.get("event_type");
      if (kind !== "sale") return new Response(JSON.stringify({ asset_events: [], next: null }), { status: 200 });
      const second = url.searchParams.get("next") === "cursor-2";
      return new Response(JSON.stringify({
        asset_events: [second ? sale("sell", "2000000000000000000", 1800000000) : sale("buy", "1000000000000000000", 1700000000)],
        next: second ? null : "cursor-2",
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const data = await getOpenSeaEvents(request, "test-key", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(data.events).toHaveLength(2);
    const summary = calculatePnl(data.events);
    expect(summary.realizedEth).toBe("1");
    expect(summary.estimatedSales).toBe(1);
    expect(summary.unknownBasisSales).toBe(0);
    expect(data.warning).toContain("fees");
  });
  it("requests 200 sale events per page and reports partial history after six pages", async () => {
    let pageNumber = 0;
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("limit")).toBe("200");
      if (url.searchParams.get("event_type") !== "sale") return new Response(JSON.stringify({ asset_events: [], next: null }), { status: 200 });
      pageNumber++;
      return new Response(JSON.stringify({
        asset_events: [sale("buy", "1000000000000000000", 1700000000 + pageNumber)],
        next: "cursor-" + pageNumber,
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await getOpenSeaEvents(request, "test-key", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(result.partial).toBe(true);
    expect(result.warning).toContain("1,200-event");
  });
  it("skips unsupported currencies without treating price as zero", async () => {
    const bad = { ...sale("buy", "1000000000000000000", 1700000000), payment: { symbol: "USDC", quantity: "1000000", decimals: 6, token_address: "0x0000000000000000000000000000000000000003" } };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ asset_events: [bad], next: null }))) as unknown as typeof fetch;
    const result = await getOpenSeaEvents(request, "test-key", fetcher);
    expect(result.events).toHaveLength(0);
    expect(result.partial).toBe(true);
  });
  it("detects mint and transfer-in without inventing zero-cost profit", async () => {
    const mintTx = "0x" + "a".repeat(64);
    const transferTx = "0x" + "b".repeat(64);
    const minted = {
      event_type: "mint", event_timestamp: 1700000000, chain: "ethereum",
      asset: { contract, identifier: "9", collection: "Original Collection", token_standard: "erc721" },
      maker: wallet, transaction: mintTx, quantity: 1,
    };
    const transfer = {
      event_type: "transfer", event_timestamp: 1700000020, chain: "ethereum",
      nft: { contract, identifier: "10", collection: "Original Collection", token_standard: "erc721" },
      from_address: counterparty, to_address: wallet, transaction: transferTx, quantity: 1,
    };
    const laterSale = { ...sale("sell", "2000000000000000000", 1800000000), transaction: "0x" + "c".repeat(64) };
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const kind = new URL(String(input)).searchParams.get("event_type");
      return new Response(JSON.stringify({
        asset_events: kind === "mint" ? [minted] : kind === "transfer" ? [transfer] : [laterSale],
        next: null,
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const scan = await getOpenSeaEvents(request, "test-key", fetcher);
    const result = calculatePnl(scan.events);
    expect(scan.events.map(x => x.type).sort()).toEqual(["mint", "sell", "transfer_in"]);
    expect(result.mints).toBe(1);
    expect(result.transfersIn).toBe(1);
    expect(result.buys).toBe(0);
    expect(result.unknownBasisSales).toBe(1);
    expect(result.realizedEth).toBe("0");
  });
  it("deduplicates transfer records accompanying a purchase", async () => {
    const tx = "0x" + "f".repeat(64);
    const bought = { ...sale("buy", "1000000000000000000", 1700000000), transaction: tx };
    const transfer = {
      event_type: "transfer", event_timestamp: 1700000000, chain: "ethereum",
      nft: bought.nft, from_address: counterparty, to_address: wallet, transaction: tx, quantity: 1,
    };
    const fetcher = vi.fn(async (input: URL | RequestInfo) =>
      new Response(JSON.stringify({
        asset_events: new URL(String(input)).searchParams.get("event_type") === "sale" ? [bought] :
          new URL(String(input)).searchParams.get("event_type") === "transfer" ? [transfer] : [],
        next: null,
      }), { status: 200 })) as unknown as typeof fetch;
    const result = await getOpenSeaEvents(request, "test-key", fetcher);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("buy");
  });
  it("returns an actionable 503 when the key is rejected", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(getOpenSeaEvents(request, "test-key", fetcher)).rejects.toMatchObject({ status: 503 });
  });
});
