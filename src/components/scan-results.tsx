"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Download, Images, Info, Share2, X, Copy, Check } from "lucide-react";
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
function drawCard(canvas: HTMLCanvasElement, row: CollectionRow, wallet: string, partial: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas graphics are unavailable.");
  canvas.width = 1200; canvas.height = 630;
  const backdrop = ctx.createLinearGradient(0, 0, 1200, 630);
  backdrop.addColorStop(0, "#100f21"); backdrop.addColorStop(1, "#29173f");
  ctx.fillStyle = backdrop; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "#554179"; ctx.lineWidth = 3; ctx.strokeRect(30, 30, 1140, 570);
  ctx.fillStyle = "#b99cff"; ctx.font = "bold 30px Arial"; ctx.fillText("◈  SENTINEL PNL", 78, 110);
  ctx.fillStyle = "#a9a1c4"; ctx.font = "24px Arial"; ctx.fillText(row.chain.toUpperCase() + " · NFT PERFORMANCE", 79, 165);
  ctx.fillStyle = "#f8f5ff"; ctx.font = "bold 54px Arial";
  const name = row.name.length > 29 ? row.name.slice(0, 28) + "…" : row.name;
  ctx.fillText(name, 75, 270);
  ctx.fillStyle = row.pnl === null ? "#afa6c7" : Number(row.pnl) >= 0 ? "#3ee0ae" : "#ff8d9f";
  ctx.font = "bold 80px Arial"; ctx.fillText(formatEth(row.pnl) + " ETH", 75, 382);
  ctx.font = "22px Arial"; ctx.fillStyle = "#ac9fce";
  ctx.fillText("ESTIMATED REALIZED PNL" + (partial ? " · PARTIAL HISTORY" : ""), 80, 425);
  ctx.fillStyle = "#ede8ff"; ctx.font = "bold 30px Arial";
  ctx.fillText("BOUGHT   " + row.bought, 78, 510);
  ctx.fillText("SOLD   " + row.sold, 420, 510);
  ctx.fillText("HOLD   " + (row.held ?? "—"), 720, 510);
  ctx.font = "19px Arial"; ctx.fillStyle = "#9c91b5";
  const address = wallet && wallet !== "multiple wallets" ? wallet.slice(0, 8) + "…" + wallet.slice(-6) : "Multiple wallets";
  ctx.fillText(address + "  ·  Missing history, fees or cost basis may change results.", 78, 562);
}
async function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Cannot export PNG.")), "image/png");
  });
}

export function ScanResults({
  events, holdings, holdingsComplete, partial, warning, address,
}: { events: TradeEvent[]; holdings: PublicHolding[]; holdingsComplete: boolean; partial: boolean; warning: string; address: string | null }) {
  const [filter, setFilter] = useState<Filter>("recent");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  async function saveOrShare(share: boolean) {
    if (!selected || !canvasRef.current) return;
    setSharing(true);
    try {
      drawCard(canvasRef.current, selected, address || "multiple wallets", partial);
      const blob = await pngBlob(canvasRef.current);
      const file = new File([blob], "sentinel-pnl-card.png", { type: "image/png" });
      if (share && typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sentinel PNL — " + selected.name });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = file.name;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        window.alert(error instanceof Error ? error.message : "Could not export PnL image.");
      }
    } finally { setSharing(false); }
  }
  async function copyAddress() {
    if (!selected?.contract) return;
    try {
      await navigator.clipboard.writeText(selected.contract);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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
        <button type="button" className="scan-card-open" onClick={() => { setActiveKey(row.key); setCopied(false); }}
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
        <button type="button" className="scan-card-share" onClick={() => { setActiveKey(row.key); setCopied(false); }}>
          <Share2 size={14}/> PnL card <ArrowUpRight size={13}/>
        </button>
      </article>)}
    </div> : <div className="scan-results-empty"><Info size={20}/><p>{filter === "best" ? "No matched sales to rank in the available data." :
      filter === "holding" ? "No current owned collections returned by OpenSea." : "No supported priced NFT trades found."}</p></div>}

    {selected && <div className="scan-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setActiveKey(null);
    }}>
      <div className="scan-detail-modal" role="dialog" aria-modal="true" aria-label={selected.name + " NFT PnL"} >
        <div className="scan-modal-head"><div><span>COLLECTION PERFORMANCE</span><h2>{selected.name}</h2></div>
          <button type="button" aria-label="Close details" className="scan-modal-close" onClick={() => setActiveKey(null)}><X size={20}/></button></div>
        <div className="scan-pnl-poster">
          <div className="scan-poster-brand">◈ SENTINEL PNL <span>{selected.chain.toUpperCase()}</span></div>
          <p>{selected.name}</p>
          <strong className={selected.pnl === null ? "unknown" : Number(selected.pnl) >= 0 ? "positive" : "negative"}>{formatEth(selected.pnl)} ETH</strong>
          <small>ESTIMATED REALIZED PNL {partial ? "· PARTIAL HISTORY" : ""}</small>
          <div className="scan-poster-stats"><div>BOUGHT <b>{selected.bought}</b></div><div>SOLD <b>{selected.sold}</b></div><div>HOLD <b>{selected.held ?? "—"}</b></div></div>
        </div>
        <div className="scan-modal-actions">
          <button type="button" disabled={sharing} onClick={() => void saveOrShare(true)}><Share2 size={16}/> {sharing ? "Creating…" : "Share PNG"}</button>
          <button type="button" disabled={sharing} onClick={() => void saveOrShare(false)}><Download size={16}/> Download</button>
          <button type="button" disabled={!selected.contract} onClick={() => void copyAddress()}>{copied ? <Check size={16}/> : <Copy size={16}/>} Contract</button>
        </div>
        <div className="scan-modal-transactions"><h3>Recent recorded trades <span>{selected.trades.length}</span></h3>
          {selected.trades.length ? selected.trades.slice(0, 12).map((trade) =>
            <div className="scan-trade" key={trade.id}><div><b>{trade.type.toUpperCase()}</b><span>#{trade.tokenId} · {new Date(trade.date).toLocaleDateString()}</span></div>
              <div>{Number(trade.amountEth).toFixed(4)} ETH {trade.txHash && <a href={chainExplorer[selected.chain] + trade.txHash}
                rel="noopener noreferrer" target="_blank" aria-label="View transaction"><ArrowUpRight size={15}/></a>}</div></div>)
            : <p className="scan-no-trades">No priced sales recorded in the scanned window.</p>}
        </div>
        <p className="scan-modal-disclaimer">PnL excludes unavailable cost basis, gas, and some payment currencies. It is an estimate, not tax reporting.</p>
        <canvas ref={canvasRef} className="visually-hidden" aria-hidden="true"/>
      </div>
    </div>}
  </section>;
}
