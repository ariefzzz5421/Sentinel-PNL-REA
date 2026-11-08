import type { DiscoveryResult } from "./nft-discovery";
export type IndexedEvmCollection = {
  key: string; chain: "arc" | "ink"; name: string;
  imageUrl: string | null; contract: string | null;
  owned: number; received: number; sent: number;
  link: string;
};
/** Indexed NFT inventory and transfers, never inferred purchases or sales. */
export function groupIndexedEvmCollections(
  discoveries: readonly DiscoveryResult[],
): IndexedEvmCollection[] {
  const rows = new Map<string, IndexedEvmCollection>();
  const ownedIds = new Map<string, Set<string>>();
  const transferIds = new Map<string, Set<string>>();
  for (const result of discoveries) {
    if (result.chain !== "arc" && result.chain !== "ink") continue;
    for (const asset of result.assets) {
      const contract = asset.contract?.toLowerCase() || null;
      const collection = asset.collection?.trim() || "Unknown collection";
      const key = result.chain + ":" + (contract || collection.toLowerCase());
      let row = rows.get(key);
      if (!row) {
        row = {
          key, chain: result.chain, name: collection,
          imageUrl: asset.imageUrl, contract,
          owned: 0, received: 0, sent: 0, link: asset.url,
        };
        rows.set(key, row);
      }
      if (!row.imageUrl && asset.imageUrl) row.imageUrl = asset.imageUrl;
      if (asset.kind === "holding") {
        if (!ownedIds.has(key)) ownedIds.set(key, new Set());
        const unique = result.address.toLowerCase() + ":" + (asset.tokenId || asset.id);
        if (!ownedIds.get(key)!.has(unique)) {
          row.owned++;
          ownedIds.get(key)!.add(unique);
        }
      } else {
        if (!transferIds.has(key)) transferIds.set(key, new Set());
        const unique = result.address.toLowerCase() + ":" + asset.id;
        if (transferIds.get(key)!.has(unique)) continue;
        transferIds.get(key)!.add(unique);
        if (asset.kind === "received") row.received++;
        else if (asset.kind === "sent") row.sent++;
      }
    }
  }
  return [...rows.values()].sort((a, b) =>
    b.owned - a.owned || (b.received + b.sent) - (a.received + a.sent) ||
    a.name.localeCompare(b.name));
}
