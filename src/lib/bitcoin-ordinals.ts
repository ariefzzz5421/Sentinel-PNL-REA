import { isBitcoinAddress } from "./discovery-wallet";
import {
  calculateBitcoinPnl, type BitcoinPnl, type OrdinalHolding,
  type OrdinalMovement, type VerifiedOrdinalSale,
} from "./bitcoin-pnl";

export type BitcoinOrdinalScan = {
  assets: Array<{id: string; name: string; imageUrl: string | null; url: string;
    kind: "holding"; collection: string | null}>;
  report: BitcoinPnl;
  partial: boolean; note: string;
};
export class BitcoinProviderError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const INSCRIPTION = /^[a-f0-9]{64}i\d+$/i;
const TXID = /^[a-f0-9]{64}$/i;
const SLUG = /^[a-z0-9_-]{1,90}$/;
const ORDISCAN = "https://api.ordiscan.com";
const ORD_NET = "https://ord.net";
const cache = new Map<string, { until: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function safeText(value: unknown, fallback: string): string {
  return (str(value) || fallback).slice(0, 110);
}
function sats(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return BigInt(value);
  if (typeof value === "string" && /^\d{1,16}$/.test(value)) {
    const n = BigInt(value);
    return n <= 2100000000000000n ? n : null;
  }
  return null;
}
function picture(value: unknown, kind: unknown): string | null {
  if (!str(kind) || !/^image\/(png|jpeg|webp|gif)$/i.test(String(kind))) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.username === "" && url.password === "" &&
      url.toString().length <= 1600 ? url.toString() : null;
  } catch { return null; }
}
function pageRows(raw: unknown, max: number): unknown[] {
  const data = obj(raw)?.data;
  if (!Array.isArray(data) || data.length > max)
    throw new BitcoinProviderError("Ordinals index returned an invalid result page.");
  return data;
}
/** All endpoints use fixed hosts, GET only, no client-exposed credentials. */
async function apiGet<T>(url: string, token: string, fetcher: typeof fetch,
  ttl: number, read: (raw: unknown) => T): Promise<T> {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || ![ORDISCAN, ORD_NET].includes(endpoint.origin) ||
      endpoint.username || endpoint.password || endpoint.hash)
    throw new BitcoinProviderError("Unexpected Ordinals API endpoint.", 503);
  const key = endpoint.toString() + ":" + (endpoint.origin === ORD_NET ? "ord" : "scan");
  const cached = fetcher === fetch ? cache.get(key) : undefined;
  if (cached && cached.until > Date.now()) return cached.data as T;
  async function readApi(): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET", headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(9000),
      });
    } catch { throw new BitcoinProviderError("Ordinals API timed out or could not be reached."); }
    if (response.status === 429) throw new BitcoinProviderError("Ordinals API rate limit reached. Retry later.", 429);
    if (response.status === 401 || response.status === 403)
      throw new BitcoinProviderError("Ordinals provider authorization is missing or expired.", 503);
    if (!response.ok) throw new BitcoinProviderError("Ordinals provider returned HTTP " + response.status);
    if (Number(response.headers.get("content-length") || 0) > 2500000)
      throw new BitcoinProviderError("Ordinals API response exceeded the size limit.");
    const body = await response.text();
    if (body.length > 2500000) throw new BitcoinProviderError("Ordinals API response exceeded the size limit.");
    let raw: unknown;
    try { raw = JSON.parse(body) as unknown; }
    catch { throw new BitcoinProviderError("Ordinals API returned invalid JSON."); }
    const parsed = read(raw);
    if (fetcher === fetch) {
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + ttl, data: parsed });
    }
    return parsed;
  }
  if (fetcher !== fetch) return readApi();
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const task = readApi();
  inflight.set(key, task);
  try { return await task; } finally { inflight.delete(key); }
}
function inscription(item: unknown, wallet: string) {
  const a = obj(item);
  if (!a || !str(a.inscription_id) || !INSCRIPTION.test(String(a.inscription_id)) ||
      String(a.owner_address).toLowerCase() !== wallet.toLowerCase()) return null;
  const id = String(a.inscription_id).toLowerCase();
  const slug = str(a.collection_slug);
  const metadata = obj(a.metadata);
  return {
    id, name: safeText(metadata?.name,
      "Inscription " + (typeof a.inscription_number === "number" ? "#" + a.inscription_number : id.slice(0, 10))),
    collection: slug && SLUG.test(slug) ? slug : null,
    imageUrl: picture(a.content_url, a.content_type),
    kind: "holding" as const, url: "https://ordiscan.com/inscription/" + id,
  };
}
function movement(item: unknown): OrdinalMovement | null {
  const a = obj(item);
  if (!a || !str(a.inscription_id) || !INSCRIPTION.test(String(a.inscription_id)) ||
      !str(a.txid) || !TXID.test(String(a.txid)) ||
      (a.type !== "SEND" && a.type !== "RECEIVE") || a.confirmed !== true ||
      !str(a.timestamp) || !Number.isFinite(Date.parse(String(a.timestamp)))) return null;
  return { inscriptionId: String(a.inscription_id).toLowerCase(),
    txid: String(a.txid).toLowerCase(),
    direction: a.type === "SEND" ? "sent" : "received",
    counterpart: str(a.counterpart_address),
    timestamp: new Date(String(a.timestamp)).toISOString(),
    spentAsFee: a.spent_as_fee === true };
}
function sale(item: unknown): VerifiedOrdinalSale | null {
  const a = obj(item);
  if (!a || (a.saleType !== "internal" && a.saleType !== "external") ||
      !str(a.inscriptionId) || !INSCRIPTION.test(String(a.inscriptionId)) ||
      !str(a.txid) || !TXID.test(String(a.txid)) ||
      !str(a.buyerAddress) || !str(a.sellerAddress) ||
      !isBitcoinAddress(String(a.buyerAddress)) || !isBitcoinAddress(String(a.sellerAddress)) ||
      !str(a.soldAt) || !Number.isFinite(Date.parse(String(a.soldAt)))) return null;
  const price = sats(a.priceSats);
  if (price === null || price <= 0n) return null;
  return { inscriptionId: String(a.inscriptionId).toLowerCase(), txid: String(a.txid).toLowerCase(),
    buyer: String(a.buyerAddress), seller: String(a.sellerAddress),
    priceSats: price, timestamp: new Date(String(a.soldAt)).toISOString() };
}
export async function scanBitcoinOrdinals(
  wallet: string, fetcher: typeof fetch = fetch,
): Promise<BitcoinOrdinalScan> {
  const key = process.env.ORDISCAN_API_KEY;
  if (!isBitcoinAddress(wallet))
    throw new BitcoinProviderError("Paste a valid Bitcoin mainnet address (bc1…, 1… or 3…).", 400);
  if (!key) throw new BitcoinProviderError("ORDISCAN_API_KEY is not configured on the server.", 503);
  const path = "/v1/address/" + encodeURIComponent(wallet);
  const assets = new Map<string, BitcoinOrdinalScan["assets"][number]>();
  const movements = new Map<string, OrdinalMovement>();
  let partial = false;
  const warnings: string[] = [];
  // Ordiscan owns the inventory truth. Never silently return incomplete holdings.
  for (let page = 1; page <= 3; page++) {
    const rows = await apiGet(ORDISCAN + path + "/inscriptions?page=" + page, key,
      fetcher, 60000, raw => pageRows(raw, 100));
    for (const value of rows) {
      const asset = inscription(value, wallet);
      if (asset) assets.set(asset.id, asset);
    }
    if (rows.length < 100) break;
    if (page === 3) { partial = true; warnings.push("Holdings limited to the first 300 inscriptions."); }
  }
  try {
    for (let page = 1; page <= 2; page++) {
      const rows = await apiGet(ORDISCAN + path + "/activity?type=transfer&sort=newest&page=" + page,
        key, fetcher, 60000, raw => pageRows(raw, 1000));
      for (const value of rows) {
        const m = movement(value);
        if (m) movements.set(m.inscriptionId + ":" + m.txid + ":" + m.direction, m);
      }
      if (rows.length < 1000) break;
      if (page === 2) { partial = true; warnings.push("Activity limited to the most recent 2,000 transfers."); }
    }
  } catch {
    partial = true; warnings.push("Transfer activity is unavailable from Ordiscan.");
  }
  const items = [...assets.values()];
  // Enrich sent inscriptions (which are absent from current inventory) conservatively.
  const missingIds = [...new Set([...movements.values()].filter(m => m.direction === "sent")
    .map(m => m.inscriptionId).filter(id => !assets.has(id)))];
  const collections = new Map(items.map(item => [item.id, item.collection]));
  if (missingIds.length > 12) {
    partial = true; warnings.push("Only the latest 12 sent inscriptions can be classified for sale history.");
  }
  const enriched = await Promise.all(missingIds.slice(0, 12).map(async id => {
    try {
      const raw = await apiGet(ORDISCAN + "/v1/inscription/" + id, key,
        fetcher, 300000, val => obj(val)?.data);
      const a = obj(raw);
      return [id, str(a?.collection_slug)] as const;
    } catch { return [id, null] as const; }
  }));
  for (const [id, name] of enriched)
    if (name && SLUG.test(name)) collections.set(id, name);

  const slugs = [...new Set([...collections.values()].filter((s): s is string =>
    Boolean(s && SLUG.test(s))))];
  if (slugs.length > 4) {
    partial = true; warnings.push("Market data limited to four collections per scan.");
  }
  const marketSlugs = slugs.slice(0, 4);
  const floors: Record<string, bigint> = {};
  const token = process.env.ORD_NET_SESSION_TOKEN;
  if (token && marketSlugs.length) {
    try {
      const raw = await apiGet(ORD_NET + "/api/v1/collection-stats/floors?slugs=" +
        marketSlugs.map(encodeURIComponent).join(","), token, fetcher, 60000, val => val);
      const stats = obj(raw);
      if (stats?.success === true && Array.isArray(stats.data))
        for (const value of stats.data) {
          const entry = obj(value); const slug = str(entry?.slug);
          const floor = sats(entry?.floor);
          if (slug && marketSlugs.includes(slug) && floor !== null) floors[slug] = floor;
        }
    } catch { warnings.push("ORD.NET floor data unavailable; market estimates may be incomplete."); partial = true; }
  }
  // Ordiscan floor data is a read-only fallback (not a verified historical buy price).
  for (const slug of marketSlugs.filter(slug => floors[slug] === undefined)) {
    try {
      const raw = await apiGet(ORDISCAN + "/v1/collection/" + slug + "/market", key,
        fetcher, 180000, val => obj(val)?.data);
      const value = sats(obj(raw)?.floor_price_in_sats);
      if (value !== null) floors[slug] = value;
    } catch { /* Floor remains unknown; holdings still load. */ }
  }
  const sales: VerifiedOrdinalSale[] = [];
  if (token) {
    for (const slug of marketSlugs) {
      let cursor: string | null = null;
      try {
        for (let page = 0; page < 2; page++) {
          const url = new URL(ORD_NET + "/api/v1/sales");
          url.searchParams.set("collectionSlug", slug);
          url.searchParams.set("limit", "100");
          if (cursor) url.searchParams.set("cursor", cursor);
          const raw = await apiGet(url.toString(), token, fetcher, 60000, val => val);
          const doc = obj(raw);
          if (!doc || !Array.isArray(doc.sales) || doc.sales.length > 100)
            throw new BitcoinProviderError("ORD.NET sales returned an invalid page.");
          for (const value of doc.sales) {
            const verified = sale(value);
            if (verified && collections.get(verified.inscriptionId) === slug &&
                [...movements.values()].some(m => m.inscriptionId === verified.inscriptionId &&
                  m.txid === verified.txid &&
                  (m.direction === "sent" ? verified.seller === wallet : verified.buyer === wallet)))
              sales.push(verified);
          }
          const pagination = obj(doc.pagination);
          cursor = pagination?.hasNext === true && str(pagination.nextCursor) &&
            String(pagination.nextCursor).length <= 600 ? String(pagination.nextCursor) : null;
          if (!cursor) break;
          if (page === 1) { partial = true; warnings.push("ORD.NET sale history is limited to 200 sales per collection."); }
        }
      } catch {
        partial = true; warnings.push("ORD.NET sale history could not be verified for " + slug + ".");
      }
    }
  } else {
    warnings.push("Verified historical prices require an administrator-configured ORD.NET bearer session.");
  }
  const holdings: OrdinalHolding[] = items.map(a => ({ id: a.id, collection: a.collection }));
  const pnl = calculateBitcoinPnl(wallet,
    holdings, [...movements.values()],
    sales, floors);
  // Every report is intentionally a bounded sample of one address, not a complete wallet ledger.
  return {
    assets: items, report: pnl, partial: true,
    note: "Read-only BTC Ordinals data. Transfers are never assumed to be sales. " +
      "Realized PnL/ROI use only verified inscription-level buy→sell matches; " +
      "unrealized PnL uses current collection floor estimates only for verified-cost holdings. " +
      "Fees, other Bitcoin addresses and unindexed or older sales are excluded. " +
      warnings.join(" "),
  };
}