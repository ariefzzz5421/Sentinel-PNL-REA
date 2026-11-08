import { addressSchema } from "./schema";
import type { DiscoveryAsset, DiscoveryResult } from "./nft-discovery";

/**
 * Read-only Blockscout v2 adapter for EVM networks that do not have
 * verified currency-specific marketplace PnL indexing yet.
 * ERC-721/1155 ownership and transfers are never classified as purchases/sales.
 */
export type ExplorerEvmChain = "ink" | "arc";
const HOSTS: Record<ExplorerEvmChain, string> = {
  ink: "https://explorer.inkonchain.com",
  arc: "https://explorer.arc.io",
};
const addressRegex = /^0x[a-f0-9]{40}$/i;
const txRegex = /^0x[a-f0-9]{64}$/i;
const tokenIdRegex = /^\d{1,90}$/;
const allowedPageKeys = new Set([
  "block_number", "index", "items_count", "batch_log_index",
  "batch_block_hash", "batch_transaction_hash", "index_in_batch",
  "transaction_hash", "token_id", "unique_token",
]);
const cache = new Map<string, { expires: number; value: unknown }>();

export class ExplorerEvmError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function valueString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function truncate(value: unknown, fallback: string): string {
  return (valueString(value) || fallback).slice(0, 120);
}
function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1600) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function address(value: unknown): string | null {
  const a = typeof value === "string" ? value : object(value)?.hash;
  return typeof a === "string" && addressRegex.test(a) ? a.toLowerCase() : null;
}
function tokenId(value: unknown): string | null {
  const s = typeof value === "string" || typeof value === "number" ? String(value) : null;
  return s && tokenIdRegex.test(s) ? s : null;
}
function standard(value: unknown): "ERC-721" | "ERC-1155" | null {
  return value === "ERC-721" || value === "ERC-1155" ? value : null;
}
function pagination(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  const raw = object(value);
  if (!raw) throw new ExplorerEvmError("Invalid explorer pagination cursor.");
  const entries = Object.entries(raw);
  if (entries.length === 0 || entries.length > 9)
    throw new ExplorerEvmError("Explorer pagination cursor is too large.");
  const cursor: Record<string, string> = {};
  for (const [key, val] of entries) {
    if (!allowedPageKeys.has(key) || (typeof val !== "string" && typeof val !== "number") ||
        !/^[a-zA-Z0-9_-]{1,110}$/.test(String(val)))
      throw new ExplorerEvmError("Explorer returned an unsafe pagination cursor.");
    cursor[key] = String(val);
  }
  return cursor;
}
async function fetchPage(url: URL, fetcher: typeof fetch): Promise<{ rows: unknown[]; next: Record<string,string> | null }> {
  const key = url.href;
  const cached = fetcher === fetch ? cache.get(key) : undefined;
  if (cached && cached.expires > Date.now())
    return cached.value as { rows: unknown[]; next: Record<string,string> | null };
  let response: Response;
  try {
    response = await fetcher(url.href, { method: "GET",
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000),
      cache: "no-store", redirect: "error" });
  } catch { throw new ExplorerEvmError("Blockscout explorer connection timed out or failed."); }
  if (response.status === 429)
    throw new ExplorerEvmError("Blockscout explorer rate limit reached.", 429);
  if (!response.ok)
    throw new ExplorerEvmError("Blockscout explorer returned HTTP " + response.status);
  if (Number(response.headers.get("content-length") || 0) > 1800000)
    throw new ExplorerEvmError("Blockscout response exceeded the size limit.");
  const text = await response.text();
  if (text.length > 1800000)
    throw new ExplorerEvmError("Blockscout response exceeded the size limit.");
  let json: unknown;
  try { json = JSON.parse(text) as unknown; }
  catch { throw new ExplorerEvmError("Blockscout returned invalid JSON."); }
  const body = object(json);
  if (!Array.isArray(body?.items) || body.items.length > 100)
    throw new ExplorerEvmError("Blockscout returned an invalid NFT page.");
  const result = { rows: body.items, next: pagination(body.next_page_params) };
  if (fetcher === fetch) {
    if (cache.size >= 250) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 45000, value: result });
  }
  return result;
}
async function collect(
  origin: string, wallet: string, path: "nft" | "token-transfers",
  contract: string | undefined, fetcher: typeof fetch,
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const rows: unknown[] = [];
  const seen = new Set<string>();
  let cursor: Record<string, string> | null = null;
  const maxPages = 2;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("/api/v2/addresses/" + encodeURIComponent(wallet) + "/" + path, origin);
    url.searchParams.set("type", "ERC-721,ERC-1155");
    if (path === "token-transfers" && contract) url.searchParams.set("token", contract);
    if (cursor) for (const [key, value] of Object.entries(cursor)) url.searchParams.set(key, value);
    const result = await fetchPage(url, fetcher);
    rows.push(...result.rows);
    if (!result.next) return { rows, truncated: false };
    const key = JSON.stringify(result.next);
    if (seen.has(key)) throw new ExplorerEvmError("Blockscout repeated its pagination cursor.");
    seen.add(key);
    cursor = result.next;
    if (page === maxPages - 1) return { rows, truncated: true };
  }
  return { rows, truncated: false };
}
function transferAssets(raw: unknown, wallet: string, origin: string,
  contractFilter?: string): DiscoveryAsset[] {
  const item = object(raw), token = object(item?.token);
  const tokenAddress = address(token?.address_hash);
  const kind = standard(token?.type);
  const tx = valueString(item?.tx_hash) || valueString(item?.transaction_hash);
  if (!item || !tokenAddress || !kind || !tx || !txRegex.test(tx) ||
      (contractFilter && tokenAddress !== contractFilter)) return [];
  const from = address(item.from), to = address(item.to);
  if (from !== wallet && to !== wallet) return [];
  if (from === wallet && to === wallet) return [];
  const direction = to === wallet ? "received" : "sent";
  const total = object(item.total);
  const ids = Array.isArray(item.token_ids) ? item.token_ids :
    [item.token_id ?? total?.token_id ?? object(item.token_instance)?.id];
  const collection = truncate(token?.name, tokenAddress.slice(0, 12) + "…");
  const logIndex = item.log_index === undefined ? "0" : String(item.log_index);
  if (!/^\d{1,12}$/.test(logIndex)) return [];
  const output: DiscoveryAsset[] = [];
  for (const id of ids.slice(0, 30)) {
    const tokenIdValue = tokenId(id);
    if (!tokenIdValue) continue;
    output.push({
      id: tx.toLowerCase() + ":" + logIndex + ":" + tokenAddress + ":" + tokenIdValue + ":" + direction,
      name: collection + " #" + tokenIdValue,
      collection, imageUrl: null,
      kind: direction,
      url: origin + "/tx/" + tx.toLowerCase(),
    });
  }
  return output;
}
function heldAsset(raw: unknown, wallet: string, origin: string,
  contractFilter?: string): DiscoveryAsset | null {
  const item = object(raw), token = object(item?.token);
  const contract = address(token?.address_hash);
  const kind = standard(token?.type);
  const id = tokenId(item?.id);
  if (!item || !contract || !kind || !id ||
      (contractFilter && contract !== contractFilter)) return null;
  const actualOwner = item.owner === undefined || item.owner === null ? null : address(item.owner);
  if (actualOwner && actualOwner !== wallet) return null;
  const metadata = object(item.metadata);
  const collection = truncate(token?.name, contract.slice(0, 12) + "…");
  return {
    id: origin + ":" + contract + ":" + id,
    name: truncate(metadata?.name, collection + " #" + id),
    collection,
    imageUrl: imageUrl(item.image_url) || imageUrl(metadata?.image),
    url: origin + "/token/" + contract + "/instance/" + encodeURIComponent(id),
    kind: "holding",
  };
}
/** Address-only NFT discovery, no contract required. Never invent sale prices. */
export async function scanExplorerEvm(
  chain: ExplorerEvmChain, walletInput: string, contractInput?: string,
  fetcher: typeof fetch = fetch,
): Promise<DiscoveryResult> {
  if (!addressSchema.safeParse(walletInput).success)
    throw new ExplorerEvmError("Enter a valid EVM 0x wallet address.", 400);
  if (contractInput && !addressSchema.safeParse(contractInput).success)
    throw new ExplorerEvmError("Invalid NFT contract filter.", 400);
  const wallet = walletInput.toLowerCase(), contract = contractInput?.toLowerCase();
  const origin = HOSTS[chain];
  const [transfers, inventory] = await Promise.allSettled([
    collect(origin, wallet, "token-transfers", contract, fetcher),
    collect(origin, wallet, "nft", undefined, fetcher),
  ]);
  if (transfers.status === "rejected" && inventory.status === "rejected") {
    const error = transfers.reason;
    if (error instanceof ExplorerEvmError) throw error;
    throw new ExplorerEvmError("NFT indexer is currently unavailable.");
  }
  const assets = new Map<string, DiscoveryAsset>();
  if (inventory.status === "fulfilled") for (const value of inventory.value.rows) {
    const entry = heldAsset(value, wallet, origin, contract);
    if (entry) assets.set(entry.id, entry);
  }
  if (transfers.status === "fulfilled") for (const value of transfers.value.rows) {
    for (const entry of transferAssets(value, wallet, origin, contract))
      assets.set(entry.id, entry);
  }
  const warnings: string[] = [];
  if (transfers.status === "rejected") warnings.push("Transfer history is unavailable.");
  else if (transfers.value.truncated) warnings.push("Transfer history is limited to the first two indexed pages.");
  if (inventory.status === "rejected") warnings.push("Owned NFT inventory is unavailable.");
  else if (inventory.value.truncated) warnings.push("Holdings are limited to the first two indexed pages.");
  return {
    chain, address: wallet, assets: [...assets.values()].slice(0, 300),
    mode: "recent-transfers", partial: true, pnlAvailable: false,
    note: (chain === "arc" ? "Arc (USDC-native gas)" : "Ink (ETH-native gas)") +
      ": Indexed ERC-721/ERC-1155 holdings and transfers only. " +
      "Transfers do not establish purchases or sales. NFT cost basis, price, PnL and ROI are Unknown; " +
      "no ETH/USDC currency conversion or sale attribution is inferred. " +
      "Coverage is bounded; empty results do not prove no NFT activity. " + warnings.join(" "),
  };
}