"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, ImageOff } from "lucide-react";
import type { DiscoveryResult, DiscoveryAsset } from "@/lib/nft-discovery";

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


export function DiscoveryResults({ result }: { result: DiscoveryResult }) {
  if (result.assets.length === 0) {
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
    {gain && pnl !== null && Number.isFinite(pnl) ? <div className="discovery-matched-pnl">
      <span>Matched gross SOL PnL</span>
      <strong className={pnl < 0 ? "negative" : "positive"}>{pnl > 0 ? "+" : ""}{gain.grossSol} SOL</strong>
      <small>{gain.matchedSales} matched sale{gain.matchedSales === 1 ? "" : "s"} · partial history · before fees</small>
    </div> : null}
    <div className="discovery-grid">
      {result.assets.map((asset) => <AssetCard asset={asset} key={asset.id}/>)}
    </div>
  </section>;
}
