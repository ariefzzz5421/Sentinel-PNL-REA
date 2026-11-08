import Decimal from "decimal.js";
import type { Chain, TradeEvent } from "./schema";
import { calculatePnl } from "./pnl/calculate";

export type OverallWalletPnl = {
  realizedEth: string | null;
  matchedSales: number;
  unknownBasisSales: number;
  estimatedSales: number;
  bought: number;
  sold: number;
  minted: number;
  transfersIn: number;
  collections: number;
  wallets: number;
  perChain: Array<{ chain: Chain; realizedEth: string | null; matchedSales: number }>;
};

/**
 * Aggregate only matched priced ETH/WETH buy→sell lots, across all wallet and
 * EVM chain scopes; no native Ink/Arc data or historical USD assumptions.
 * Null means no verifiable cost-basis match, not zero profit.
 */
export function summarizeOverallWalletPnl(
  events: readonly TradeEvent[], address: string | null,
): OverallWalletPnl {
  const scoped = address
    ? events.filter(e => e.wallet.toLowerCase() === address.toLowerCase())
    : [...events];
  const summary = calculatePnl(scoped);
  const matchedSales = summary.trades.filter(trade =>
    trade.type === "sell" && trade.realizedEth !== null).length;
  const perChain: OverallWalletPnl["perChain"] = [];
  for (const chain of ["ethereum", "base", "arbitrum", "robinhood"] as const) {
    const chainEvents = scoped.filter(e => e.chain === chain);
    if (!chainEvents.length) continue;
    const result = calculatePnl(chainEvents);
    const matched = result.trades.filter(trade =>
      trade.type === "sell" && trade.realizedEth !== null).length;
    perChain.push({
      chain, matchedSales: matched,
      realizedEth: matched > 0 ? result.realizedEth : null,
    });
  }
  // Use exactly the curated source calculation (same as per-collection cards).
  // No extra price/fee inference or recomputation in the share-card renderer.
  return {
    realizedEth: matchedSales ? new Decimal(summary.realizedEth).toFixed(8) : null,
    matchedSales,
    unknownBasisSales: summary.unknownBasisSales,
    estimatedSales: summary.estimatedSales,
    bought: summary.buys, sold: summary.sells,
    minted: summary.mints, transfersIn: summary.transfersIn,
    collections: new Set(scoped.map(e => e.chain + ":" +
      (e.contract || e.collection).toLowerCase())).size,
    wallets: new Set(scoped.map(e => e.wallet.toLowerCase())).size,
    perChain,
  };
}

export function safeCardName(value: string, fallback: string): string {
  const clean = value.replace(/[\x00-\x1f\x7f<>]/g, "").trim().slice(0, 48);
  return clean || fallback;
}
