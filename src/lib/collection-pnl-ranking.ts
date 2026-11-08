import Decimal from "decimal.js";

/** Return a copy; never mutate the curated scan ledger or input rows. */
export function rankCollectionsByRealizedPnl<T extends { pnl: string | null }>(
  rows: readonly T[], order: "best" | "worst",
): T[] {
  return rows.filter((row) =>
    row.pnl !== null && (order === "best" || new Decimal(row.pnl).lt(0)))
    .sort((a, b) => order === "best"
      ? new Decimal(b.pnl!).cmp(a.pnl!)
      : new Decimal(a.pnl!).cmp(b.pnl!));
}
