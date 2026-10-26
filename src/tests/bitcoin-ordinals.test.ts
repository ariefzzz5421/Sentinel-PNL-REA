import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateBitcoinPnl } from "../lib/bitcoin-pnl";
import { scanBitcoinOrdinals, BitcoinProviderError } from "../lib/bitcoin-ordinals";

const wallet = "bc1pr8vjq0fk89f5sw3r4n9scrasvw7kaud9akhzw57c3ygycsjspvvseyjcma";
const other = "bc1p4r4jq6l5n22sw34x5fjnknsc4fsz7pe62dj26vyntfdal5a20ffswdt2cz";
const heldId = "a".repeat(64) + "i0";
const soldId = "b".repeat(64) + "i1";
const buyHeldTx = "1".repeat(64);
const buySoldTx = "2".repeat(64);
const sellTx = "3".repeat(64);
const when = (day: number) => `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`;
const json = (value: unknown, status=200) =>
  new Response(JSON.stringify(value), { status });

afterEach(() => vi.unstubAllEnvs());
describe("Bitcoin Ordinals conservative PnL", () => {
  it("only matches verified sale price by inscription and settlement txid", () => {
    const pnl = calculateBitcoinPnl(wallet, [{ id: heldId, collection: "wizards" }],
      [
        { inscriptionId: heldId, txid: buyHeldTx, direction: "received", counterpart: other,
          timestamp: when(1), spentAsFee: false },
        { inscriptionId: soldId, txid: buySoldTx, direction: "received", counterpart: other,
          timestamp: when(2), spentAsFee: false },
        { inscriptionId: soldId, txid: sellTx, direction: "sent", counterpart: other,
          timestamp: when(3), spentAsFee: false },
      ],
      [
        { inscriptionId: heldId, txid: buyHeldTx, buyer: wallet, seller: other,
          priceSats: 10000n, timestamp: when(1) },
        { inscriptionId: soldId, txid: buySoldTx, buyer: wallet, seller: other,
          priceSats: 25000n, timestamp: when(2) },
        { inscriptionId: soldId, txid: sellTx, buyer: other, seller: wallet,
          priceSats: 40000n, timestamp: when(3) },
      ], { wizards: 13000n });
    expect(pnl.realizedBtc).toBe("0.00015000");
    expect(pnl.unrealizedBtc).toBe("0.00003000");
    expect(pnl.roiPct).toBe(60);
    expect(pnl.matchedSales).toBe(1);
    expect(pnl.pricedHoldings).toBe(1);
    expect(pnl.trades[0].type).toBe("sell");
  });
  it("never turns transfers, incorrect txids, or unpaired sales into PnL", () => {
    const pnl = calculateBitcoinPnl(wallet, [{ id: heldId, collection: null }],
      [
        { inscriptionId: heldId, txid: buyHeldTx, direction: "received", counterpart: other,
          timestamp: when(1), spentAsFee: false },
        { inscriptionId: soldId, txid: sellTx, direction: "sent", counterpart: other,
          timestamp: when(3), spentAsFee: false },
      ],
      [
        { inscriptionId: heldId, txid: buySoldTx, buyer: wallet, seller: other,
          priceSats: 10000n, timestamp: when(1) },
        { inscriptionId: soldId, txid: sellTx, buyer: other, seller: wallet,
          priceSats: 40000n, timestamp: when(3) },
      ], { Unclassified: 100000n });
    expect(pnl.realizedBtc).toBeNull();
    expect(pnl.unrealizedBtc).toBeNull();
    expect(pnl.roiPct).toBeNull();
    expect(pnl.unknownBasisSales).toBe(1);
    expect(pnl.trades[1].type).toBe("received");
    expect(pnl.trades[1].priceBtc).toBeNull();
  });
  it("reads real-format Ordiscan pages and confirmed ORD.NET sale records without signing", async () => {
    vi.stubEnv("ORDISCAN_API_KEY", "server-ordiscan-token");
    vi.stubEnv("ORD_NET_SESSION_TOKEN", "server-ord-net-session");
    const calls: Array<{ url: string; options: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      calls.push({ url: String(url), options });
      if (url.includes("/inscriptions?page=1"))
        return json({ data: [{ inscription_id: heldId, owner_address: wallet,
          inscription_number: 150, content_type: "image/png",
          content_url: "https://ordiscan.com/content/" + heldId,
          collection_slug: "wizards" }] });
      if (url.includes("/activity?"))
        return json({ data: [
          { inscription_id: heldId, txid: buyHeldTx, type: "RECEIVE",
            counterpart_address: other, confirmed: true, timestamp: when(1) },
          { inscription_id: soldId, txid: buySoldTx, type: "RECEIVE",
            counterpart_address: other, confirmed: true, timestamp: when(2) },
          { inscription_id: soldId, txid: sellTx, type: "SEND",
            counterpart_address: other, confirmed: true, timestamp: when(3) },
        ] });
      if (url.includes("/v1/inscription/" + soldId))
        return json({ data: { inscription_id: soldId, collection_slug: "wizards" } });
      if (url.includes("/collection-stats/floors"))
        return json({ success: true, data: [{ slug: "wizards", floor: 13000 }] });
      if (url.includes("/api/v1/sales"))
        return json({ sales: [
          { inscriptionId: heldId, txid: buyHeldTx, buyerAddress: wallet,
            sellerAddress: other, priceSats: 10000, saleType: "internal", soldAt: when(1) },
          { inscriptionId: soldId, txid: buySoldTx, buyerAddress: wallet,
            sellerAddress: other, priceSats: 25000, saleType: "external", soldAt: when(2) },
          { inscriptionId: soldId, txid: sellTx, buyerAddress: other,
            sellerAddress: wallet, priceSats: 40000, saleType: "internal", soldAt: when(3) },
        ], pagination: { hasNext: false, nextCursor: null } });
      throw new Error("Unexpected URL " + url);
    });
    const result = await scanBitcoinOrdinals(wallet, fetcher as typeof fetch);
    expect(result.assets).toHaveLength(1);
    expect(result.report.matchedSales).toBe(1);
    expect(result.report.realizedBtc).toBe("0.00015000");
    expect(result.report.unrealizedBtc).toBe("0.00003000");
    expect(result.partial).toBe(true);
    expect(calls.every(c => c.options.method === "GET")).toBe(true);
    expect(calls.filter(c=>c.url.includes("ord.net")).every(c =>
      (c.options.headers as Record<string,string>).Authorization === "Bearer server-ord-net-session")).toBe(true);
    expect(calls.filter(c=>c.url.includes("ordiscan.com")).every(c =>
      (c.options.headers as Record<string,string>).Authorization === "Bearer server-ordiscan-token")).toBe(true);
  });
  it("shows unknown cost when ORD.NET server session is not configured", async () => {
    vi.stubEnv("ORDISCAN_API_KEY", "test-key");
    vi.stubEnv("ORD_NET_SESSION_TOKEN", "");
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/inscriptions")) return json({ data: [{
        inscription_id: heldId, owner_address: wallet, inscription_number: 100,
        collection_slug: null }] });
      if (url.includes("/activity")) return json({ data: [{
        inscription_id: heldId, txid: buyHeldTx, type: "RECEIVE", confirmed: true,
        counterpart_address: other, timestamp: when(1) }] });
      throw Error("Unexpected query");
    });
    const result = await scanBitcoinOrdinals(wallet, fetcher as typeof fetch);
    expect(result.assets).toHaveLength(1);
    expect(result.report.realizedBtc).toBeNull();
    expect(result.report.unrealizedBtc).toBeNull();
    expect(result.report.trades[0].type).toBe("received");
    expect(fetcher.mock.calls.every(c=>!String(c[0]).includes("ord.net"))).toBe(true);
  });
  it("does not misreport holdings when Ordiscan hits rate limits", async () => {
    vi.stubEnv("ORDISCAN_API_KEY", "test-key");
    const fetcher = vi.fn(async () => json({error: "rate limited"}, 429));
    await expect(scanBitcoinOrdinals(wallet, fetcher as typeof fetch))
      .rejects.toMatchObject({status:429} satisfies Partial<BitcoinProviderError>);
  });
});
