import { z } from "zod";
import { isBitcoinAddress, isSolanaAddress, type DiscoveryChain } from "./discovery-wallet";
import { addressSchema } from "./schema";

export type DiscoveryAsset = {
  id: string; name: string; imageUrl: string | null; url: string;
  kind: "holding" | "received" | "sent";
  collection: string | null;
};
export type DiscoveryResult = {
  chain: DiscoveryChain; address: string; assets: DiscoveryAsset[];
  partial: boolean; mode: "holdings" | "recent-transfers";
  note: string; pnlAvailable: false;
};
export class DiscoveryError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const inputSchema = z.object({
  chain: z.enum(["solana", "ink", "bitcoin"]),
  address: z.string().trim().min(14).max(96),
  contract: z.string().trim().max(42).optional(),
}).strict();
export const parseDiscoveryRequest = (value: unknown) => inputSchema.parse(value);
type Input = z.infer<typeof inputSchema>;

const cleanText = (v: unknown, fallback: string) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 110) : fallback;
function safeImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1600) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}
async function getJson(response: Response): Promise<unknown> {
  if (response.status === 429) throw new DiscoveryError("Provider rate limit reached. Try again later.", 429);
  if (response.status === 401 || response.status === 403)
    throw new DiscoveryError("Provider key was rejected or access is not enabled for this API.", 503);
  if (!response.ok) throw new DiscoveryError("NFT data provider returned HTTP " + response.status);
  const body = await response.text();
  if (body.length > 1_300_000) throw new DiscoveryError("Provider response exceeded the safety limit.");
  try { return JSON.parse(body) as unknown; }
  catch { throw new DiscoveryError("Provider returned invalid JSON."); }
}
function obj(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

async function helius(input: Input, fetcher: typeof fetch): Promise<DiscoveryResult> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new DiscoveryError("HELIUS_API_KEY is missing in this deployment.", 503);
  if (!isSolanaAddress(input.address)) throw new DiscoveryError("Paste a valid 32-byte Solana address.", 400);
  if (input.contract) throw new DiscoveryError("Contract filter is not supported for Solana discovery. Clear the contract field.", 400);
  const assets = new Map<string, DiscoveryAsset>();
  let partial = false;
  for (let page = 1; page <= 2; page++) {
    let response: Response;
    try {
      response = await fetcher("https://mainnet.helius-rpc.com/?api-key=" + encodeURIComponent(key), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-discovery", method: "getAssetsByOwner",
          params: { ownerAddress: input.address, page, limit: 100 } }),
        signal: AbortSignal.timeout(11000), redirect: "error", cache: "no-store",
      });
    } catch { throw new DiscoveryError("Solana DAS connection failed or timed out."); }
    const raw = obj(await getJson(response));
    if (raw?.error) throw new DiscoveryError("Helius DAS RPC rejected the request; confirm the key and its API permissions.", 503);
    const result = obj(raw?.result);
    if (!result || !Array.isArray(result.items) || result.items.length > 100)
      throw new DiscoveryError("Helius DAS response did not contain a valid assets page.");
    for (const item of result.items) {
      const a = obj(item);
      if (!a || typeof a.id !== "string" || !isSolanaAddress(a.id)) continue;
      const iface = a.interface;
      // Fungible assets must never masquerade as NFTs in a PnL tracker.
      if (typeof iface !== "string" || !["V1_NFT", "ProgrammableNFT", "MplCoreAsset", "MplCoreCollection", "CompressedNFT", "NFT"].includes(iface)) continue;
      const content = obj(a.content);
      const metadata = obj(content?.metadata);
      const links = obj(content?.links);
      const files = Array.isArray(content?.files) ? content.files : [];
      const file = files.length ? obj(files[0]) : null;
      const group = Array.isArray(a.grouping) ? a.grouping.find((g: unknown) => obj(g)?.group_key === "collection") : null;
      const id = a.id;
      assets.set(id, {
        id, name: cleanText(metadata?.name, "Solana NFT " + id.slice(0, 8)),
        collection: cleanText(obj(group)?.group_value, "Unclassified collection"),
        imageUrl: safeImage(links?.image) || safeImage(file?.uri),
        url: "https://solscan.io/token/" + encodeURIComponent(id),
        kind: "holding",
      });
    }
    if (result.items.length < 100) break;
    if (page === 2) partial = true;
  }
  return {
    chain: "solana", address: input.address, assets: [...assets.values()],
    partial, mode: "holdings", pnlAvailable: false,
    note: "Helius DAS confirms current NFT ownership, not historical purchase prices. SOL PnL is not calculated. Some compressed/core assets may lack images." +
      (partial ? " Only the first 200 assets were read." : ""),
  };
}

