"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Download, Images, TrendingUp } from "lucide-react";
import { calculatePnl } from "@/lib/pnl/calculate";
import type { Chain, TradeEvent } from "@/lib/schema";

export type PublicHolding = {
  name: string; slug: string; imageUrl: string | null; held: number | null; chain: string; contract: string;
};
type Filter = "recent" | "best" | "holding";
type CollectionRow = {
  key: string; name: string; chain: Chain; image: string | null;
  bought: number; sold: number; held: number | null;
  pnl: string | null; latest: string; unknown: number; estimated: boolean;
};
const safeImage = (source: string | null | undefined): string | null => {
  if (!source) return null;
  try { return new URL(source).protocol === "https:" ? source : null; }
  catch { return null; }
};

function createRows(events: TradeEvent[], holdings: PublicHolding[]): CollectionRow[] {
  const groups = new Map<string, TradeEvent[]>();
  for (const event of events) {
    const key = event.chain + ":" + (event.contract || event.collection).toLowerCase();
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  const ownerData = new Map(holdings.map((holding) => [holding.chain + ":" + holding.contract.toLowerCase(), holding]));
  const keys = new Set([...groups.keys(), ...ownerData.keys()]);
  const rows: CollectionRow[] = [];
  for (const key of keys) {
    const trades = groups.get(key) || [];
    const owned = ownerData.get(key);
    const pnl = calculatePnl(trades);
    const matched = pnl.sells - pnl.unknownBasisSales;
    const recent = trades.reduce((max, item) => item.date > max ? item.date : max, "");
    const sample = trades[0];
    // Holding quantity is sourced from the separate OpenSea owned-collections endpoint;
    // derived open positions are not presented as verified current holdings.
    if (!sample && !owned) continue;
    rows.push({
      key, name: owned?.name || sample?.collection || key,
      chain: (sample?.chain || owned?.chain || "ethereum") as Chain,
      image: safeImage(owned?.imageUrl || sample?.imageUrl),
      bought: pnl.buys, sold: pnl.sells, held: owned?.held ?? null,
      pnl: matched ? pnl.realizedEth : null,
      latest: recent,
      unknown: pnl.unknownBasisSales,
      estimated: pnl.estimatedSales > 0,
    });
  }
  return rows;
}

function downloadCsv(rows: CollectionRow[]) {
  const columns = ["collection", "chain", "buys", "sales", "held_verified", "realized_pnl_eth_estimate", "unknown_basis_sales"];
  const cell = (value: string | number | null) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const contents = [columns.join(","), ...rows.map((row) =>
    [row.name, row.chain, row.bought, row.sold, row.held, row.pnl, row.unknown].map(cell).join(","))].join("\n");
  const link = document.createElement("a");
  const file = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  link.href = file;
  link.download = "sentinel-nft-pnl-collections.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(file);
}

export function ScanResults({
  events, holdings, partial, warning, address,
}: { events: TradeEvent[]; holdings: PublicHolding[]; partial: boolean; warning: string; address: string | null }) {
  const [filter, setFilter] = useState<Filter>("recent");
  const rows = useMemo(() => createRows(events.filter((event) => address === null || event.wallet.toLowerCase() === address.toLowerCase()), holdings), [events, holdings, address]);
  const shown = useMemo(() => {
    if (filter === "holding") return rows.filter((row) => row.held !== null && row.held > 0)
      .sort((a, b) => (b.held || 0) - (a.held || 0));
    if (filter === "best") return rows.filter((row) => row.pnl !== null)
      .sort((a, b) => Number(b.pnl) - Number(a.pnl));
    return [...rows].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [rows, filter]);

  return <section className="scan-results" aria-label="NFT collection scan results">
    <div className="scan-result-tabs" role="group" aria-label="Sort NFT collections">
      <button type="button" aria-pressed={filter === "recent"} className={filter === "recent" ? "active" : ""} onClick={() => setFilter("recent")}>Recent</button>
      <button type="button" aria-pressed={filter === "best"} className={filter === "best" ? "active" : ""} onClick={() => setFilter("best")}>Best PNL</button>
      <button type="button" aria-pressed={filter === "holding"} className={filter === "holding" ? "active" : ""} onClick={() => setFilter("holding")}>Holding</button>
      <span className="scan-result-total">{rows.length} collections indexed</span>
      <button type="button" onClick={() => downloadCsv(shown)} className="scan-results-export"><Download size={16}/> CSV</button>
    </div>
    {partial && <p className="scan-results-warning" role="status">Partial data — historical cost basis, mint activity, fees, or collections may be missing. {warning}</p>}
    {shown.length ? <div className="scan-results-grid">
      {shown.map((item) => <article className="scan-collection-card" key={item.key}>
        <div className="scan-collection-heading">
          {item.image
            ? <Image src={item.image} width={66} height={66} alt="" unoptimized className="scan-collection-image"/>
            : <div className="scan-collection-image scan-collection-placeholder"><Images size={24}/></div>}
          <div className="scan-collection-title"><strong>{item.name}</strong><span>● {item.chain.toUpperCase()}</span></div>
          <div className="scan-collection-pnl">
            <strong className={item.pnl === null ? "unknown" : Number(item.pnl) >= 0 ? "positive" : "negative"}>
              {item.pnl === null ? "—" : (Number(item.pnl) > 0 ? "+" : "") + Number(item.pnl).toFixed(4)}
            </strong>
            <small>ETH PNL {item.estimated ? "· est." : ""}</small>
          </div>
        </div>
        <div className="scan-collection-stats">
          <div><span>BOUGHT</span><strong>{item.bought}</strong></div>
          <div><span>SOLD</span><strong>{item.sold}</strong></div>
          <div><span>HOLD</span><strong>{item.held ?? "—"}</strong></div>
        </div>
        {(item.unknown > 0 || item.held === null) && <p className="scan-collection-note">{item.unknown ? item.unknown + " sale(s) have unknown cost basis. " : ""}{item.held === null ? "Holdings not verified." : ""}</p>}
      </article>)}
    </div> : <div className="scan-results-empty"><TrendingUp size={24}/><p>{filter === "best" ? "No matched buy and sell trades to rank yet." : filter === "holding" ? "No current collection holdings verified by OpenSea." : "No supported NFT activity in the available scan history."}</p></div>}
  </section>;
}
