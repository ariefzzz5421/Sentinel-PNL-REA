import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  DatabaseZap,
  FileDown,
  Fingerprint,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="landing">
        <div className="hero-grid">
          <section className="hero-copy">
            <div className="eyebrow">
              <span className="signal-dot" /> YOUR ON-CHAIN PERFORMANCE, IN
              FOCUS
            </div>
            <h1>
              Every move
              <br />
              leaves a <em>signal.</em>
            </h1>
            <p className="hero-lead">
              Track every move. Know your edge. Analyze NFT trades with
              transparent cost basis, clean charts, and a shareable performance
              card.
            </p>
            <div className="hero-actions">
              <Link href="/dashboard" className="primary-btn">
                Open workspace <ArrowRight size={18} />
              </Link>
              <Link href="/methodology" className="subtle-link">
                How PnL is calculated <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="hero-note">
              <ShieldCheck size={17} />
              <span>
                No wallet connection. Your imported trades stay in this browser.
              </span>
            </div>
          </section>
          <div className="hero-art" aria-hidden="true">
            <div className="art-grid" />
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="floating-tag tag-top">
              <span className="tag-dot" /> COST BASIS VERIFIED
            </div>
            <div className="floating-card">
              <div className="card-topline">
                <span>SENTINEL / PERFORMANCE</span>
                <span>ILLUSTRATIVE PREVIEW</span>
              </div>
              <div className="card-value-label">Realized PnL</div>
              <div className="card-value">
                +0.480<span> ETH</span>
              </div>
              <div className="card-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="card-footer">
                <span>BUY → SELL</span>
                <span>FEES INCLUDED</span>
              </div>
            </div>
            <div className="floating-tag tag-bottom">
              PRECISION OVER GUESSWORK <ArrowUpRight size={14} />
            </div>
          </div>
        </div>
        <section className="feature-band">
          <div className="section-kicker">THE WORKFLOW</div>
          <div className="feature-grid">
            <article>
              <span className="feature-icon">
                <ScanSearch size={21} />
              </span>
              <span className="feature-index">01 / CAPTURE</span>
              <h3>Bring your trades</h3>
              <p>
                Import a CSV, add an NFT trade manually, or connect a compatible
                data provider later.
              </p>
            </article>
            <article>
              <span className="feature-icon">
                <ChartNoAxesCombined size={21} />
              </span>
              <span className="feature-index">02 / UNDERSTAND</span>
              <h3>See the real result</h3>
              <p>
                Match sales to purchases by token ID. Fees count; missing cost
                basis stays unknown.
              </p>
            </article>
            <article>
              <span className="feature-icon">
                <FileDown size={21} />
              </span>
              <span className="feature-index">03 / SHARE</span>
              <h3>Make it yours</h3>
              <p>
                Filter activity, export your ledger, and save an original PnL
                card as a PNG.
              </p>
            </article>
          </div>
        </section>
        <section className="principle">
          <div>
            <span className="section-kicker">BUILT FOR CLARITY</span>
            <h2>
              Numbers you can
              <br />
              <em>explain.</em>
            </h2>
          </div>
          <div className="principle-list">
            <div>
              <Fingerprint />
              <span>One token. One position. Traceable cost basis.</span>
            </div>
            <div>
              <DatabaseZap />
              <span>
                Provider data is validated before it reaches the dashboard.
              </span>
            </div>
            <div>
              <ShieldCheck />
              <span>Unconfigured live data is clearly marked unavailable.</span>
            </div>
            <Link href="/dashboard">
              Start tracking <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>© 2026 SENTINEL PNL</span>
        <span>
          Independent research implementation · Estimates, not financial advice
        </span>
      </footer>
    </>
  );
}
