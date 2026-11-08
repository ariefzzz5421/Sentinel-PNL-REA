"use client";
import Image from "next/image";
import { ArrowUpRight, Images } from "lucide-react";
import type { IndexedEvmCollection } from "@/lib/indexed-evm-collections";
import { scanChainById } from "@/lib/scan-chains";

/** Same collection card layout as priced EVMs, with strictly unpriced transfer fields. */
export function IndexedEvmCollectionCards({ rows }: { rows: IndexedEvmCollection[] }) {
  if (!rows.length) return null;
  return <div className="scan-results-grid indexed-collection-grid" aria-label="Arc and Ink indexed NFT collections">
    {rows.map(row => <article className="scan-collection-card scan-collection-unpriced" key={row.key}>
      <a className="scan-card-open" href={row.link} target="_blank" rel="noopener noreferrer"
        aria-label={"View " + row.name + " on " + scanChainById(row.chain).label + " explorer"}>
        <div className="scan-collection-heading">
          {row.imageUrl
            ? <Image unoptimized src={row.imageUrl} width={66} height={66} alt="" className="scan-collection-image"/>
            : <div className="scan-collection-image scan-collection-placeholder"><Images size={24}/></div>}
          <div className="scan-collection-title">
            <strong title={row.name}>{row.name}</strong>
            <span className="scan-collection-chain">
              <Image src={scanChainById(row.chain).icon} width={17} height={17} alt="" aria-hidden="true"/>
              {row.chain.toUpperCase()}
            </span>
          </div>
          <div className="scan-collection-pnl">
            <strong className="unknown">Unknown</strong>
            <small>{row.chain === "arc" ? "USDC PNL" : "ETH PNL"}</small>
          </div>
        </div>
        <div className="scan-collection-stats">
          <div><span>RECEIVED</span><strong>{row.received}</strong></div>
          <div><span>SENT</span><strong>{row.sent}</strong></div>
          <div><span>OWNED</span><strong>{row.owned}</strong></div>
        </div>
      </a>
      <a className="scan-card-share" href={row.link} target="_blank" rel="noopener noreferrer">
        Indexed activity · Price unknown <ArrowUpRight size={14} aria-hidden="true"/>
      </a>
    </article>)}
  </div>;
}
