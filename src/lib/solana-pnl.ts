import Decimal from "decimal.js";
import { isSolanaAddress } from "./discovery-wallet";

/** A conservative, gross-only metric; never equate it with complete wallet realized PnL. */
export type MatchedSolPnl = {
  grossSol: string;
  matchedSales: number;
  unmatchedSales: number;
  examinedTransactions: number;
  /** Transaction history covers at most 2 pages (200 transactions). */
  partialHistory: true;
};

type Sale = { mint: string; timestamp: number; buyer: string; seller: string; lamports: bigint; signature: string };
function object(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function parsedSale(value: unknown, wallet: string): Sale | null {
  const t = object(value);
  if (!t || t.type !== "NFT_SALE" || typeof t.signature !== "string" ||
    typeof t.timestamp !== "number" || !Number.isFinite(t.timestamp)) return null;
  const nft = object(object(t.events)?.nft);
  if (!nft || typeof nft.buyer !== "string" || typeof nft.seller !== "string" ||
    (nft.buyer !== wallet && nft.seller !== wallet)) return null;
  // The documented Helius NFT event has amount in *lamports* and nfts[].
  // Multi-NFT bundles cannot be safely allocated an individual cost per asset.
  if (!Array.isArray(nft.nfts) || nft.nfts.length !== 1) return null;
  const token = object(nft.nfts[0]);
  if (!token || typeof token.mint !== "string" || !isSolanaAddress(token.mint)) return null;
  const standard = token.tokenStandard;
  if (standard !== "NonFungible" && standard !== "ProgrammableNonFungible") return null;
  const n = nft.amount;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return null;
  return { mint: token.mint, buyer: nft.buyer, seller: nft.seller, lamports: BigInt(n),
    timestamp: t.timestamp, signature: t.signature };
}

/**
 * Optional Helius Enhanced API path. Only matches verified single NFT sales
 * acquired and sold in this wallet with the SAME mint. Unknown cost basis,
 * bundles, non-SOL payments, and cNFTs are excluded.
 * Results intentionally omit gas/marketplace fees (gross before fees).
 * Helius Enhanced is a legacy endpoint; failures degrade to null, not fake PnL.
 */
export async function getMatchedSolPnl(
  wallet: string, key: string, fetcher: typeof fetch = fetch,
): Promise<MatchedSolPnl | null> {
  if (!isSolanaAddress(wallet) || !key) return null;
  const all: Sale[] = [];
  let before: string | null = null;
  let examined = 0;
  for (let page = 0; page < 2; page++) {
    const url = new URL("https://api-mainnet.helius-rpc.com/v0/addresses/" + wallet + "/transactions");
    url.searchParams.set("api-key", key);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);
    let response: Response;
    try {
      response = await fetcher(url.toString(), { headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "error" });
    } catch { return null; }
    if (!response.ok) return null;
    let raw: unknown;
    try {
      const body = await response.text();
      if (body.length > 1_600_000) return null;
      raw = JSON.parse(body) as unknown;
    } catch { return null; }
    if (!Array.isArray(raw) || raw.length > 100) return null;
    examined += raw.length;
    for (const tx of raw) {
      const sale = parsedSale(tx, wallet);
      if (sale) all.push(sale);
    }
    if (raw.length < 100) break;
    const last = object(raw[raw.length - 1]);
    if (typeof last?.signature !== "string" || last.signature === before) break;
    before = last.signature;
  }
  if (!all.length) return null;
  const seen = new Set<string>();
  const buy = new Map<string, bigint>();
  let net = 0n, matched = 0, unmatched = 0;
  for (const sale of all.sort((a,b)=>a.timestamp-b.timestamp || a.signature.localeCompare(b.signature))) {
    const key = sale.signature + ":" + sale.mint;
    if (seen.has(key)) continue;
    seen.add(key);
    if (sale.buyer === wallet && sale.seller !== wallet) {
      buy.set(sale.mint, sale.lamports);
    } else if (sale.seller === wallet && sale.buyer !== wallet) {
      const cost = buy.get(sale.mint);
      if (cost === undefined) { unmatched++; continue; }
      net += sale.lamports - cost;
      matched++;
      buy.delete(sale.mint);
    }
  }
  if (matched === 0) return null;
  return { grossSol: new Decimal(net.toString()).div(1_000_000_000).toFixed(6),
    matchedSales: matched, unmatchedSales: unmatched, examinedTransactions: examined, partialHistory: true };
}
