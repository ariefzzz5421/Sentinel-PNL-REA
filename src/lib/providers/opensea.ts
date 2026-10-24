import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { addressSchema, eventSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { ProviderError, type ScanRequest } from "./normalized";

const EVM_ADDRESS = /^0x[a-f\d]{40}$/i;
const TX_HASH = /^0x[a-f\d]{64}$/i;
const native = new Set(["0x0000000000000000000000000000000000000000", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]);
const weth: Record<Chain, string> = {
  ethereum: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  base: "0x4200000000000000000000000000000000000006",
  arbitrum: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  robinhood: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
};
const pageSchema = z.object({
  asset_events: z.array(z.unknown()).max(200),
  next: z.string().max(2500).nullable().optional(),
});
const nftSchema = z.object({
  contract: z.string(),
  identifier: z.union([z.string(), z.number()]),
  collection: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  token_standard: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
});
const paymentSchema = z.object({
  quantity: z.string().regex(/^\d+$/),
  decimals: z.number().int().min(0).max(36),
  symbol: z.string(),
  token_address: z.string().nullable().optional(),
});
const saleSchema = z.object({
  event_type: z.literal("sale"),
  event_timestamp: z.number().positive(),
  chain: z.string(),
  buyer: z.string(),
  seller: z.string(),
  nft: nftSchema,
  quantity: z.number().int().positive().optional(),
  payment: paymentSchema,
  transaction: z.string().optional(),
  order_hash: z.string().optional(),
});

const transferSchema = z.object({
  event_type: z.enum(["mint", "transfer"]),
  event_timestamp: z.number().positive(),
  chain: z.string(),
  nft: nftSchema.optional(),
  asset: nftSchema.nullable().optional(),
  from_address: z.string().nullable().optional(),
  to_address: z.string().optional(),
  maker: z.string().optional(),
  taker: z.string().nullable().optional(),
  quantity: z.number().int().positive().optional(),
  transaction: z.string().optional(),
});
function fromAcquisition(raw: unknown, request: ScanRequest): TradeEvent | null {
  const parsed = transferSchema.safeParse(raw);
  if (!parsed.success) return null;
  const event = parsed.data;
  const wallet = request.address.toLowerCase();
  const recipient = (event.to_address || event.taker || (event.event_type === "mint" ? event.maker : "") || "").toLowerCase();
  const nft = event.nft || event.asset;
  if (event.chain !== request.chain || recipient !== wallet || (event.quantity !== undefined && event.quantity !== 1)) return null;
  if (!nft || nft.token_standard?.toLowerCase() === "erc1155") return null;
  const contract = nft.contract.toLowerCase();
  if (!addressSchema.safeParse(contract).success ||
    (request.contract && request.contract.toLowerCase() !== contract)) return null;
  const isMint = event.event_type === "mint" ||
    (event.from_address && native.has(event.from_address.toLowerCase()));
  // Avoid treating ordinary outbound transfers as new acquisitions.
  if (!isMint && (!event.from_address || !EVM_ADDRESS.test(event.from_address) ||
      event.from_address.toLowerCase() === wallet)) return null;
  const date = new Date(event.event_timestamp * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const txHash = event.transaction && TX_HASH.test(event.transaction) ? event.transaction : undefined;
  const digest = createHash("sha256").update([
    event.transaction || "", event.event_timestamp, contract, nft.identifier, wallet,
    isMint ? "mint" : "transfer_in",
  ].join("|")).digest("hex").slice(0, 40);
  const candidate = eventSchema.safeParse({
    id: `opensea:${request.chain}:${digest}`, date: date.toISOString(),
    chain: request.chain, wallet, contract,
    tokenId: String(nft.identifier),
    imageUrl: nft.image_url?.startsWith("https://") ? nft.image_url : undefined,
    collection: nft.collection || nft.name || `${contract.slice(0, 10)}…`,
    type: isMint ? "mint" : "transfer_in",
    // No evidence for exact mint price from a transfer-shaped event.
    amountEth: "0", feeEth: "0", feeKnown: false, basisKnown: false, txHash,
  });
  return candidate.success ? candidate.data : null;
}

type ScanData = { events: TradeEvent[]; partial: boolean; warning?: string };
const cache = new Map<string, { expires: number; data: ScanData }>();

function parseEthPayment(payment: z.infer<typeof paymentSchema>, chain: Chain): string | null {
  const symbol = payment.symbol.toUpperCase();
  const token = payment.token_address?.toLowerCase();
  if (symbol !== "ETH" && symbol !== "WETH") return null;
  if (token && !EVM_ADDRESS.test(token)) return null;
  if (token && EVM_ADDRESS.test(token) && !native.has(token) && token !== weth[chain]) return null;
  if (symbol === "WETH" && token !== weth[chain]) return null;
  try {
    const value = new Decimal(payment.quantity).div(new Decimal(10).pow(payment.decimals));
    if (!value.isFinite() || value.isNegative() || value.decimalPlaces() > 18) return null;
    return value.toFixed();
  } catch {
    return null;
  }
}

function fromSale(raw: unknown, request: ScanRequest): TradeEvent | null {
  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) return null;
  const event = parsed.data;
  if (event.chain !== request.chain || (event.quantity !== undefined && event.quantity !== 1)) return null;
  if (event.nft.token_standard?.toLowerCase() === "erc1155") return null;
  const buyer = event.buyer.toLowerCase(), seller = event.seller.toLowerCase();
  const wallet = request.address.toLowerCase();
  if (!EVM_ADDRESS.test(buyer) || !EVM_ADDRESS.test(seller) || buyer === seller) return null;
  const type = buyer === wallet ? "buy" : seller === wallet ? "sell" : null;
  if (!type) return null;
  const contract = event.nft.contract.toLowerCase();
  if (!addressSchema.safeParse(contract).success || (request.contract && request.contract.toLowerCase() !== contract)) return null;
  const value = parseEthPayment(event.payment, request.chain);
  if (value === null) return null;
  const timestamp = new Date(event.event_timestamp * 1000);
  if (Number.isNaN(timestamp.getTime())) return null;
  const txHash = event.transaction && TX_HASH.test(event.transaction) ? event.transaction : undefined;
  // Stable event identity independent of page order, avoiding duplicate reloads.
  const digest = createHash("sha256").update([
    event.transaction || event.order_hash || "", event.event_timestamp,
    contract, event.nft.identifier, buyer, seller, event.payment.quantity
  ].join("|")).digest("hex").slice(0, 40);
  const mapped = eventSchema.safeParse({
    id: `opensea:${request.chain}:${digest}`,
    date: timestamp.toISOString(),
    chain: request.chain,
    wallet,
    contract,
    tokenId: String(event.nft.identifier),
    imageUrl: event.nft.image_url?.startsWith("https://") ? event.nft.image_url : undefined,
    collection: event.nft.collection || event.nft.name || `${contract.slice(0, 10)}…`,
    type,
    amountEth: value,
    feeEth: "0",
    feeKnown: false,
    txHash,
  });
  return mapped.success ? mapped.data : null;
}

/**
 * OpenSea GET /api/v2/events/accounts/{address}; separate priced ERC-721 ETH/WETH
 * sales and unpriced mint/transfer histories. No inferred cost basis; fees unknown.
 */
export async function getOpenSeaEvents(
  request: ScanRequest, apiKey: string, fetcher: typeof fetch = fetch,
): Promise<ScanData> {
  const key = [request.address.toLowerCase(), request.chain, request.mode, request.contract?.toLowerCase() || ""].join(":");
  const useCache = fetcher === fetch;
  const cached = useCache ? cache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.data;

  const events = new Map<string, TradeEvent>();
  let skipped = 0, partial = false;
  const warnings: string[] = [];

  async function readType(kind: "sale" | "mint" | "transfer", maxPages: number) {
    const found: TradeEvent[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined, skippedHere = 0, truncated = false;
    for (let index = 0; index < maxPages; index++) {
      const url = new URL(`https://api.opensea.io/api/v2/events/accounts/${request.address}`);
      url.searchParams.set("chain", request.chain);
      url.searchParams.set("event_type", kind);
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("next", cursor);
      let response: Response;
      try {
        response = await fetcher(url, {
          headers: { accept: "application/json", "x-api-key": apiKey },
          signal: AbortSignal.timeout(8500), redirect: "error", cache: "no-store",
        });
      } catch {
        throw new ProviderError(`OpenSea ${kind} activity connection timed out.`, 502);
      }
      if (response.status === 429) throw new ProviderError(`OpenSea ${kind} activity rate limited.`, 429);
      if (response.status === 401 || response.status === 403)
        throw new ProviderError("OpenSea API key rejected. Check OPENSEA_API_KEY.", 503);
      if (!response.ok) throw new ProviderError(`OpenSea ${kind} activity failed (HTTP ${response.status}).`, 502);
      const body = await response.text();
      if (body.length > 2_000_000) throw new ProviderError("OpenSea response too large.", 502);
      let value: unknown;
      try { value = JSON.parse(body); } catch { throw new ProviderError("OpenSea returned invalid JSON.", 502); }
      const parsed = pageSchema.safeParse(value);
      if (!parsed.success) throw new ProviderError("OpenSea activity schema did not match the official format.", 502);
      for (const raw of parsed.data.asset_events) {
        const mapped = kind === "sale" ? fromSale(raw, request) : fromAcquisition(raw, request);
        if (mapped && (kind === "sale" || (kind === "mint" ? mapped.type === "mint" : mapped.type === "transfer_in")))
          found.push(mapped);
        else if (kind === "sale") skippedHere++;
      }
      const next = parsed.data.next || undefined;
      if (!next) break;
      if (seen.has(next)) throw new ProviderError("OpenSea repeated a pagination cursor.", 502);
      seen.add(next);
      cursor = next;
      if (index === maxPages - 1) truncated = true;
    }
    return { found, skippedHere, truncated };
  }

  // Query sale/mint/transfer independently. Account APIs provide separate event types,
  // and supplementary history errors must never discard successfully retrieved sales.
  const [saleResult, mintResult, transferResult] = await Promise.allSettled([
    readType("sale", 6), readType("mint", 3), readType("transfer", 2),
  ]);
  if (saleResult.status === "rejected") throw saleResult.reason;
  const saleData = saleResult.value;
  for (const event of saleData.found) events.set(event.id, event);
  skipped = saleData.skippedHere;
  partial = Boolean(skipped || saleData.truncated);
  if (saleData.truncated) warnings.push("Sale history reached the 1,200-event scan limit.");
  if (skipped) warnings.push(`${skipped} unsupported sale events omitted.`);

  for (const [label, result] of [["mint", mintResult], ["transfer", transferResult]] as const) {
    if (result.status === "rejected") {
      partial = true; warnings.push(`${label} history could not be loaded.`);
      continue;
    }
    if (result.value.truncated) {
      partial = true;
      warnings.push(`${label} history reached its scan limit.`);
    }
    for (const event of result.value.found) {
      // Transfer logs and mint logs can both describe the same acquisition.
      // Prefer explicit mint evidence. Do not double count one tx/token pair.
      if (event.type === "transfer_in" && [...events.values()].some((stored) =>
        (stored.type === "mint" || stored.type === "buy") && stored.txHash && stored.txHash === event.txHash &&
        stored.chain === event.chain && stored.contract === event.contract &&
        stored.tokenId === event.tokenId)) continue;
      events.set(event.id, event);
    }
  }
  const warning = [
    "Realized NFT PnL excludes unknown mint/transfer costs and gas/marketplace fees.",
    ...warnings,
    "Mint and incoming-transfer activity is counted, but missing cost basis is not treated as zero.",
  ].join(" ");
  const data = { events: [...events.values()], partial, warning };
  if (useCache) {
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + (partial ? 20_000 : 60_000) });
  }
  return data;
}