async function ordiscan(input: Input, fetcher: typeof fetch): Promise<DiscoveryResult> {
  const key = process.env.ORDISCAN_API_KEY;
  if (!key) throw new DiscoveryError("ORDISCAN_API_KEY is missing in this deployment.", 503);
  if (!isBitcoinAddress(input.address)) throw new DiscoveryError("Paste a Bitcoin mainnet address (bc1…, 1… or 3…).", 400);
  if (input.contract) throw new DiscoveryError("Bitcoin Ordinals have inscription IDs, not EVM contracts. Clear the contract field.", 400);
  const assets = new Map<string, DiscoveryAsset>();
  let partial = false;
  for (let page = 1; page <= 2; page++) {
    let response: Response;
    try {
      response = await fetcher("https://api.ordiscan.com/v1/address/" + encodeURIComponent(input.address) +
        "/inscriptions?page=" + page, {
        headers: { Authorization: "Bearer " + key, Accept: "application/json" },
        signal: AbortSignal.timeout(11000), cache: "no-store", redirect: "error",
      });
    } catch { throw new DiscoveryError("Ordiscan connection failed or timed out."); }
    const raw = obj(await getJson(response));
    if (!raw || !Array.isArray(raw.data) || raw.data.length > 100)
      throw new DiscoveryError("Unexpected Ordiscan inscriptions response.");
    for (const item of raw.data) {
      const a = obj(item);
      if (!a || typeof a.inscription_id !== "string" || !/^[a-f0-9]{64}i\d+$/i.test(a.inscription_id)) continue;
      if (a.owner_address !== input.address) continue;
      const id = a.inscription_id;
      const isImage = typeof a.content_type === "string" && /^image\/(png|jpeg|webp|gif)$/i.test(a.content_type);
      assets.set(id, {
        id, name: "Inscription " + (typeof a.inscription_number === "number" ? "#" + a.inscription_number : id.slice(0, 10)),
        collection: null, kind: "holding",
        imageUrl: isImage ? safeImage(a.content_url) : null,
        url: "https://ordiscan.com/inscription/" + id,
      });
    }
    if (raw.data.length < 100) break;
    if (page === 2) partial = true;
  }
  return {
    chain: "bitcoin", address: input.address, assets: [...assets.values()],
    partial, mode: "holdings", pnlAvailable: false,
    note: "Ordiscan provides currently owned inscriptions for this address, not a complete wallet-wide trade ledger. Transfers are not necessarily sales; BTC cost basis and PnL remain unknown." +
      (partial ? " Results were capped at 200 inscriptions." : ""),
  };
}

