"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Download, ImageOff } from "lucide-react";
import { BitcoinPnlCardStudio } from "@/components/bitcoin-pnl-card-studio";
import type { DiscoveryResult, DiscoveryAsset } from "@/lib/nft-discovery";
import type { BitcoinPnl } from "@/lib/bitcoin-pnl";

function AssetCard({ asset }: { asset: DiscoveryAsset }) {
  const [broken, setBroken] = useState(false);
  return <a className="discovery-card" href={asset.url} target="_blank" rel="noopener noreferrer">
    <span className="discovery-artwork">
      {asset.imageUrl && !broken
        ? <Image unoptimized src={asset.imageUrl} alt={asset.name} width={66} height={66} onError={() => setBroken(true)} />
        : <ImageOff size={22} aria-hidden="true"/>}
    </span>
    <span className="discovery-copy">
      <strong title={asset.name}>{asset.name}</strong>
      <small>{asset.collection || (asset.kind === "holding" ? "NFT / Inscription" : "ERC-721 transfer")}</small>
      <span className="discovery-kind">{asset.kind === "holding" ? "Owned" : asset.kind === "received" ? "Received" : "Sent"}</span>
    </span>
    <ArrowUpRight aria-hidden="true" size={15}/>
  </a>;
}
function amount(value: string | null, unit: "BTC" | "%"): string {
  if (value === null) return "Unknown";
  if (unit === "%") return Number(value).toFixed(2) + "%";
  return (value.startsWith("-") ? "" : "+") + value + " BTC";
}
function BitcoinSummary({ pnl, owned, onCreateCard }: { pnl: BitcoinPnl; owned: number; onCreateCard: () => void }) {
  return <div className="btc-ordinal-report">
    <button type="button" className="btc-create-card" onClick={onCreateCard}>
      <Download size={17} aria-hidden="true"/> Create PnL Card <span>Wallet / Collection · PNG</span>
    </button>
    <div className="btc-ordinal-stats">
      <div><span>Realized PnL · verified matches</span><strong>{amount(pnl.realizedBtc, "BTC")}</strong>
        <small>{pnl.matchedSales} matched buy→sell inscriptions · before fees</small></div>
      <div><span>Unrealized PnL · floor estimate</span><strong>{amount(pnl.unrealizedBtc, "BTC")}</strong>
        <small>{pnl.pricedHoldings} / {owned} holdings with verified basis and available floor</small></div>
      <div><span>Realized ROI · verified matches</span><strong>{pnl.roiPct === null ? "Unknown" : amount(String(pnl.roiPct), "%")}</strong>
        <small>{pnl.unknownBasisSales} sales with unknown acquisition basis</small></div>
    </div>
    {pnl.collections.length > 0 && <div className="btc-ordinal-section">
      <h3>Collection PnL <small>Verified subset only</small></h3>
      <div className="btc-ordinal-table" role="table" aria-label="Bitcoin Ordinals collection profit and floor">
        <div className="btc-ordinal-row btc-ordinal-column-head" role="row">
          <span role="columnheader">Collection</span><span role="columnheader">Held</span>
          <span role="columnheader">Floor</span><span role="columnheader">Realized</span>
          <span role="columnheader">Unrealized</span>
        </div>
        {pnl.collections.map(c => <div className="btc-ordinal-row" role="row" key={c.slug}>
          <span role="cell" title={c.slug}>{c.slug}</span><span role="cell">{c.held}</span>
          <span role="cell">{c.floorBtc === null ? "Unknown" : c.floorBtc + " BTC"}</span>
          <span role="cell">{c.realizedBtc === null ? "Unknown" : c.realizedBtc + " BTC"}</span>
          <span role="cell">{c.unrealizedBtc === null ? "Unknown" : c.unrealizedBtc + " BTC"}</span>
        </div>)}
      </div>
    </div>}
    <div className="btc-ordinal-section">
      <h3>Inscription activity <small>Confirmed on-chain transfers · up to 150 shown</small></h3>
      {pnl.trades.length === 0 ? <p className="btc-ordinal-muted">No confirmed inscription transfers in the scanned window.</p> :
      <div className="btc-ordinal-activity">
        {pnl.trades.map(trade => <a href={"https://mempool.space/tx/" + trade.txid}
          target="_blank" rel="noopener noreferrer" key={trade.id}>
          <div><strong>{trade.type === "received" ? "RECEIVED" : trade.type === "sent" ? "SENT" :
            trade.type.toUpperCase()}</strong>
            <span title={trade.inscriptionId}>{trade.inscriptionId.slice(0, 11)}… · {new Date(trade.date).toLocaleDateString()}</span>
          </div>
          <div className="btc-ordinal-trade-price">
            <strong>{trade.priceBtc === null ? "Unknown" : trade.priceBtc + " BTC"}</strong>
            <small>{trade.priceVerified ? "Verified sale price" : "Transfer · price unknown"}
              {trade.realizedBtc !== null ? " · PnL " + trade.realizedBtc + " BTC" : ""}</small>
          </div>
          <ArrowUpRight size={14} aria-hidden="true"/>
        </a>)}
      </div>}
    </div>
  </div>;
}

export function DiscoveryResults({ result }: { result: DiscoveryResult }) {
  const [showBitcoinCard, setShowBitcoinCard] = useState(false);
  if (result.assets.length === 0 && !(result.chain === "bitcoin" && result.bitcoinPnl)) {
    return <div className="discovery-empty-simple" role="status">No NFT Trades Found</div>;
  }
  const gain = result.matchedPnl;
  const pnl = gain ? Number(gain.grossSol) : null;
  return <section className="discovery-results" aria-label="NFT discovery results">
    <div className="discovery-heading">
      <div><span className="discovery-eyebrow">PUBLIC ON-CHAIN DATA</span>
        <h2>{result.chain === "bitcoin" ? "Bitcoin Ordinals" : result.chain === "solana" ? "Solana NFT holdings" : "Ink contract activity"}</h2>
      </div>
      <span className="discovery-counter">{result.assets.length} {result.mode === "holdings" ? "items" : "events"}</span>
    </div>
    {result.chain === "bitcoin" && result.bitcoinPnl &&
      <BitcoinSummary pnl={result.bitcoinPnl} owned={result.assets.length}
        onCreateCard={() => setShowBitcoinCard(true)}/>}
    {result.chain === "solana" ? <div className="discovery-matched-pnl">
      <span>Matched gross SOL PnL</span>
      <strong className={pnl !== null && pnl < 0 ? "negative" : "positive"}>{gain && pnl !== null && Number.isFinite(pnl) ? (pnl > 0 ? "+" : "") + gain.grossSol + " SOL" : "— SOL"}</strong>
      <small>{gain ? `${gain.matchedSales} matched sales · partial history · before fees` : "No verified buy–sell matches found in available history"}</small>
    </div> : null}
    {result.chain === "bitcoin" && <p className="btc-ordinal-disclaimer">{result.note}</p>}
    {result.assets.length > 0 && <>
      {result.chain === "bitcoin" && <h3 className="btc-ordinal-holdings-heading">Owned inscriptions</h3>}
      <div className="discovery-grid">
        {result.assets.map((asset) => <AssetCard asset={asset} key={asset.id}/>)}
      </div>
    </>}
    {result.chain === "bitcoin" && result.bitcoinPnl && showBitcoinCard &&
      <BitcoinPnlCardStudio address={result.address} assets={result.assets}
        report={result.bitcoinPnl} partial={result.partial}
        onBack={() => setShowBitcoinCard(false)}/>}
  </section>;
}