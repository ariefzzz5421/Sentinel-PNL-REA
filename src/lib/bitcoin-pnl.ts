/** Conservative Ordinals accounting: no BTC transfer amount can imply an NFT sale price. */
export type OrdinalHolding = {
  id: string; collection: string | null;
};
export type OrdinalMovement = {
  inscriptionId: string; txid: string; direction: "received" | "sent";
  counterpart: string | null; timestamp: string; spentAsFee: boolean;
};
export type VerifiedOrdinalSale = {
  inscriptionId: string; txid: string; buyer: string; seller: string;
  priceSats: bigint; timestamp: string;
};
export type OrdinalTrade = {
  id: string; inscriptionId: string; txid: string; date: string;
  type: "buy" | "sell" | "received" | "sent";
  priceBtc: string | null; costBtc: string | null; realizedBtc: string | null;
  priceVerified: boolean;
};
export type BitcoinCollectionPnl = {
  slug: string; held: number; floorBtc: string | null;
  realizedBtc: string | null; unrealizedBtc: string | null;
  roiPct: number | null; matchedSales: number; pricedHoldings: number;
  unknownBasisSales: number;
};
export type BitcoinPnl = {
  realizedBtc: string | null; unrealizedBtc: string | null;
  roiPct: number | null; matchedSales: number; verifiedBuys: number;
  pricedHoldings: number; unknownBasisSales: number;
  trades: OrdinalTrade[]; collections: BitcoinCollectionPnl[];
};

export function btcFromSats(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const positive = value < 0n ? -value : value;
  return sign + (positive / 100000000n).toString() + "." +
    (positive % 100000000n).toString().padStart(8, "0");
}
type State = { cost: bigint | null; collection: string };
type Totals = { held: number; floor: bigint | null; realized: bigint;
  matchedCost: bigint; matched: number; unknown: number;
  marked: bigint; priced: number; };
function totals(): Totals {
  return { held: 0, floor: null, realized: 0n, matchedCost: 0n,
    matched: 0, unknown: 0, marked: 0n, priced: 0 };
}
/** Uses only same-inscription, same-settlement-tx and same-wallet verified sales. */
export function calculateBitcoinPnl(
  wallet: string,
  holdings: OrdinalHolding[],
  movements: OrdinalMovement[],
  sales: VerifiedOrdinalSale[],
  floors: Record<string, bigint> = {},
): BitcoinPnl {
  const saleById = new Map<string, VerifiedOrdinalSale | null>();
  for (const sale of sales) {
    if (sale.buyer === sale.seller || sale.priceSats <= 0n) continue;
    const key = sale.inscriptionId + ":" + sale.txid;
    if (saleById.has(key)) {
      const prior = saleById.get(key);
      if (!prior || prior.buyer !== sale.buyer || prior.seller !== sale.seller ||
          prior.priceSats !== sale.priceSats) saleById.set(key, null);
    } else saleById.set(key, sale);
  }
  const holdingNames = new Map(holdings.map(h => [h.id, h.collection || "Unclassified"]));
  const states = new Map<string, State>();
  const grouped = new Map<string, Totals>();
  const group = (name: string) => {
    if (!grouped.has(name)) grouped.set(name, totals());
    return grouped.get(name)!;
  };
  const activities: OrdinalTrade[] = [];
  const seen = new Set<string>();
  let matched = 0, verifiedBuys = 0, unknown = 0;
  let realized = 0n, matchedCost = 0n;
  for (const event of [...movements].sort((a,b) =>
    a.timestamp.localeCompare(b.timestamp) || a.txid.localeCompare(b.txid))) {
    const key = event.inscriptionId + ":" + event.txid + ":" + event.direction;
    if (seen.has(key)) continue;
    seen.add(key);
    const previous = states.get(event.inscriptionId);
    const collection = holdingNames.get(event.inscriptionId) ||
      previous?.collection || "Unclassified";
    const sale = saleById.get(event.inscriptionId + ":" + event.txid);
    const other = event.direction === "received" ? sale?.seller : sale?.buyer;
    const sellerMatches = event.direction === "sent" && sale?.seller === wallet;
    const buyerMatches = event.direction === "received" && sale?.buyer === wallet;
    const verified = Boolean(sale && !event.spentAsFee && (sellerMatches || buyerMatches) &&
      (!event.counterpart || event.counterpart === other));
    const price = verified ? sale!.priceSats : null;
    let cost: bigint | null = null;
    let profit: bigint | null = null;
    if (event.direction === "received") {
      // Unknown receipts break an earlier position's verified basis.
      states.set(event.inscriptionId, { cost: price, collection });
      if (price !== null) verifiedBuys++;
    } else {
      cost = previous?.cost ?? null;
      states.delete(event.inscriptionId);
      if (price !== null) {
        if (cost !== null) {
          profit = price - cost;
          realized += profit; matchedCost += cost; matched++;
          const c = group(collection);
          c.realized += profit; c.matchedCost += cost; c.matched++;
        } else { unknown++; group(collection).unknown++; }
      }
    }
    activities.push({
      id: key, inscriptionId: event.inscriptionId, txid: event.txid,
      date: event.timestamp,
      type: event.direction === "received" ? (price === null ? "received" : "buy") :
        (price === null ? "sent" : "sell"),
      priceBtc: price === null ? null : btcFromSats(price),
      costBtc: cost === null ? null : btcFromSats(cost),
      realizedBtc: profit === null ? null : btcFromSats(profit),
      priceVerified: price !== null,
    });
  }
  let marked = 0n, pricedHoldings = 0;
  for (const item of holdings) {
    const name = item.collection || "Unclassified";
    const g = group(name); g.held++;
    const floor = floors[name];
    if (floor !== undefined && floor >= 0n) g.floor = floor;
    const cost = states.get(item.id)?.cost;
    if (cost !== null && cost !== undefined && floor !== undefined && floor >= 0n) {
      marked += floor - cost; g.marked += floor - cost;
      pricedHoldings++; g.priced++;
    }
  }
  return {
    realizedBtc: matched ? btcFromSats(realized) : null,
    unrealizedBtc: pricedHoldings ? btcFromSats(marked) : null,
    roiPct: matchedCost > 0n ? Number((realized * 10000n) / matchedCost) / 100 : null,
    matchedSales: matched, verifiedBuys, pricedHoldings, unknownBasisSales: unknown,
    trades: activities.reverse().slice(0, 150),
    collections: [...grouped.entries()].map(([slug, c]) => ({
      slug, held: c.held, floorBtc: c.floor === null ? null : btcFromSats(c.floor),
      realizedBtc: c.matched ? btcFromSats(c.realized) : null,
      unrealizedBtc: c.priced ? btcFromSats(c.marked) : null,
      roiPct: c.matchedCost > 0n ? Number((c.realized * 10000n) / c.matchedCost) / 100 : null,
      matchedSales: c.matched, pricedHoldings: c.priced, unknownBasisSales: c.unknown,
    })).filter(c => c.held > 0 || c.matchedSales > 0 || c.unknownBasisSales > 0)
      .sort((a,b)=>b.held-a.held || a.slug.localeCompare(b.slug)),
  };
}