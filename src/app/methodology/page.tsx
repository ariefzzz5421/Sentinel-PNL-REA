import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
export default function Methodology() {
  return (
    <>
      <SiteHeader active="method" />
      <main className="doc-page">
        <Link className="back-link" href="/dashboard">
          <ArrowLeft size={16} /> Back to workspace
        </Link>
        <div className="eyebrow">
          <span className="signal-dot" /> METHODOLOGY / V1
        </div>
        <h1>
          Know what the
          <br />
          <em>numbers mean.</em>
        </h1>
        <p className="doc-lead">
          Sentinel PNL currently calculates NFT realized profit in ETH from
          ERC-721 style, one-token trade records. Imported CSV rows and provider
          events use the same validated schema.
        </p>
        <div className="method-grid">
          <article>
            <span>01</span>
            <h2>Cost basis</h2>
            <p>
              A buy or mint creates a position for chain + contract + token ID + wallet.
              Cost basis equals acquisition price plus its transaction fee.
            </p>
          </article>
          <article>
            <span>02</span>
            <h2>Realized PnL</h2>
            <p>
              On sale, proceeds minus sale fee minus the matched position cost
              gives realized PnL. Earlier buys remain available when filtering
              recent sales.
            </p>
          </article>
          <article>
            <span>03</span>
            <h2>Unknowns</h2>
            <p>
              A sale without a matching acquisition has unknown basis. We do not
              treat its proceeds as profit. Open positions have no unrealized
              PnL until a verified market price source exists.
            </p>
          </article>
          <article>
            <span>04</span>
            <h2>Scope</h2>
            <p>
              Only ETH-denominated buy, mint, and sell events are supported.
              Transfers, royalties, ERC-1155 quantities, cross-wallet basis,
              fiat conversion, and tax accounting are outside v1.
            </p>
          </article>
        </div>
        <div className="method-footer">
          Open positions are counted, but no market value is guessed. Results are
          estimates and are not financial or tax advice.
        </div>
      </main>
    </>
  );
}
