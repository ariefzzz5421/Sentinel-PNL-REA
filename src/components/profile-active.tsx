"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { eventsSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { calculatePnl } from "@/lib/pnl/calculate";
import { MarketTape } from "@/components/market-tape";
import { ProfileNftThumb } from "@/components/profile-nft-thumb";

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
  const [spotEthUsd, setSpotEthUsd] = useState<number | null>(null);
  const [holdingArt, setHoldingArt] = useState<Map<string, string>>(new Map());
  const [coverageNotes, setCoverageNotes] = useState<string[]>([]);

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


  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/market/eth-usd", { cache: "no-store" });
        if (!response.ok) throw new Error("Spot FX feed unavailable");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || !("usd" in value) || !("updatedAt" in value)) throw new Error("Invalid FX quote");
        const quote = (value as { usd: unknown }).usd;
        const updatedAt = (value as { updatedAt: unknown }).updatedAt;
        if (typeof quote !== "number" || !Number.isFinite(quote) || quote <= 0 ||
            typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt)) ||
            Math.abs(Date.now() - Date.parse(updatedAt)) > 10 * 60_000) throw new Error("Stale FX quote");
        if (active) setSpotEthUsd(quote);
      } catch { if (active) setSpotEthUsd(null); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 90_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  // Holdings artwork augments transaction media, especially when a trade event omits NFT metadata.
  useEffect(() => {
    if (!authenticated || !address) return;
    let canceled = false;
    void fetch("/api/opensea/holdings?address=" + encodeURIComponent(address))
      .then(async (response) => {
        if (!response.ok) throw new Error("Holdings artwork unavailable");
        return response.json() as Promise<{ holdings?: Array<{ chain: string; contract: string; imageUrl: string | null }> }>;
      })
      .then((value) => {
        if (canceled) return;
        const next = new Map<string, string>();
        for (const holding of value.holdings || []) {
          if (holding.imageUrl?.startsWith("https://")) next.set(holding.chain + ":" + holding.contract.toLowerCase(), holding.imageUrl);
        }
        setHoldingArt(next);
      }).catch(() => { if (!canceled) setHoldingArt(new Map()); });
    return () => { canceled = true; };
  }, [authenticated, address]);

  const personal = useMemo(
    () => events.filter((event) => event.wallet.toLowerCase() === address),
    [events, address],
  );
  const summary = useMemo(() => calculatePnl(personal), [personal]);
  const previewByCollection = useMemo(() => {
    const previews = new Map<string, string>();
    const newestFirst = [...personal].sort((a, b) => b.date.localeCompare(a.date));
    for (const event of newestFirst) {
      const key = event.chain + ":" + (event.contract || event.collection).toLowerCase();
      if (!previews.has(key) && event.imageUrl?.startsWith("https://")) previews.set(key, event.imageUrl);
    }
    return previews;
  }, [personal]);
  const collectionArtwork = (network: Chain, contract: string | null | undefined, name: string, direct?: string) => {
    const key = network + ":" + (contract || name).toLowerCase();
    return direct?.startsWith("https://") ? direct : previewByCollection.get(key) || holdingArt.get(key) || null;
  };
  const usdText = (eth: string | number, signed = false) => {
    const ethAmount = Number(eth);
    if (spotEthUsd === null || !Number.isFinite(ethAmount)) return null;
    const usd = ethAmount * spotEthUsd;
    return "(" + (usd < 0 ? "-$" : signed && usd > 0 ? "+$" : "$") +
      Math.abs(usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ")";
  };
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
    setCoverageNotes([]);
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
      const detail = [ ...successes.map((result) => result.data.warning || ""), ...failures ];
      const uniqueWarnings = [...new Set(detail.flatMap((text) => text.split(/(?<=\.)\s+/)).map((text) => text.trim()).filter(Boolean))];
      setCoverageNotes(uniqueWarnings);
      setNotice(""); // Success is reflected in the refreshed dashboard; no giant notification banner.
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
      <div className="personal-market-tape"><MarketTape/></div>
      <div className="personal-toolbar">
        <span className="personal-toolbar-label">Wallet performance</span>
        <div className="profile-scan-actions">
          <select aria-label="Scan blockchain" value={chain} disabled={busy} onChange={(event) => { setChain(event.target.value as Chain); setNotice(""); setHasScanned(false); }}>
            <option value="all">All supported networks</option><option value="ethereum">Ethereum</option><option value="base">Base</option><option value="arbitrum">Arbitrum</option><option value="robinhood">Robinhood</option>
          </select>
          <button type="button" disabled={busy} onClick={() => void scanWallet(address, chain)}>
            <RefreshCw size={15} className={busy ? "personal-spin" : ""}/> {busy ? "Scanning…" : "Refresh PnL"}
          </button>
        </div>
      </div>

      {noticeError && notice && <div className="profile-notice personal-error" role="alert">{notice}</div>}
      {coveragePartial && <details className="personal-coverage-details">
        <summary>Partial history · PnL excludes unknown costs</summary>
        <p>Some trading events, gas charges or mint costs were not available. Realized PnL is an estimate.</p>
        {coverageNotes.length > 0 && <ul>{coverageNotes.slice(0, 12).map((text, i) => <li key={i}>{text}</li>)}</ul>}
      </details>}

      <div className="personal-overview">
        <section className="personal-pnl-hero" aria-label="Realized profit and loss">
          <span className="personal-stat-label">REALIZED NFT PNL</span>
          <strong className={hasKnownPnl ? (Number(summary.realizedEth) >= 0 ? "personal-profit" : "personal-loss") : ""}>
            {hasKnownPnl ? `${Number(summary.realizedEth) > 0 ? "+" : ""}${amount(summary.realizedEth)} ETH` : "—"}
            {hasKnownPnl && usdText(summary.realizedEth, true) && <span className="personal-overview-usd">{usdText(summary.realizedEth, true)}</span>}
          </strong>
          <p>{hasKnownPnl ? `${knownSales} sale(s) with known cost basis` : "No matched NFT buy → sell pair available yet."}</p>

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
              <div className="personal-row-main">
                <ProfileNftThumb name={trade.collection} src={collectionArtwork(trade.chain, trade.contract, trade.collection, trade.imageUrl)}/>
                <div className="personal-row-copy">
                  <strong>{trade.collection} #{trade.tokenId}</strong>
                  <small>{chainNames[trade.chain]} · Sold {new Date(trade.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small>
                </div>
              </div>
              <div className="personal-collection-result">
                <strong className="personal-profit">+{amount(trade.realizedEth || "0")} ETH {usdText(trade.realizedEth || "0", true) && <span className="personal-usd-inline">{usdText(trade.realizedEth || "0", true)}</span>}</strong>
              </div>
            </div>)}
          </div> : <p className="personal-empty">No matched profitable sales in available trade history.</p>}
        </section>
        <section className="profile-panel personal-section personal-collections">
          <div className="personal-section-head"><div><span className="personal-kicker">BREAKDOWN</span><h2>Collection PnL</h2></div></div>
          {summary.collections.length ? <div className="personal-collection-list">
            {summary.collections.slice(0, 10).map((collection, index) =>
              <div className="personal-collection-row" key={collection.chain + ":" + (collection.contract || collection.name) + ":" + index}>
                <div className="personal-row-main">
                  <ProfileNftThumb name={collection.name} src={collectionArtwork(collection.chain, collection.contract, collection.name)}/>
                  <div className="personal-row-copy">
                    <strong>{collection.name}</strong>
                    <small>{chainNames[collection.chain]} · {collection.buys} bought · {collection.sells} sold</small>
                  </div>
                </div>
                <div className="personal-collection-result">
                  <strong className={Number(collection.realizedEth) >= 0 ? "personal-profit" : "personal-loss"}>
                    {Number(collection.realizedEth) > 0 ? "+" : ""}{amount(collection.realizedEth)} ETH
                    {usdText(collection.realizedEth, true) && <span className="personal-usd-inline">{usdText(collection.realizedEth, true)}</span>}
                  </strong>
                  {collection.unknownBasisSales > 0 && <small>{collection.unknownBasisSales} unmatched sale(s)</small>}
                </div>
              </div>)}
          </div> : <p className="personal-empty">No collection data yet. Refresh PnL to scan your trades.</p>}
        </section>

        <section className="profile-panel personal-section personal-activity">
          <div className="personal-section-head"><div><span className="personal-kicker">ACTIVITY</span><h2>Latest NFT trades</h2></div></div>
          {recent.length ? <div className="personal-trade-list">
            {recent.map((event) => <div key={event.id} className="personal-trade-row">
              <div className="personal-row-main">
                <ProfileNftThumb name={event.collection} src={collectionArtwork(event.chain, event.contract, event.collection, event.imageUrl)}/>
                <div className="personal-row-copy">
                  <div className="personal-trade-title">
                    <strong>{event.collection} #{event.tokenId}</strong>
                    <span className={`personal-trade-badge ${event.type}`}>{event.type === "transfer_in" ? "TRANSFER" : event.type.toUpperCase()}</span>
                  </div>
                  <small>{chainNames[event.chain]} · {new Date(event.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</small>
                </div>
              </div>
              <div className="personal-trade-value">
                <strong>{event.type === "transfer_in" || event.type === "mint" ? "—" : amount(event.amountEth) + " ETH"}</strong>
                {event.type !== "transfer_in" && event.type !== "mint" && usdText(event.amountEth) && <span className="personal-usd-inline">{usdText(event.amountEth)}</span>}
              </div>
            </div>)}
          </div> : <p className="personal-empty">No supported NFT activity recorded yet.</p>}
        </section>
      </div>

      <div className="personal-footer">
        <span>Read-only wallet connection. Wallet ownership does not guarantee complete transaction history; displayed amounts are estimates, not tax figures.</span>
        <Link href="/dashboard">Import CSV / advanced ledger <ArrowRight size={14}/></Link>
      </div>
    </>}
  </main>;
}