const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
async function ink(input: Input, fetcher: typeof fetch): Promise<DiscoveryResult> {
  const rpcEnv = process.env.INK_RPC_URL || "https://rpc-gel.inkonchain.com";
  let rpc: URL;
  try { rpc = new URL(rpcEnv); }
  catch { throw new DiscoveryError("INK_RPC_URL is invalid.", 503); }
  // Only the verified Ink mainnet RPC hosts to prevent accidental SSRF/chain mismatches.
  if (rpc.protocol !== "https:" || !["rpc-gel.inkonchain.com", "rpc-ten.inkonchain.com", "rpc-qnd.inkonchain.com", "ink.drpc.org"].includes(rpc.hostname) ||
      rpc.username || rpc.password || rpc.search || rpc.hash)
    throw new DiscoveryError("INK_RPC_URL must be a supported official Ink mainnet HTTPS endpoint.", 503);
  if (!addressSchema.safeParse(input.address).success)
    throw new DiscoveryError("Ink uses EVM 0x wallet addresses.", 400);
  if (!addressSchema.safeParse(input.contract).success)
    throw new DiscoveryError("For Ink, enter a specific ERC-721 collection contract to inspect recent transfers.", 400);
  async function rpcCall(method: string, params: unknown[]) {
    let response: Response;
    try {
      response = await fetcher(rpc.toString(), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(9500),
        redirect: "error", cache: "no-store" });
    } catch { throw new DiscoveryError("Ink RPC connection failed or timed out."); }
    const raw = obj(await getJson(response));
    if (!raw || raw.error) throw new DiscoveryError("Ink RPC rejected " + method + "; public RPC may limit log ranges.", 502);
    return raw.result;
  }
  const chain = await rpcCall("eth_chainId", []);
  if (chain !== "0xdef1") throw new DiscoveryError("Configured RPC is not Ink Mainnet (57073).", 503);
  const block = await rpcCall("eth_blockNumber", []);
  if (typeof block !== "string" || !/^0x[a-f0-9]+$/i.test(block))
    throw new DiscoveryError("Ink RPC returned an invalid block number.");
  const latest = BigInt(block);
  const from = latest > 999n ? latest - 999n : 0n;
  const wallet = "0x" + input.address.toLowerCase().slice(2).padStart(64, "0");
  const results = await Promise.all([
    rpcCall("eth_getLogs", [{ address: input.contract, fromBlock: "0x" + from.toString(16),
      toBlock: block, topics: [transferTopic, null, wallet] }]),
    rpcCall("eth_getLogs", [{ address: input.contract, fromBlock: "0x" + from.toString(16),
      toBlock: block, topics: [transferTopic, wallet] }]),
  ]);
  const assets = new Map<string, DiscoveryAsset>();
  for (let direction = 0; direction < results.length; direction++) {
    const logs = results[direction];
    if (!Array.isArray(logs) || logs.length > 3000)
      throw new DiscoveryError("Ink returned too many logs for this short window.");
    for (const raw of logs) {
      const log = obj(raw);
      if (!log || !Array.isArray(log.topics) || log.topics.length !== 4 ||
          typeof log.transactionHash !== "string" || !/^0x[a-f0-9]{64}$/i.test(log.transactionHash) ||
          typeof log.logIndex !== "string" || !/^0x[a-f0-9]+$/i.test(log.logIndex) ||
          typeof log.topics[3] !== "string" || !/^0x[a-f0-9]{64}$/i.test(log.topics[3])) continue;
      const incoming = direction === 0;
      const id = log.transactionHash.toLowerCase() + ":" + log.logIndex;
      assets.set(id, {
        id, name: "ERC-721 #" + BigInt(log.topics[3]).toString(), imageUrl: null,
        collection: input.contract!, kind: incoming ? "received" : "sent",
        url: "https://explorer.inkonchain.com/tx/" + log.transactionHash,
      });
    }
  }
  return {
    chain: "ink", address: input.address, assets: [...assets.values()].slice(0, 200),
    partial: true, mode: "recent-transfers", pnlAvailable: false,
    note: "Ink RPC confirms ERC-721 Transfer logs for the specified contract in the latest 1,000 blocks only. This is NOT full holdings or trade history. Received/sent does not mean bought/sold; no transaction prices or PnL are inferred.",
  };
}

/** Dedicated discovery adapter; never mix BTC or SOL amounts into ETH-denominated PnL. */
export async function discoverNfts(input: Input, fetcher: typeof fetch = fetch): Promise<DiscoveryResult> {
  if (input.chain === "solana") return helius(input, fetcher);
  if (input.chain === "bitcoin") return ordiscan(input, fetcher);
  return ink(input, fetcher);
}
