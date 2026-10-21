"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { eventsSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { calculatePnl } from "@/lib/pnl/calculate";

const STORE = "sentinel-pnl-events-v1";
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function ActiveProfile() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const addresses = useMemo(() => [...new Set(wallets.filter((wallet) => /^0x[a-f\d]{40}$/i.test(wallet.address)).map((wallet) => wallet.address.toLowerCase()))], [wallets]);
  const [selected, setSelected] = useState("");
  const address = addresses.includes(selected) ? selected : addresses[0];
  const [events, setEvents] = useState<TradeEvent[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = eventsSchema.safeParse(JSON.parse(localStorage.getItem(STORE) || "[]"));
      return stored.success ? stored.data : [];
    } catch { return []; }
  });
  const [chain, setChain] = useState<Chain>("ethereum");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const personal = useMemo(() => events.filter((event) => event.wallet.toLowerCase() === address), [events, address]);
  const summary = useMemo(() => calculatePnl(personal), [personal]);
  async function scanConnected() {
    if (!address) return;
    setBusy(true); setNotice("Scanning public activity…");
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, chain, mode: "wallet" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan failed.");
      const incoming = eventsSchema.parse(data.events);
      const stored = eventsSchema.safeParse(JSON.parse(localStorage.getItem(STORE) || "[]"));
      const merged = new Map((stored.success ? stored.data : []).map((event) => [event.id, event]));
      for (const event of incoming) merged.set(event.id, event);
      if (merged.size > 10_000) throw new Error("Local ledger limit reached. Export a CSV first.");
      const next = [...merged.values()];
      localStorage.setItem(STORE, JSON.stringify(next));
      setEvents(next);
      setNotice(`${incoming.length} supported event(s) found.${data.warning ? ` ${data.warning}` : ""}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Scan failed."); }
    finally { setBusy(false); }
  }
  if (!ready) return <main className="profile-page"><p>Loading wallet profile…</p></main>;
  if (!authenticated) return <main className="profile-page"><div className="profile-hero"><p className="profile-eyebrow">PRIVATE VIEW OF YOUR LOCAL LEDGER</p><h1>Your wallet profile</h1><p>Connect a wallet to filter this browser’s ledger to your linked address. Pasting an address on the scanner stays available without a connection.</p><button type="button" className="wallet-connect-button" onClick={login}>Connect wallet</button></div></main>;
  return <main className="profile-page">
    <div className="profile-hero"><p className="profile-eyebrow">SENTINEL ACCOUNT · {user?.id ? short(user.id) : "CONNECTED"}</p><h1>Your wallet, in focus.</h1><p>Local NFT activity and PnL for the wallet you selected. Data stays in this browser; connecting does not import history automatically.</p>
      {addresses.length ? <div className="profile-wallets" role="group" aria-label="Connected wallets">{addresses.map((item) => <button key={item} type="button" className={item === address ? "active" : ""} onClick={() => setSelected(item)}>{short(item)}</button>)}</div> : <p>No EVM wallet is linked to this Privy account. Connect one to view wallet activity.</p>}
    </div>
    {address && <>
      <div className="profile-metrics"><div><span>Realized PnL{summary.estimatedSales ? " estimate" : ""}</span><strong>{summary.realizedEth} ETH</strong><small>{summary.unknownBasisSales} sales have unknown cost basis</small></div><div><span>Purchases + mints</span><strong>{summary.buys}</strong><small>Supported priced records</small></div><div><span>Sales</span><strong>{summary.sells}</strong><small>{summary.estimatedSales} with missing provider fees</small></div><div><span>Open NFT positions</span><strong>{summary.openPositions}</strong><small>From this browser’s ledger</small></div></div>
      <section className="profile-panel"><div><h2>Scan this wallet</h2><p>Read supported public NFT activity into your local ledger.</p></div><div className="profile-scan-actions"><select aria-label="Scan chain" value={chain} onChange={(event) => setChain(event.target.value as Chain)}><option value="ethereum">Ethereum</option><option value="base">Base</option><option value="arbitrum">Arbitrum</option></select><button type="button" disabled={busy} onClick={() => void scanConnected()}>{busy ? "Scanning…" : "Scan wallet"}</button></div></section>
      {notice && <p className="profile-notice" role="status">{notice}</p>}
      <section className="profile-panel profile-history"><div><h2>Recent activity</h2><p>{personal.length ? `${personal.length} local event(s) for ${short(address)}` : "No local trades for this wallet yet."}</p></div><Link href="/dashboard">Open full ledger →</Link><ul>{[...personal].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8).map((event) => <li key={event.id}><span>{event.type.toUpperCase()} · {event.collection} #{event.tokenId}</span><span>{event.amountEth} ETH</span></li>)}</ul></section>
    </>}
  </main>;
}
