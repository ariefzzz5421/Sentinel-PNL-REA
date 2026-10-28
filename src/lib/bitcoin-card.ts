import type { DiscoveryAsset } from "./nft-discovery";
import type { BitcoinPnl } from "./bitcoin-pnl";

/** Native BTC values only. Do not turn missing prices into zero or ETH values. */
export type BitcoinCardScope = "wallet" | "collection";
export type BitcoinCardView = {
  scope: BitcoinCardScope;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  walletLabel: string;
  held: number;
  floorBtc: string | null;
  realizedBtc: string | null;
  unrealizedBtc: string | null;
  roiPct: number | null;
  matchedSales: number;
  pricedHoldings: number;
  unknownBasisSales: number;
  priceStatus: "VERIFIED SUBSET" | "PARTIAL ESTIMATE" | "UNVERIFIED";
  partial: boolean;
};

export function maskedBitcoinAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.length > 19 ? trimmed.slice(0, 10) + "…" + trimmed.slice(-8) : trimmed;
}

export function buildBitcoinCardView(
  address: string,
  assets: DiscoveryAsset[],
  report: BitcoinPnl,
  scope: BitcoinCardScope,
  collectionSlug?: string,
  partial = true,
): BitcoinCardView {
  const selected = scope === "collection" && collectionSlug
    ? report.collections.find(c => c.slug === collectionSlug) : undefined;
  if (scope === "collection" && !selected) {
    throw new Error("Choose a collection from the indexed Bitcoin scan results.");
  }
  const owned = scope === "collection"
    ? assets.filter(asset => (asset.collection || "Unclassified") === collectionSlug)
    : assets;
  const realizedBtc = selected ? selected.realizedBtc : report.realizedBtc;
  const unrealizedBtc = selected ? selected.unrealizedBtc : report.unrealizedBtc;
  const matchedSales = selected ? selected.matchedSales : report.matchedSales;
  const pricedHoldings = selected ? selected.pricedHoldings : report.pricedHoldings;
  const unknownBasisSales = selected ? selected.unknownBasisSales : report.unknownBasisSales;
  const roiPct = selected ? selected.roiPct : report.roiPct;

  // A floor is a market quote, not proof of an inscription's cost basis.
  // The wallet-level floor must never be inferred from several different collections.
  const priceStatus = realizedBtc !== null || roiPct !== null
    ? "VERIFIED SUBSET"
    : unrealizedBtc !== null
      ? "PARTIAL ESTIMATE"
      : "UNVERIFIED";
  return {
    scope,
    title: scope === "wallet" ? "ORDINALS WALLET" : collectionSlug!,
    subtitle: scope === "wallet" ? "BTC inscription portfolio" : "BTC collection performance",
    imageUrl: owned.find(asset => asset.imageUrl)?.imageUrl || null,
    walletLabel: maskedBitcoinAddress(address),
    held: owned.length,
    floorBtc: selected?.floorBtc ?? null,
    realizedBtc, unrealizedBtc, roiPct,
    matchedSales, pricedHoldings, unknownBasisSales,
    priceStatus,
    partial,
  };
}

/** X web intents can pre-fill text, but cannot attach a local canvas image. */
export function bitcoinCardShareText(view: BitcoinCardView): string {
  const realized = view.realizedBtc === null ? "Unknown" : view.realizedBtc + " BTC";
  const unrealized = view.unrealizedBtc === null ? "Unknown" : view.unrealizedBtc + " BTC (floor estimate)";
  return "Sentinel BTC Ordinals · " + view.title +
    "\nOwned inscriptions: " + view.held +
    "\nRealized PnL (verified subset): " + realized +
    "\nUnrealized PnL (partial estimate): " + unrealized +
    "\nHistorical pricing incomplete · not investment advice.";
}