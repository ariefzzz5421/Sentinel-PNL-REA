import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/reservoir-activity.synthetic.json";
import { getReservoirEvents } from "../lib/providers/reservoir";
import { calculatePnl } from "../lib/pnl/calculate";
import { POST } from "../app/api/scan/route";

const address = "0x000000000000000000000000000000000000dEaD";
const input = { address, chain: "ethereum" as const, mode: "wallet" as const };
const mockPages = () => {
  const calls: URL[] = [];
  const fetcher = vi.fn(async (url: URL) => {
    calls.push(url);
    const page = url.searchParams.has("continuation") ? fixture.pages[1] : fixture.pages[0];
    return new Response(JSON.stringify(page), { status: 200 });
  });
  return { calls, fetcher };
};

describe("Reservoir activity adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESERVOIR_API_KEY; });
  it("paginates, deduplicates and excludes unpriced or non-ETH sales", async () => {
    const { calls, fetcher } = mockPages();
    const result = await getReservoirEvents(input, "fixture-key", fetcher as typeof fetch);
    expect(calls).toHaveLength(2);
    expect(calls[0].hostname).toBe("api.reservoir.tools");
    expect(calls[1].searchParams.get("continuation")).toBe("next-page");
    expect(result.events.map((event) => event.type).sort()).toEqual(["buy", "mint", "sell"]);
    expect(result.events.find((event) => event.type === "buy")?.txHash).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(result.events.every((event) => event.feeKnown === false)).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.warning).toContain("2 activity record");
    const pnl = calculatePnl(result.events);
    expect(pnl.realizedEth).toBe("0.5");
    expect(pnl.estimatedSales).toBe(1);
    expect(pnl.openPositions).toBe(1);
  });
  it.each(["base", "arbitrum"] as const)("uses the verified %s host", async (chain) => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/users/activity/v6");
      return new Response(JSON.stringify({ activities: [], continuation: null }));
    });
    await getReservoirEvents({ ...input, chain }, "fixture-key", fetcher as typeof fetch);
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.hostname).toBe(`api-${chain}.reservoir.tools`);
  });
  it("runs Scan API → adapter → PnL with no fabricated fees", async () => {
    const { fetcher } = mockPages();
    process.env.RESERVOIR_API_KEY = "fixture-key";
    vi.stubGlobal("fetch", fetcher);
    const request = new Request("http://localhost/api/scan", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    const pnl = calculatePnl(body.events);
    expect(body.partial).toBe(true);
    expect(pnl.realizedEth).toBe("0.5");
    expect(pnl.estimatedSales).toBe(1);
  });
  it("returns a rate-limit error without partial financial data", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 429 }));
    await expect(getReservoirEvents(input, "fixture-key", fetcher as typeof fetch)).rejects.toMatchObject({ status: 429 });
  });
});
