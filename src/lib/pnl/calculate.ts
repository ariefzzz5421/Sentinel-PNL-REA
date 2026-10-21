import Decimal from "decimal.js";
import type { TradeEvent } from "@/lib/schema";

export type CalculatedTrade = TradeEvent & {
  costEth: string | null;
  realizedEth: string | null;
  note?: string;
};
export type CollectionSummary = {
  name: string;
  buys: number;
  sells: number;
  spentEth: string;
  receivedEth: string;
  realizedEth: string;
  openPositions: number;
  unknownBasisSales: number;
};
export type PnlSummary = {
  realizedEth: string;
  spentEth: string;
  receivedEth: string;
  feesEth: string;
  volumeEth: string;
  buys: number;
  sells: number;
  wins: number;
  losses: number;
  unknownBasisSales: number;
  openPositions: number;
  trades: CalculatedTrade[];
  collections: CollectionSummary[];
};

const zero = () => new Decimal(0);
const keyOf = (event: TradeEvent) =>
  `${event.chain}:${(event.contract || event.collection).toLowerCase()}:${event.tokenId.toLowerCase()}:${event.wallet.toLowerCase()}`;

/** One NFT lot per token ID. Sales without a matching buy retain unknown cost basis. */
export function calculatePnl(events: TradeEvent[], from?: Date): PnlSummary {
  const positions = new Map<string, { cost: Decimal; collectionKey: string }>();
  const collectionMap = new Map<
    string,
    {
      name: string;
      buys: number;
      sells: number;
      spent: Decimal;
      received: Decimal;
      realized: Decimal;
      unknown: number;
    }
  >();
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const result: CalculatedTrade[] = [];
  let realized = zero(),
    spent = zero(),
    received = zero(),
    fees = zero(),
    buys = 0,
    sells = 0,
    wins = 0,
    losses = 0,
    unknown = 0;
  for (const event of sorted) {
    const amount = new Decimal(event.amountEth);
    const fee = new Decimal(event.feeEth);
    const key = keyOf(event);
    const collectionKey = `${event.chain}:${(event.contract || event.collection).toLowerCase()}`;
    const col = collectionMap.get(collectionKey) || {
      name: event.collection,
      buys: 0,
      sells: 0,
      spent: zero(),
      received: zero(),
      realized: zero(),
      unknown: 0,
    };
    collectionMap.set(collectionKey, col);
    const included = !from || new Date(event.date) >= from;
    if (event.type !== "sell") {
      // Cost is retained even if the purchase predates the selected sale window.
      positions.set(key, {
        cost: (positions.get(key)?.cost || zero()).plus(amount).plus(fee),
        collectionKey,
      });
      if (included) {
        buys++;
        spent = spent.plus(amount).plus(fee);
        fees = fees.plus(fee);
        col.buys++;
        col.spent = col.spent.plus(amount).plus(fee);
        result.push({
          ...event,
          costEth: amount.plus(fee).toString(),
          realizedEth: null,
        });
      }
      continue;
    }
    const position = positions.get(key);
    const cost = position?.cost;
    if (position) positions.delete(key);
    if (!included) continue;
    sells++;
    received = received.plus(amount).minus(fee);
    fees = fees.plus(fee);
    col.sells++;
    col.received = col.received.plus(amount).minus(fee);
    if (!cost) {
      unknown++;
      col.unknown++;
      result.push({
        ...event,
        costEth: null,
        realizedEth: null,
        note: "Cost basis unavailable",
      });
      continue;
    }
    const profit = amount.minus(fee).minus(cost);
    realized = realized.plus(profit);
    col.realized = col.realized.plus(profit);
    if (profit.gt(0)) wins++;
    else if (profit.lt(0)) losses++;
    result.push({
      ...event,
      costEth: cost.toString(),
      realizedEth: profit.toString(),
    });
  }
  const openByCollection = new Map<string, number>();
  for (const position of positions.values()) {
    const prefix = position.collectionKey;
    openByCollection.set(prefix, (openByCollection.get(prefix) || 0) + 1);
  }
  return {
    realizedEth: realized.toString(),
    spentEth: spent.toString(),
    receivedEth: received.toString(),
    feesEth: fees.toString(),
    volumeEth: spent.plus(received).toString(),
    buys,
    sells,
    wins,
    losses,
    unknownBasisSales: unknown,
    openPositions: positions.size,
    trades: result.reverse(),
    collections: [...collectionMap.entries()]
      .map(([key, c]) => ({
        name: c.name,
        buys: c.buys,
        sells: c.sells,
        spentEth: c.spent.toString(),
        receivedEth: c.received.toString(),
        realizedEth: c.realized.toString(),
        openPositions: openByCollection.get(key) || 0,
        unknownBasisSales: c.unknown,
      }))
      .filter((c) => c.buys || c.sells || c.openPositions)
      .sort((a, b) => new Decimal(b.realizedEth).cmp(a.realizedEth)),
  };
}
