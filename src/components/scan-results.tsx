"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { rankCollectionsByRealizedPnl } from "@/lib/collection-pnl-ranking";
import { ArrowUpRight, Download, Images, Info, Share2, X } from "lucide-react";
import { PnlCardStudio, studioFontFamilies, type FontChoice } from "@/components/pnl-card-studio";
import { calculatePnl, type CalculatedTrade } from "@/lib/pnl/calculate";
import type { Chain, TradeEvent } from "@/lib/schema";
import type { AutoEvmChain, AutoScanNetworkStatus } from "@/lib/automatic-scan";
import { scanChainById } from "@/lib/scan-chains";
import { filterNetworkItems } from "@/lib/network-filter";
import type { DiscoveryResult } from "@/lib/nft-discovery";
import { groupIndexedEvmCollections } from "@/lib/indexed-evm-collections";
import { IndexedEvmCollectionCards } from "@/components/indexed-evm-collection-cards";
import { parseEthUsdSpot, formatEthPnlUsd, type EthUsdSpot } from "@/lib/eth-usd-spot";
import { WalletOverallCard } from "@/components/wallet-overall-card";

export type PublicHolding = {
  name: string; slug: string; imageUrl: string | null;
  held: number | null; chain: string; contract: string;
};
type Filter = "recent" | "best" | "worst" | "holding";
type CollectionRow = {
  key: string; name: string; chain: Chain; contract: string;
  image: string | null; bought: number; sold: number; minted: number; transfersIn: number; held: number | null;
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
    const matched = summary.trades.filter(trade =>
      trade.type === "sell" && trade.realizedEth !== null).length;
    const latest = eventsForCollection.reduce((max, event) => event.date > max ? event.date : max, "");
    rows.push({
      key, name: holding?.name || first?.collection || key,
      chain: (first?.chain || holding?.chain || "ethereum") as Chain,
      contract: first?.contract || holding?.contract || "",
      image: safeImage(holding?.imageUrl || first?.imageUrl),
      bought: summary.buys, sold: summary.sells, minted: summary.mints, transfersIn: summary.transfersIn, held: holding ? holding.held : holdingsComplete ? 0 : null,
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
  events, holdings, holdingsComplete, partial, address, networkStatuses = [], selectedChain = null, onChainSelect, unpricedDiscoveries = [],
}: { events: TradeEvent[]; holdings: PublicHolding[]; holdingsComplete: boolean; partial: boolean; address: string | null;
  networkStatuses?: AutoScanNetworkStatus[];
  selectedChain?: AutoEvmChain | null;
  onChainSelect?: (next: AutoEvmChain | null) => void;
  unpricedDiscoveries?: DiscoveryResult[] }) {
  const [filter, setFilter] = useState<Filter>("recent");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [cardFont, setCardFont] = useState<FontChoice>("oswald");
  const [ethUsdSpot, setEthUsdSpot] = useState<EthUsdSpot | null>(null);
  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        const response = await fetch("/api/market/eth-usd", { cache: "no-store" });
        if (!response.ok) throw new Error("ETH/USD feed unavailable.");
        const spot = parseEthUsdSpot(await response.json());
        if (!spot) throw new Error("ETH/USD quote is stale or malformed.");
        if (active) setEthUsdSpot(spot);
      } catch {
        if (active) setEthUsdSpot(null);
      }
    };
    void update();
    const interval = window.setInterval(() => void update(), 90_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const unpricedChain = selectedChain === "arc" || selectedChain === "ink";
  const indexedCollections = useMemo(() => groupIndexedEvmCollections(
    filterNetworkItems(unpricedDiscoveries, selectedChain)),
    [unpricedDiscoveries, selectedChain]);
  const selectedIndexerFailed = networkStatuses.some(item => item.chain === selectedChain &&
    item.failed > 0 && item.checked === 0);
  const rows = useMemo(() => collectionRows(
    filterNetworkItems(events, selectedChain).filter(event =>
      address === null || event.wallet.toLowerCase() === address.toLowerCase()),
    filterNetworkItems(holdings, selectedChain), holdingsComplete),
    [events, holdings, holdingsComplete, address, selectedChain]);
  const shown = useMemo(() => {
    if (filter === "holding") return rows.filter((row) => row.held !== null && row.held > 0)
      .sort((a, b) => (b.held || 0) - (a.held || 0));
    if (filter === "best" || filter === "worst")
      return rankCollectionsByRealizedPnl(rows, filter);
    return [...rows].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [filter, rows]);
  const selected = rows.find((row) => row.key === activeKey) || null;
  const indexedShown = (filter === "best" || filter === "worst") && !unpricedChain ? [] :
    filter === "holding" && !unpricedChain
      ? indexedCollections.filter(row => row.owned > 0) : indexedCollections;

  useEffect(() => {
    if (!activeKey) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveKey(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeKey]);

  return <section className="scan-results" aria-label={partial ? "NFT collection scan results; history may be incomplete" : "NFT collection scan results"}>
    <WalletOverallCard events={events} wallet={address} partial={partial} spot={ethUsdSpot}/>
    {networkStatuses.length > 0 && <div className="scan-network-status" role="group" aria-label="Filter results by EVM network">
      <button type="button" className={"scan-network-filter-all" + (selectedChain === null ? " active" : "")}
        aria-pressed={selectedChain === null} onClick={() => { setActiveKey(null); setFilter("recent"); onChainSelect?.(null); }}>
        All Chains
      </button>
      {networkStatuses.map(item => <button key={item.chain} type="button"
        className={(item.failed ? item.checked ? "partial" : "failed" : "checked") +
          (selectedChain === item.chain ? " active" : "")}
        aria-pressed={selectedChain === item.chain}
        aria-label={"Show " + scanChainById(item.chain).label + " NFT events"}
        title={item.checked + " successful, " + item.failed + " failed wallet requests; " +
          (item.coverage === "unpriced-transfers" ? "indexed on-chain NFT transfers; PnL unavailable" : "indexed marketplace NFT trades")}
        onClick={() => { setActiveKey(null); setFilter("recent"); onChainSelect?.(selectedChain === item.chain ? null : item.chain); }}>
        <Image src={scanChainById(item.chain).icon} width={19} height={19} alt=""
          aria-hidden="true" className="scan-network-chain-icon"/>
        <span className="scan-network-label">{scanChainById(item.chain).label}</span>
        <small>{item.failed > 0 && item.checked === 0 ? "—" : item.eventCount} events</small>
      </button>)}
    </div>}
    {!unpricedChain && <>
    <div className="scan-result-tabs" role="group" aria-label="NFT collection filters">
      <button type="button" aria-pressed={filter === "recent"} className={filter === "recent" ? "active" : ""} onClick={() => setFilter("recent")}>Recent</button>
      <button type="button" aria-pressed={filter === "best"} className={filter === "best" ? "active" : ""} onClick={() => setFilter("best")}>Best PNL</button>
      <button type="button" aria-pressed={filter === "worst"} className={filter === "worst" ? "active" : ""} onClick={() => setFilter("worst")}>Worst PNL</button>
      <button type="button" aria-pressed={filter === "holding"} className={filter === "holding" ? "active" : ""} onClick={() => setFilter("holding")}>Holding</button>
      <span className="scan-result-total">{rows.length + indexedCollections.length} collections</span>
      <button type="button" onClick={() => downloadCsv(shown)} className="scan-results-export"><Download size={16}/> CSV</button>
    </div>
    {shown.length ? <div className="scan-results-grid">
      {shown.map((row) => <article className="scan-collection-card" key={row.key}>
        <button type="button" className="scan-card-open" onClick={() => { setActiveKey(row.key); setCardFont("oswald"); }}
          aria-label={"Open " + row.name + " PnL details and sharing"}>
          <div className="scan-collection-heading">
            {row.image
              ? <Image src={row.image} width={66} height={66} alt="" unoptimized className="scan-collection-image"/>
              : <div className="scan-collection-image scan-collection-placeholder"><Images size={24}/></div>}
            <div className="scan-collection-title"><strong>{row.name}</strong><span className="scan-collection-chain"><Image src={scanChainById(row.chain).icon} width={17} height={17} alt="" aria-hidden="true"/>{row.chain.toUpperCase()}</span></div>
            <div className="scan-collection-pnl" title={ethUsdSpot
              ? "USD converted at current CoinGecko ETH spot (" + ethUsdSpot.updatedAt + "), not the historical trade rate."
              : "Live ETH/USD rate unavailable; no USD value inferred."}>
              <strong className={row.pnl === null ? "unknown" : Number(row.pnl) >= 0 ? "positive" : "negative"}>
                <span className="scan-pnl-native">{formatEth(row.pnl)}</span>
                {row.pnl !== null && <span className="scan-pnl-usd">
                  {"(" + (formatEthPnlUsd(row.pnl, ethUsdSpot) ?? "—") + ")"}
                </span>}
              </strong>
              <small>ETH PNL</small>
            </div>
          </div>
          <div className="scan-collection-stats">
            <div><span>BOUGHT</span><strong>{row.bought}</strong></div>
            <div><span>SOLD</span><strong>{row.sold}</strong></div>
            <div><span>HOLD</span><strong>{row.held ?? "—"}</strong></div>
          </div>
        </button>
        <button type="button" className="scan-card-share" onClick={() => { setActiveKey(row.key); setCardFont("oswald"); }}>
          <Share2 size={14}/> PnL card <ArrowUpRight size={13}/>
        </button>
      </article>)}
    </div> : indexedShown.length === 0 && <div className="scan-results-empty"><Info size={20}/><p>{filter === "best" ? "No matched sales to rank in the available data." :
      filter === "worst" ? "No verified negative realized PnL found in the available matched sales." :
      filter === "holding" ? "No current owned collections returned by OpenSea." : "No supported priced NFT trades found."}</p></div>}
    </>}
    <IndexedEvmCollectionCards rows={indexedShown}/>
    {unpricedChain && indexedShown.length === 0 &&
      <div className="scan-results-empty" role="status">
        {selectedIndexerFailed ? "Indexer unavailable" : "Not Found"}
        <p>{selectedIndexerFailed
          ? "The network indexer could not complete this scan."
          : "No indexed NFT holdings or transfers found in the available scan window."}</p>
      </div>}

    {selected && <div className="scan-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setActiveKey(null);
    }}>
      <div className="scan-detail-modal studio-modal" role="dialog" aria-modal="true" aria-label={selected.name + " NFT PnL"}>
        <div className="scan-modal-head"><div><span>COLLECTION</span><h2 style={{ fontFamily: studioFontFamilies[cardFont] }}>{selected.name}</h2></div>
          <button type="button" aria-label="Close details" className="scan-modal-close" onClick={() => setActiveKey(null)}><X size={20}/></button></div>
        <PnlCardStudio row={selected} wallet={address} partial={partial} onBack={() => setActiveKey(null)} onFontChange={setCardFont}/>
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
