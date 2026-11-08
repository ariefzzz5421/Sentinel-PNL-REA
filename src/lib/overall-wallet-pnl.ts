import Decimal from "decimal.js";
import type { Chain, TradeEvent } from "./schema";
import { calculatePnl } from "./pnl/calculate";

export type OverallWalletPnl = {
  realizedEth: string | null;
  grossProfitsEth: string;
  grossLossesEth: string;
  netReconciled: boolean;
  wins: number;
  losses: number;
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
  const matchedTrades = summary.trades.filter(trade =>
    trade.type === "sell" && trade.realizedEth !== null);
  const matchedSales = matchedTrades.length;
  // Audit independently from signed curated sale rows: gross wins minus gross losses.
  // Never infer prices for missing-basis trades or unpriced chains.
  const grossProfits = matchedTrades.reduce((sum, trade) => {
    const pnl = new Decimal(trade.realizedEth!);
    return pnl.gt(0) ? sum.plus(pnl) : sum;
  }, new Decimal(0));
  const grossLosses = matchedTrades.reduce((sum, trade) => {
    const pnl = new Decimal(trade.realizedEth!);
    return pnl.lt(0) ? sum.plus(pnl.negated()) : sum;
  }, new Decimal(0));
  const net = grossProfits.minus(grossLosses);
  const netReconciled = net.eq(summary.realizedEth);
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
    // If the independent audit differs from the ledger, refuse to publish a misleading total.
    realizedEth: matchedSales && netReconciled ? net.toFixed(8) : null,
    grossProfitsEth: grossProfits.toFixed(8),
    grossLossesEth: grossLosses.toFixed(8),
    netReconciled,
    wins: summary.wins,
    losses: summary.losses,
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
