"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { eventsSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { calculatePnl } from "@/lib/pnl/calculate";

const STORE = "sentinel-pnl-events-v1";
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const amount = (value: string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
const chainNames: Record<Chain, string> = { ethereum: "Ethereum", base: "Base", arbitrum: "Arbitrum" };

function readLedger(): TradeEvent[] {
  try {
    const result = eventsSchema.safeParse(JSON.parse(localStorage.getItem(STORE) || "[]"));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export default function ActiveProfile() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const addresses = useMemo(
    () => [...new Set(wallets.filter((w) => /^0x[a-f\d]{40}$/i.test(w.address)).map((w) => w.address.toLowerCase()))],
    [wallets],
  );
  const [selected, setSelected] = useState("");
  const address = addresses.includes(selected) ? selected : addresses[0];
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [chain, setChain] = useState<Chain>("ethereum");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [coveragePartial, setCoveragePartial] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    setEvents(readLedger());
    setHydrated(true);
  }, []);

  const personal = useMemo(
    () => events.filter((event) => event.wallet.toLowerCase() === address),
    [events, address],
  );
  const summary = useMemo(() => calculatePnl(personal), [personal]);
  const knownSales = summary.sells - summary.unknownBasisSales;
  const hasKnownPnl = knownSales > 0;
  const winRate = summary.wins + summary.losses
    ? Math.round((summary.wins / (summary.wins + summary.losses)) * 100)
    : null;
  const recent = useMemo(() => [...personal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [personal]);

  const scanWallet = useCallback(async (wallet: string, targetChain: Chain) => {
    setBusy(true);
    setNoticeError(false);
    setNotice(`Scanning ${short(wallet)} on ${chainNames[targetChain]}…`);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet, chain: targetChain, mode: "wallet" }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error) : "Live NFT scan failed.";
        throw new Error(error);
      }
      if (!payload || typeof payload !== "object" || !("events" in payload)) {
        throw new Error("Provider returned an invalid scan response.");
      }
      const incoming = eventsSchema.parse(payload.events);
      const metadata = payload as { partial?: boolean; warning?: string };
      const merged = new Map(readLedger().map((event) => [event.id, event]));
      for (const event of incoming) merged.set(event.id, event);
      if (merged.size > 10_000) throw new Error("Ledger limit reached. Export a CSV from the workspace first.");
      const next = [...merged.values()];
      localStorage.setItem(STORE, JSON.stringify(next));
      setEvents(next);
      setHasScanned(true);
      setCoveragePartial(Boolean(metadata.partial));
      setNotice(
        `${incoming.length} supported NFT event(s) loaded from ${chainNames[targetChain]}.${metadata.partial ? " History may be incomplete." : ""}${metadata.warning ? ` ${metadata.warning}` : ""}`,
      );
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? error.message : "Unable to scan NFT history.");
    } finally {
      setBusy(false);
    }
  }, []);

  // One scan per wallet/chain per browser session after login; manual refresh is always available.
  useEffect(() => {
    if (!ready || !authenticated || !hydrated || !address) return;
    const key = `sentinel-profile-autoscan-v1:${chain}:${address}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    void scanWallet(address, chain);
  }, [ready, authenticated, hydrated, address, chain, scanWallet]);

  if (!ready || !hydrated) {
    return <main className="profile-page"><p className="profile-status">Loading your wallet dashboard…</p></main>;
  }
  if (!authenticated) {
    return <main className="profile-page">
      <section className="profile-hero personal-profile-hero">
        <p className="profile-eyebrow">SENTINEL · NFT PERFORMANCE</p>
        <h1>Your NFT PnL, one page.</h1>
        <p>Connect an EVM wallet to view PnL for that address only. No transaction signing or private key access required.</p>
        <button type="button" className="wallet-connect-button" onClick={login}><Wallet size={17}/> Connect Wallet</button>
      </section>
    </main>;
  }

  return <main className="profile-page personal-dashboard">
    <section className="profile-hero personal-profile-hero">
      <div className="personal-hero-top">
        <div>
          <p className="profile-eyebrow"><ShieldCheck size={14}/> CONNECTED WALLET · PERSONAL DASHBOARD</p>
          <h1>Your NFT performance.</h1>
          <p>Estimated realized PnL for the connected address. Only supported priced NFT events are included.</p>
        </div>
        {address && <a className="personal-explorer" target="_blank" rel="noopener noreferrer" href={`https://etherscan.io/address/${address}`}>View address <ArrowUpRight size={15}/></a>}
      </div>
      {addresses.length ? <div className="profile-wallets" role="group" aria-label="Your connected wallets">
        {addresses.map((item) => <button key={item} type="button" className={item === address ? "active" : ""}
          aria-pressed={item === address} onClick={() => { setSelected(item); setNotice(""); setHasScanned(false); setCoveragePartial(false); }}>{short(item)}</button>)}
      </div> : <p className="personal-empty">No EVM wallet is linked. Connect an EVM wallet in Privy to get started.</p>}
    </section>

    {address && <>
      <div className="personal-toolbar">
        <span className="personal-toolbar-label"><span className="personal-dot"/> {hasScanned ? "Latest scan completed" : "Public on-chain activity"}</span>
        <div className="profile-scan-actions">
          <select aria-label="Scan blockchain" value={chain} disabled={busy} onChange={(event) => { setChain(event.target.value as Chain); setNotice(""); setHasScanned(false); }}>
            <option value="ethereum">Ethereum</option><option value="base">Base</option><option value="arbitrum">Arbitrum</option>
          </select>
          <button type="button" disabled={busy} onClick={() => void scanWallet(address, chain)}>
            <RefreshCw size={15} className={busy ? "personal-spin" : ""}/> {busy ? "Scanning…" : "Refresh PnL"}
          </button>
        </div>
      </div>

      {notice && <div className={`profile-notice ${noticeError ? "personal-error" : "personal-info"}`} role={noticeError ? "alert" : "status"}>{notice}</div>}
      {coveragePartial && <p className="personal-disclaimer">Partial scan coverage: missing events can affect cost basis and estimated PnL.</p>}

      <div className="personal-overview">
        <section className="personal-pnl-hero" aria-label="Realized profit and loss">
          <span className="personal-stat-label">REALIZED NFT PNL</span>
          <strong className={hasKnownPnl ? (Number(summary.realizedEth) >= 0 ? "personal-profit" : "personal-loss") : ""}>
            {hasKnownPnl ? `${Number(summary.realizedEth) > 0 ? "+" : ""}${amount(summary.realizedEth)} ETH` : "—"}
          </strong>
          <p>{hasKnownPnl ? `${knownSales} sale(s) with known cost basis` : "No matched NFT buy → sell pair available yet."}</p>
          <span className="personal-pnl-meta">{summary.unknownBasisSales} sale(s) with unknown cost basis · {summary.estimatedSales} sale(s) with estimated fees</span>
        </section>
        <div className="personal-stat-grid">
          <section><span>Purchases + mints</span><strong>{summary.buys}</strong><small>Supported NFT acquisitions</small></section>
          <section><span>Sales</span><strong>{summary.sells}</strong><small>Recorded sale events</small></section>
          <section><span>Open positions</span><strong>{summary.openPositions}</strong><small>Based on matched ledger events</small></section>
          <section><span>Win rate</span><strong>{winRate === null ? "—" : `${winRate}%`}</strong><small>Only matched profitable/loss-making sales</small></section>
        </div>
      </div>

      <div className="personal-panels">
        <section className="profile-panel personal-section personal-collections">
          <div className="personal-section-head"><div><span className="personal-kicker">BREAKDOWN</span><h2>Collection PnL</h2></div></div>
          {summary.collections.length ? <div className="personal-collection-list">
            {summary.collections.slice(0, 7).map((collection, index) =>
              <div className="personal-collection-row" key={`${collection.name}:${index}`}>
                <div><strong>{collection.name}</strong><small>{collection.buys} buys · {collection.sells} sales</small></div>
                <div className="personal-collection-result">
                  <strong className={Number(collection.realizedEth) >= 0 ? "personal-profit" : "personal-loss"}>{Number(collection.realizedEth) > 0 ? "+" : ""}{amount(collection.realizedEth)} ETH</strong>
                  {collection.unknownBasisSales > 0 && <small>{collection.unknownBasisSales} unknown-basis sale(s)</small>}
                </div>
              </div>)}
          </div> : <p className="personal-empty">No collection PnL yet. Refresh the scan or import NFT trade history.</p>}
        </section>

        <section className="profile-panel personal-section personal-activity">
          <div className="personal-section-head"><div><span className="personal-kicker">ACTIVITY</span><h2>Recent NFT trades</h2></div></div>
          {recent.length ? <div className="personal-trade-list">
            {recent.map((event) => <div key={event.id} className="personal-trade-row">
              <span className={`personal-trade-badge ${event.type}`}>{event.type.toUpperCase()}</span>
              <div><strong>{event.collection} #{event.tokenId}</strong><small>{chainNames[event.chain]} · {new Date(event.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</small></div>
              <strong>{amount(event.amountEth)} ETH</strong>
            </div>)}
          </div> : <p className="personal-empty">No supported trades recorded for this wallet yet.</p>}
        </section>
      </div>

      <div className="personal-footer">
        <span>Read-only wallet connection. Wallet ownership does not guarantee complete transaction history; displayed amounts are estimates, not tax figures.</span>
        <Link href="/dashboard">Import CSV / advanced ledger <ArrowRight size={14}/></Link>
      </div>
    </>}
  </main>;
}
