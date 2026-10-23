"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { eventsSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { calculatePnl } from "@/lib/pnl/calculate";

const STORE = "sentinel-pnl-events-v1";
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const amount = (value: string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
const chainNames: Record<Chain, string> = { ethereum: "Ethereum", base: "Base", arbitrum: "Arbitrum", robinhood: "Robinhood" };
type OpenSeaPublicProfile = { address: string; displayName: string | null; username: string | null; ensName: string | null; avatar: string | null; banner: string | null; bio: string | null; verified: boolean };

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
  const [chain, setChain] = useState<Chain | "all">("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [coveragePartial, setCoveragePartial] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [profile, setProfile] = useState<OpenSeaPublicProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setEvents(readLedger());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !authenticated || !address) {
      queueMicrotask(() => setProfile(null));
      return;
    }
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) {
        setProfile(null);
        setProfileStatus("Loading OpenSea public profile…");
      }
    });
    void fetch("/api/opensea/profile?address=" + encodeURIComponent(address))
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data ? String(data.error) : "OpenSea profile unavailable");
        if (!data || typeof data !== "object" || !("profile" in data)) throw new Error("Invalid OpenSea profile response");
        return (data as { profile: OpenSeaPublicProfile | null }).profile;
      }).then((value) => {
        if (!canceled) { setProfile(value); setProfileStatus(value ? "" : "No public OpenSea profile found."); }
      }).catch((error: unknown) => {
        if (!canceled) setProfileStatus(error instanceof Error ? error.message : "OpenSea profile unavailable");
      });
    return () => { canceled = true; };
  }, [ready, authenticated, address]);

  const personal = useMemo(
    () => events.filter((event) => event.wallet.toLowerCase() === address),
    [events, address],
  );
  const summary = useMemo(() => calculatePnl(personal), [personal]);
  const knownSales = summary.sells - summary.unknownBasisSales;
  const hasSnapshot = personal.length > 0 || hasScanned;
  const hasKnownPnl = knownSales > 0;
  const winRate = summary.wins + summary.losses
    ? Math.round((summary.wins / (summary.wins + summary.losses)) * 100)
    : null;
  const recent = useMemo(() => [...personal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [personal]);
  const biggestWins = useMemo(
    () => summary.trades.filter((trade) => trade.type === "sell" && trade.realizedEth !== null && Number(trade.realizedEth) > 0)
      .sort((a, b) => Number(b.realizedEth) - Number(a.realizedEth)).slice(0, 5),
    [summary.trades],
  );

  const scanWallet = useCallback(async (wallet: string, targetChain: Chain | "all") => {
    setBusy(true);
    setNoticeError(false);
    const targets: Chain[] = targetChain === "all" ? ["ethereum", "base", "arbitrum", "robinhood"] : [targetChain];
    setNotice("Scanning public NFT trades on " + targets.map((name) => chainNames[name]).join(", ") + "…");
    try {
      // A failure on one chain does not discard verified data from other chains.
      const responses = await Promise.all(targets.map(async (selectedChain) => {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: wallet, chain: selectedChain, mode: "wallet" }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "Scan failed";
          throw new Error(chainNames[selectedChain] + ": " + message);
        }
        if (!payload || typeof payload !== "object" || !("events" in payload)) throw new Error("Invalid provider response");
        const data = payload as { events: unknown; partial?: boolean; warning?: string };
        return { chain: selectedChain, events: eventsSchema.parse(data.events), partial: Boolean(data.partial), warning: data.warning };
      }).map((task) => task.then((data) => ({ ok: true as const, data }), (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Scan failed" }))));

      const successes = responses.filter((result): result is Extract<(typeof responses)[number], { ok: true }> => result.ok);
      const failures = responses.filter((result): result is Extract<(typeof responses)[number], { ok: false }> => !result.ok).map((result) => result.error);
      if (!successes.length) throw new Error(failures[0] || "No scan provider available.");

      const merged = new Map(readLedger().map((event) => [event.id, event]));
      for (const result of successes) for (const event of result.data.events) merged.set(event.id, event);
      if (merged.size > 10_000) throw new Error("Local ledger limit reached. Export CSV first.");
      const next = [...merged.values()];
      localStorage.setItem(STORE, JSON.stringify(next));
      setEvents(next);
      setHasScanned(true);
      setCoveragePartial(Boolean(failures.length || successes.some((result) => result.data.partial)));
      const count = successes.reduce((total, result) => total + result.data.events.length, 0);
      setNotice(count + " supported NFT event(s) loaded across " + successes.length + " network(s). " +
        successes.map((result) => result.data.warning || "").filter(Boolean).join(" ") + " " + failures.join(" "));
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
    const key = `sentinel-profile-autoscan-v2:${chain}:${address}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) void scanWallet(address, chain);
    });
    return () => { canceled = true; };
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
    <section className="profile-hero personal-profile-hero" style={profile?.banner ? { backgroundImage: 'linear-gradient(90deg,rgba(17,13,29,.95),rgba(17,13,29,.72)),url("' + profile.banner + '")', backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      <div className="personal-hero-top">
        <div>
          <p className="profile-eyebrow"><ShieldCheck size={14}/> CONNECTED WALLET · OPENSEA PROFILE</p>
          <div className="personal-identity">
            {profile?.avatar
              ? <Image src={profile.avatar} width={66} height={66} unoptimized alt="OpenSea public avatar" className="personal-avatar"/>
              : <div className="personal-avatar personal-avatar-placeholder"><Wallet size={26}/></div>}
            <div><h1>{profile?.displayName || "Your NFT performance."} {profile?.verified && <span className="personal-verified" title="Verified on OpenSea">✓</span>}</h1>
              <p>{profile?.ensName || profile?.username || (address ? short(address) : "")}</p>
            </div>
          </div>
          {profile?.bio ? <p className="personal-bio">{profile.bio}</p> : <p>Personal NFT performance. Historical realized PnL is estimated when fees are unavailable.</p>}
          {profileStatus && <p className="personal-profile-status">{profileStatus}</p>}
        </div>
        {address && <Link className="personal-explorer" href="/">Scan another wallet <ArrowRight size={15}/></Link>}
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
            <option value="all">All supported networks</option><option value="ethereum">Ethereum</option><option value="base">Base</option><option value="arbitrum">Arbitrum</option><option value="robinhood">Robinhood</option>
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
          <section><span>Purchases (supported)</span><strong>{hasSnapshot ? summary.buys : "—"}</strong><small>Supported NFT acquisitions</small></section>
          <section><span>Sales</span><strong>{hasSnapshot ? summary.sells : "—"}</strong><small>Recorded sale events</small></section>
          <section><span>Open positions</span><strong>{hasSnapshot ? summary.openPositions : "—"}</strong><small>Based on matched ledger events</small></section>
          <section><span>Win rate</span><strong>{winRate === null ? "—" : `${winRate}%`}</strong><small>Only matched profitable/loss-making sales</small></section>
        </div>
      </div>

      <div className="personal-panels">
        <section className="profile-panel personal-section personal-biggest">
          <div className="personal-section-head"><div><span className="personal-kicker">TOP PERFORMERS</span><h2>Biggest realized NFT PnL</h2></div></div>
          {biggestWins.length ? <div className="personal-collection-list">
            {biggestWins.map((trade) => <div className="personal-collection-row" key={trade.id}>
              <div><strong>{trade.collection} #{trade.tokenId}</strong><small>{chainNames[trade.chain]} · Sold {new Date(trade.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div>
              <div className="personal-collection-result"><strong className="personal-profit">+{amount(trade.realizedEth || "0")} ETH</strong><small>{trade.note || "Matched buy → sell"}</small></div>
            </div>)}
          </div> : <p className="personal-empty">No profitable matched buy → sell pairs in the available history. Unknown cost basis is never reported as profit.</p>}
        </section>
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
          <div className="personal-section-head"><div><span className="personal-kicker">ACTIVITY</span><h2>Latest NFT trades</h2></div></div>
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
