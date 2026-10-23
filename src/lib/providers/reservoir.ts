import Decimal from "decimal.js";
import { z } from "zod";
import { addressSchema, eventSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { ProviderError, type ScanRequest } from "./normalized";

const hosts: Record<Chain, string> = {
  ethereum: "https://api.reservoir.tools",
  base: "https://api-base.reservoir.tools",
  arbitrum: "https://api-arbitrum.reservoir.tools",
  robinhood: "https://api.reservoir.tools",
};
const nativeCurrencies = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);
const wrappedEth: Record<Chain, string> = {
  ethereum: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  base: "0x4200000000000000000000000000000000000006",
  arbitrum: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  robinhood: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
};
const pageSchema = z.object({
  activities: z.array(z.unknown()).max(20),
  continuation: z.string().min(1).max(2000).nullable().optional(),
});
type ScanData = { events: TradeEvent[]; partial: boolean; warning?: string };
const cache = new Map<string, { expires: number; data: ScanData }>();
const activitySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.enum(["sale", "mint", "transfer", "ask", "bid", "ask_cancel", "bid_cancel"]),
  eventTimestamp: z.union([z.number(), z.string()]).optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  txHash: z.string().optional(),
  logIndex: z.number().optional(),
  batchIndex: z.number().optional(),
  fromAddress: z.string().nullable().optional(),
  toAddress: z.string().nullable().optional(),
  amount: z.number().optional(),
  quantity: z.number().optional(),
  token: z.object({
    contract: z.string(),
    tokenId: z.union([z.string(), z.number()]),
    kind: z.string().optional(),
    name: z.string().nullable().optional(),
    collection: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
  }),
  collection: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
  price: z.object({
    currency: z.object({ contract: z.string(), decimals: z.number().int().min(0).max(36).optional() }),
    amount: z.object({ native: z.union([z.number(), z.string()]).nullable().optional(), raw: z.string().nullable().optional() }),
  }).nullable().optional(),
});

function ethAmount(activity: z.infer<typeof activitySchema>, chain: Chain): string | null {
  const price = activity.price;
  if (!price) return null;
  const currency = price.currency.contract.toLowerCase();
  if (!nativeCurrencies.has(currency) && currency !== wrappedEth[chain]) return null;
  try {
    const value = price.amount.raw && /^\d+$/.test(price.amount.raw)
      ? new Decimal(price.amount.raw).div(new Decimal(10).pow(price.currency.decimals ?? 18))
      : new Decimal(price.amount.native ?? NaN);
    if (!value.isFinite() || value.isNegative() || value.decimalPlaces() > 18) return null;
    return value.toFixed();
  } catch {
    return null;
  }
}

function mapActivity(raw: unknown, input: ScanRequest): TradeEvent | null {
  const parsed = activitySchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  if (item.type !== "sale" && item.type !== "mint") return null;
  if ((item.amount !== undefined && item.amount !== 1) ||
      (item.quantity !== undefined && item.quantity !== 1) ||
      item.token.kind === "erc1155") return null; // existing ledger is one NFT per lot
  const wallet = input.address.toLowerCase();
  const from = item.fromAddress?.toLowerCase();
  const to = item.toAddress?.toLowerCase();
  const type = item.type === "mint" ? "mint" : to === wallet && from !== wallet ? "buy" : from === wallet && to !== wallet ? "sell" : null;
  if (!type || (type === "mint" && to !== wallet)) return null;
  const contract = item.token.contract.toLowerCase();
  if (!addressSchema.safeParse(contract).success || (input.contract && contract !== input.contract.toLowerCase())) return null;
  const amountEth = ethAmount(item, input.chain);
  if (amountEth === null) return null;
  const seconds = Number(item.eventTimestamp ?? item.timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const moment = new Date(seconds < 1e12 ? seconds * 1000 : seconds);
  if (Number.isNaN(moment.getTime())) return null;
  const date = moment.toISOString();
  const tokenId = String(item.token.tokenId);
  const identity = item.id ?? (item.txHash && item.logIndex !== undefined
    ? `${item.txHash}:${item.logIndex}:${item.batchIndex ?? 0}:${contract}:${tokenId}` : null);
  if (identity === null) return null;
  const event = eventSchema.safeParse({
    id: `reservoir:${input.chain}:${identity}`,
    date,
    chain: input.chain,
    wallet,
    collection: item.token.collection?.name || item.collection?.name || item.token.name || `${contract.slice(0, 8)}…`,
    contract,
    tokenId,
    type,
    amountEth,
    feeEth: "0",
    feeKnown: false,
    txHash: item.txHash,
  });
  return event.success ? event.data : null;
}

/** Fetches bounded pages from Reservoir's documented user activity v6 endpoint. */
export async function getReservoirEvents(
  input: ScanRequest,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<{ events: TradeEvent[]; partial: boolean; warning?: string }> {
  const cacheKey = `${input.chain}:${input.address.toLowerCase()}:${input.contract?.toLowerCase() || ""}:${input.mode}`;
  const useCache = fetcher === fetch;
  const cached = useCache ? cache.get(cacheKey) : undefined;
  if (cached && cached.expires > Date.now()) return cached.data;
  const events = new Map<string, TradeEvent>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let skipped = 0;
  let partial = false;
  let truncated = false;
  const maxPages = 25;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("/users/activity/v6", hosts[input.chain]);
    url.searchParams.set("users", input.address);
    url.searchParams.set("types", "sale");
    url.searchParams.append("types", "mint");
    url.searchParams.set("sortBy", "eventTimestamp");
    url.searchParams.set("includeMetadata", "true");
    url.searchParams.set("limit", "20");
    if (cursor) url.searchParams.set("continuation", cursor);
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { accept: "application/json", "x-api-key": apiKey },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new ProviderError("Reservoir request timed out or could not connect.", 502);
    }
    if (response.status === 429) throw new ProviderError("Reservoir rate limit reached. Try again shortly.", 429);
    if (response.status === 401 || response.status === 403) throw new ProviderError("Reservoir API key was rejected.", 503);
    if (!response.ok) throw new ProviderError(`Reservoir scan failed (HTTP ${response.status}).`, 502);
    const body = await response.text();
    if (body.length > 2_000_000) throw new ProviderError("Reservoir response is too large.", 502);
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new ProviderError("Reservoir returned invalid JSON.", 502); }
    const result = pageSchema.safeParse(json);
    if (!result.success) throw new ProviderError("Reservoir returned an unexpected activity format.", 502);
    for (const raw of result.data.activities) {
      const event = mapActivity(raw, input);
      if (event) {
        if (!events.has(event.id)) events.set(event.id, event);
      } else skipped++;
    }
    const next = result.data.continuation || undefined;
    if (!next) break;
    if (seenCursors.has(next)) throw new ProviderError("Reservoir repeated a pagination cursor.", 502);
    seenCursors.add(next);
    cursor = next;
    if (page === maxPages - 1) { partial = true; truncated = true; }
  }
  if (skipped) partial = true;
  const warning = skipped || partial
    ? `${skipped} activity record(s) were excluded because price, currency, identity, quantity, or wallet direction could not be verified.${truncated ? " History is truncated at the page limit." : ""} Gas/transaction fees are unavailable.`
    : "Gas and other transaction fees are unavailable from this activity feed; PnL is an estimate.";
  const data = { events: [...events.values()], partial, warning };
  if (useCache && !partial) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expires: Date.now() + 30_000, data });
  }
  return data;
}
