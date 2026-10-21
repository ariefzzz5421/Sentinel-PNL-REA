import Papa from "papaparse";
import { eventsSchema, type TradeEvent } from "./schema";

const header = [
  "id",
  "date",
  "chain",
  "wallet",
  "collection",
  "contract",
  "tokenId",
  "type",
  "amountEth",
  "feeEth",
  "txHash",
] as const;

export function parseTradeCsv(text: string): TradeEvent[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    const issue = parsed.errors[0]!;
    throw new Error(`CSV row ${(issue.row ?? 0) + 2}: ${issue.message}`);
  }
  if (parsed.data.length > 10000)
    throw new Error("CSV exceeds the 10,000-row limit.");
  const rows = parsed.data.map((row, index) => ({
    id: row.id?.trim() || `csv-${index}-${row.txHash || row.date}`,
    date: row.date?.trim(),
    chain: row.chain?.trim(),
    wallet: row.wallet?.trim(),
    collection: row.collection?.trim(),
    contract: row.contract?.trim() || undefined,
    tokenId: row.tokenId?.trim(),
    type: row.type?.trim(),
    amountEth: row.amountEth?.trim(),
    feeEth: row.feeEth?.trim() || "0",
    txHash: row.txHash?.trim() || undefined,
  }));
  const result = eventsSchema.safeParse(rows);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `CSV row ${Number(issue.path[0]) + 2}, ${String(issue.path[1])}: ${issue.message}`,
    );
  }
  if (new Set(result.data.map((row) => row.id)).size !== result.data.length)
    throw new Error("CSV contains duplicate event IDs.");
  return result.data;
}

export function toTradeCsv(events: TradeEvent[]): string {
  return Papa.unparse({
    fields: [...header],
    data: events.map((event) => header.map((field) => event[field] ?? "")),
  });
}
