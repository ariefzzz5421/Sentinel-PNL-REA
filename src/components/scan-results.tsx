"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Download, Images, Info, Share2, X } from "lucide-react";
import { PnlCardStudio } from "@/components/pnl-card-studio";
import { calculatePnl, type CalculatedTrade } from "@/lib/pnl/calculate";
import type { Chain, TradeEvent } from "@/lib/schema";

export type PublicHolding = {
  name: string; slug: string; imageUrl: string | null;
  held: number | null; chain: string; contract: string;
};
type Filter = "recent" | "best" | "holding";
type CollectionRow = {
  key: string; name: string; chain: Chain; contract: string;
  image: string | null; bought: number; sold: number; held: number | null;
  pnl: string | null; latest: string; unknown: number; estimated: boolean;
  trades: CalculatedTrade[];
};
const chainExplorer: Record<Chain, string> = {
  ethereum: "https://etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  robinhood: "https://robinhoodchain.blockscout.com/tx/",
};

function safeImage(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; }
  catch { return null; }
}
function formatEth(value: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return (amount > 0 ? "+" : "") + amount.toFixed(4);
}
function collectionRows(events: TradeEvent[], holdings: PublicHolding[], holdingsComplete: boolean): CollectionRow[] {
  const groups = new Map<string, TradeEvent[]>();
  for (const event of events) {
    const key = event.chain + ":" + (event.contract || event.collection).toLowerCase();
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  const owned = new Map(holdings.map((entry) => [entry.chain + ":" + entry.contract.toLowerCase(), entry]));
  const keys = new Set([...groups.keys(), ...owned.keys()]);
  const rows: CollectionRow[] = [];
  for (const key of keys) {
    const eventsForCollection = groups.get(key) || [];
    const holding = owned.get(key);
    const first = eventsForCollection[0];
    if (!first && !holding) continue;
    const summary = calculatePnl(eventsForCollection);
    const matched = summary.sells - summary.unknownBasisSales;
    const latest = eventsForCollection.reduce((max, event) => event.date > max ? event.date : max, "");
    rows.push({
      key, name: holding?.name || first?.collection || key,
      chain: (first?.chain || holding?.chain || "ethereum") as Chain,
      contract: first?.contract || holding?.contract || "",
      image: safeImage(holding?.imageUrl || first?.imageUrl),
      bought: summary.buys, sold: summary.sells, held: holding ? holding.held : holdingsComplete ? 0 : null,
      pnl: matched > 0 ? summary.realizedEth : null,
      latest, unknown: summary.unknownBasisSales,
      estimated: summary.estimatedSales > 0,
      trades: summary.trades,
    });
  }
  return rows;
}
function downloadCsv(rows: CollectionRow[]) {
  const cell = (v: string | number | null) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const headers = ["collection", "chain", "bought", "sold", "hold", "realized_pnl_eth_estimated", "unmatched_sales"];
  const csv = [headers.join(","), ...rows.map((item) => [item.name, item.chain, item.bought, item.sold,
    item.held, item.pnl, item.unknown].map(cell).join(","))].join("\n");
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = href; a.download = "sentinel-pnl-collections.csv";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
}
export function ScanResults({
  events, holdings, holdingsComplete, partial, warning, address,
}: { events: TradeEvent[]; holdings: PublicHolding[]; holdingsComplete: boolean; partial: boolean; warning: string; address: string | null }) {
  const [filter, setFilter] = useState<Filter>("recent");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const rows = useMemo(() => collectionRows(events.filter((event) => address === null ||
    event.wallet.toLowerCase() === address.toLowerCase()), holdings, holdingsComplete), [events, holdings, holdingsComplete, address]);
  const shown = useMemo(() => {
    if (filter === "holding") return rows.filter((row) => row.held !== null && row.held > 0)
      .sort((a, b) => (b.held || 0) - (a.held || 0));
    if (filter === "best") return rows.filter((row) => row.pnl !== null)
      .sort((a, b) => Number(b.pnl) - Number(a.pnl));
    return [...rows].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [filter, rows]);
  const selected = rows.find((row) => row.key === activeKey) || null;

  useEffect(() => {
    if (!activeKey) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveKey(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeKey]);

  return <section className="scan-results" aria-label="NFT collection scan results">
    <div className="scan-result-tabs" role="group" aria-label="NFT collection filters">
      <button type="button" aria-pressed={filter === "recent"} className={filter === "recent" ? "active" : ""} onClick={() => setFilter("recent")}>Recent</button>
      <button type="button" aria-pressed={filter === "best"} className={filter === "best" ? "active" : ""} onClick={() => setFilter("best")}>Best PNL</button>
      <button type="button" aria-pressed={filter === "holding"} className={filter === "holding" ? "active" : ""} onClick={() => setFilter("holding")}>Holding</button>
      <span className="scan-result-total">{rows.length} collections</span>
      <button type="button" onClick={() => downloadCsv(shown)} className="scan-results-export"><Download size={16}/> CSV</button>
    </div>
    {partial && <details className="scan-result-method"><summary><Info size={14}/> Estimated results · some history unavailable <span>Details</span></summary>
      <p>{warning || "Fees, mints, transfers and unmatched sales may change realized PnL."}</p></details>}
    {shown.length ? <div className="scan-results-grid">
      {shown.map((row) => <article className="scan-collection-card" key={row.key}>
        <button type="button" className="scan-card-open" onClick={() => { setActiveKey(row.key); }}
          aria-label={"Open " + row.name + " PnL details and sharing"}>
          <div className="scan-collection-heading">
            {row.image
              ? <Image src={row.image} width={66} height={66} alt="" unoptimized className="scan-collection-image"/>
              : <div className="scan-collection-image scan-collection-placeholder"><Images size={24}/></div>}
            <div className="scan-collection-title"><strong>{row.name}</strong><span>● {row.chain.toUpperCase()}</span></div>
            <div className="scan-collection-pnl"><strong className={row.pnl === null ? "unknown" : Number(row.pnl) >= 0 ? "positive" : "negative"}>{formatEth(row.pnl)}</strong>
              <small>ETH PNL · est.</small></div>
          </div>
          <div className="scan-collection-stats">
            <div><span>BOUGHT</span><strong>{row.bought}</strong></div>
            <div><span>SOLD</span><strong>{row.sold}</strong></div>
            <div><span>HOLD</span><strong>{row.held ?? "—"}</strong></div>
          </div>
        </button>
        <button type="button" className="scan-card-share" onClick={() => { setActiveKey(row.key); }}>
          <Share2 size={14}/> PnL card <ArrowUpRight size={13}/>
        </button>
      </article>)}
    </div> : <div className="scan-results-empty"><Info size={20}/><p>{filter === "best" ? "No matched sales to rank in the available data." :
      filter === "holding" ? "No current owned collections returned by OpenSea." : "No supported priced NFT trades found."}</p></div>}

    {selected && <div className="scan-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setActiveKey(null);
    }}>
      <div className="scan-detail-modal studio-modal" role="dialog" aria-modal="true" aria-label={selected.name + " NFT PnL"}>
        <div className="scan-modal-head"><div><span>COLLECTION PERFORMANCE</span><h2>{selected.name}</h2></div>
          <button type="button" aria-label="Close details" className="scan-modal-close" onClick={() => setActiveKey(null)}><X size={20}/></button></div>
        <PnlCardStudio row={selected} wallet={address} partial={partial} onBack={() => setActiveKey(null)}/>
        <div className="scan-modal-transactions"><h3>Recent recorded trades <span>{selected.trades.length}</span></h3>
          {selected.trades.length ? selected.trades.slice(0, 12).map((trade) =>
            <div className="scan-trade" key={trade.id}><div><b>{trade.type.toUpperCase()}</b><span>#{trade.tokenId} · {new Date(trade.date).toLocaleDateString()}</span></div>
              <div>{Number(trade.amountEth).toFixed(4)} ETH {trade.txHash && <a href={chainExplorer[selected.chain] + trade.txHash}
                rel="noopener noreferrer" target="_blank" aria-label="View transaction"><ArrowUpRight size={15}/></a>}</div></div>)
            : <p className="scan-no-trades">No priced sales recorded in the scanned window.</p>}
        </div>
      </div>
    </div>}
  </section>;
}
