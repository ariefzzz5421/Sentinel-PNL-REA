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
 * OpenSea GET /api/v2/events/accounts/{address}, using ONLY observed priced
 * ERC-721 ETH/WETH sales. Unsupported mints/transfers/currencies are excluded
 * rather than fabricating acquisition basis. Fees are unknown.
 */
export async function getOpenSeaEvents(
  request: ScanRequest, apiKey: string, fetcher: typeof fetch = fetch,
): Promise<ScanData> {
  const key = [request.address.toLowerCase(), request.chain, request.mode, request.contract?.toLowerCase() || ""].join(":");
  const useCache = fetcher === fetch;
  const cached = useCache ? cache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.data;

  const events = new Map<string, TradeEvent>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  let skipped = 0, partial = false, truncated = false;
  // Bounded scan protects Vercel timeouts and free-tier rate limits.
  const maxPages = 6;
  for (let index = 0; index < maxPages; index++) {
    const url = new URL(`https://api.opensea.io/api/v2/events/accounts/${request.address}`);
    url.searchParams.set("chain", request.chain);
    url.searchParams.set("event_type", "sale");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("next", cursor);
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { "accept": "application/json", "x-api-key": apiKey },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      throw new ProviderError("OpenSea API connection failed or timed out.", 502);
    }
    if (response.status === 429) throw new ProviderError("OpenSea rate limit reached. Try again later.", 429);
    if (response.status === 401 || response.status === 403) throw new ProviderError("OpenSea API key rejected. Check OPENSEA_API_KEY and access.", 503);
    if (!response.ok) throw new ProviderError(`OpenSea activity request failed (HTTP ${response.status}).`, 502);
    const body = await response.text();
    if (body.length > 2_000_000) throw new ProviderError("OpenSea response too large.", 502);
    let value: unknown;
    try { value = JSON.parse(body); } catch { throw new ProviderError("OpenSea returned invalid JSON.", 502); }
    const parsed = pageSchema.safeParse(value);
    if (!parsed.success) throw new ProviderError("OpenSea activity schema did not match the official response format.", 502);
    for (const raw of parsed.data.asset_events) {
      const mapped = fromSale(raw, request);
      if (mapped) events.set(mapped.id, mapped);
      else skipped++;
    }
    const next = parsed.data.next || undefined;
    if (!next) break;
    if (seen.has(next)) throw new ProviderError("OpenSea repeated a pagination cursor.", 502);
    seen.add(next);
    cursor = next;
    if (index === maxPages - 1) { partial = true; truncated = true; }
  }
  if (skipped) partial = true;
  const warning = [
    "Realized NFT PnL is estimated: gas/marketplace fees and unsupported ERC-20 payments are not included.",
    skipped ? `${skipped} unverified or unsupported sale event(s) skipped.` : "",
    truncated ? "History is truncated by the 1,200-event scan limit." : "",
    "Mints and transferred-in NFT cost bases are not inferred.",
  ].filter(Boolean).join(" ");
  const data = { events: [...events.values()], partial, warning };
  if (useCache && !partial) {
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + 60_000 });
  }
  return data;
}
