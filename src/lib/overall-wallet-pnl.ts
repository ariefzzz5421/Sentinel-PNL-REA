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
  const matchedSales = summary.sells - summary.unknownBasisSales;
  const perChain: OverallWalletPnl["perChain"] = [];
  for (const chain of ["ethereum", "base", "arbitrum", "robinhood"] as const) {
    const chainEvents = scoped.filter(e => e.chain === chain);
    if (!chainEvents.length) continue;
    const result = calculatePnl(chainEvents);
    const matched = result.sells - result.unknownBasisSales;
    perChain.push({
      chain, matchedSales: matched,
      realizedEth: matched > 0 ? result.realizedEth : null,
    });
  }
  // Sum already-matched chain rows only; unknown-basis sales cannot become zero-cost wins.
  const realized = perChain.reduce(
    (sum, chain) => chain.realizedEth === null ? sum : sum.plus(new Decimal(chain.realizedEth)),
    new Decimal(0),
  );
  return {
    realizedEth: matchedSales ? realized.toFixed(8) : null,
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
