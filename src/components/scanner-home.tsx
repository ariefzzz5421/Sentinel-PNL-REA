"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleHelp, FileInput, ScanSearch } from "lucide-react";
import { addressSchema, eventsSchema, type Chain, type TradeEvent } from "@/lib/schema";
import { scanChains, scanChainById, type ScanChain } from "@/lib/scan-chains";
import { resolveWalletInput } from "@/lib/resolve-wallet-input";
import { WalletConnectControl } from "@/components/wallet-connect-control";

const STORE = "sentinel-pnl-events-v1";
export function ScannerHome() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [chain, setChain] = useState<ScanChain>("ethereum");
  const [wallets, setWallets] = useState("");
  const [contract, setContract] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  async function loadWallets(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25_000) throw new Error("Wallet list exceeds 25 KB.");
      const contents = await file.text();
      const items = contents.split(/[\s,;]+/).filter(Boolean);
      if (!items.length || items.length > 100) throw new Error("Use 1 to 100 wallets or ENS names.");
      setWallets(items.join("\n"));
      setMessage(`Loaded ${items.length} wallet input(s).`);
      setError(false);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not load wallet list."); setError(true); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }
  async function scan(mode: "wallet" | "contract" | "bot") {
    let addresses: string[];
    let resolutionNote = "";
    const selected = scanChainById(chain);
    if (!selected.scanReady) {
      setMessage(`${selected.label} network is configured (chain ${selected.chainId}), but NFT scan data is not connected yet. Add a compatible activity provider before scanning; RPC alone cannot calculate PnL.`);
      setError(true);
      return;
    }
    setBusy(true); setError(false); setMessage("Resolving wallet inputs…");
    try {
      const resolved = await resolveWalletInput(wallets, chain);
      addresses = resolved.addresses;
      resolutionNote = resolved.description;
      if (mode !== "wallet" && !addressSchema.safeParse(contract).success)
        throw new Error("Enter a valid collection contract address.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Invalid wallet."); setError(true); setBusy(false); return; }
    setMessage(`${resolutionNote} Scanning ${addresses.length} wallet(s) on ${chain}…`.trim());
    try {
      const gathered: TradeEvent[] = [];
      const warnings: string[] = [];
      const failures: string[] = [];
      let partial = false;
      for (let offset = 0; offset < addresses.length; offset += 4) {
        const results = await Promise.all(addresses.slice(offset, offset + 4).map(async (address) => {
          const response = await fetch("/api/scan", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ address, chain: chain as Chain, mode, contract: mode === "wallet" ? undefined : contract.trim() }),
          });
          const data: unknown = await response.json();
          if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data ? String(data.error) : "Scan failed.");
          const result = data as { events: unknown; partial?: boolean; warning?: string };
          return { events: eventsSchema.parse(result.events), partial: Boolean(result.partial), warning: result.warning };
        }).map((promise) => promise.catch((cause) => ({ error: cause instanceof Error ? cause.message : "Scan failed." }))));
        for (const result of results) {
          if ("error" in result) failures.push(result.error);
          else { gathered.push(...result.events); partial ||= result.partial; if (result.warning) warnings.push(result.warning); }
        }
      }
      if (failures.length === addresses.length) throw new Error(failures[0]);
      const prior = eventsSchema.safeParse(JSON.parse(localStorage.getItem(STORE) || "[]"));
      const merged = new Map((prior.success ? prior.data : []).map((event) => [event.id, event]));
      for (const event of gathered) merged.set(event.id, event);
      if (merged.size > 10_000) throw new Error("Ledger exceeds 10,000 events. Export a CSV from the dashboard first.");
      localStorage.setItem(STORE, JSON.stringify([...merged.values()]));
      sessionStorage.setItem("sentinel-pnl-scan-status-v1", JSON.stringify({ partial: partial || failures.length > 0, warning: [resolutionNote, ...warnings, ...failures].join(" ") }));
      if (gathered.length) router.push("/dashboard");
      else setMessage(`${resolutionNote} No supported priced NFT trades found.${partial || failures.length ? " Coverage is partial." : ""} ${[...warnings, ...failures].join(" ")}`.trim());
    } catch (cause) { const detail = cause instanceof Error ? cause.message : "Scan failed."; setMessage([resolutionNote, detail].filter(Boolean).join(" ")); setError(true); }
    finally { setBusy(false); }
  }
  return <div className="scanner-page">
    <header className="scanner-header">
      <Link href="/" className="scanner-brand"><Image src="/sentinel-logo.svg" width={38} height={40} alt="Sentinel logo"/><span>SENTINEL PNL</span></Link>
      <a href="#scanner" className="scanner-nav">Scans</a>
      <div className="scanner-header-actions"><WalletConnectControl/></div>
    </header>
    <div className="scanner-layout">
      <aside className="scanner-side scanner-side-left" aria-label="Local workspace">
        <h2>Your local workspace</h2><p>Wallet connection is optional. Scanned and imported trades are saved in this browser.</p>
        <Link href="/dashboard">Open ledger <ArrowRight size={15}/></Link>
        <Link href="/methodology">PnL methodology <CircleHelp size={15}/></Link>
      </aside>
      <main className="scanner-main" id="scanner">
        <div className="scanner-chains" role="group" aria-label="Blockchain">
          {scanChains.map((item) => <button key={item.id} type="button" onClick={() => setChain(item.id)} aria-pressed={chain === item.id} className={chain === item.id ? "selected" : ""} title={item.scanReady ? `${item.label} NFT scan` : `${item.label}: network configured, NFT scan pending data provider`}>{"icon" in item ? <Image src={item.icon} width={19} height={19} alt=""/> : <span>●</span>}{item.label}{!item.scanReady && <small>soon</small>}</button>)}
        </div>
        <div className="scanner-intro"><div className="scanner-kicker"><span className="signal-dot"/> NFT TRADE ANALYSIS</div>
          <h1>Track your NFT <em>performance</em></h1>
          <p>Paste a public wallet. See supported buys, mints, sales and estimated realized profit.</p>
        </div>
        <section className="scanner-form" aria-label="Wallet scanner">
          <div className="scanner-primary-row">
            <div className="scanner-wallet-field">
              <textarea aria-label="Wallet addresses or ENS names" title="Paste up to 100 addresses or 20 ENS names, separated by lines, spaces, or commas." rows={2} value={wallets} onChange={(event) => setWallets(event.target.value)} placeholder="0x… wallet address or name.eth"/>
              <input ref={fileRef} className="visually-hidden" type="file" accept=".txt,text/plain" onChange={(event) => void loadWallets(event.target.files?.[0])}/>
              <button className="scanner-file" type="button" onClick={() => fileRef.current?.click()}><FileInput size={14}/> .txt</button>
            </div>
            <button className="scanner-submit" type="button" disabled={busy} onClick={() => void scan("wallet")}>{busy ? "Scanning…" : "Scan"}</button>
          </div>
          <input className="scanner-contract" aria-label="Collection contract address" value={contract} onChange={(event) => setContract(event.target.value)} placeholder="Collection contract address (required for Scan Contract & Bot PNL)"/>
          <div className="scanner-secondary-row">
            <button type="button" className="scanner-contract-btn" disabled={busy} onClick={() => void scan("contract")}>Scan Contract</button>
            <button type="button" className="scanner-bot-btn" disabled={busy} onClick={() => void scan("bot")}>Bot PNL</button>
          </div>
        </section>
        <div className="scanner-mobile-workspace">
          <h2>Your local workspace</h2>
          <p>Wallet connection is optional. Scanned and imported trades are saved in this browser.</p>
          <Link href="/dashboard">Open ledger <ArrowRight size={15}/></Link>
          <Link href="/methodology">PnL methodology <CircleHelp size={15}/></Link>
        </div>
        {message ? <div className={`scanner-message ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{message}</div>
          : <div className="scanner-empty"><ScanSearch size={33}/><strong>Nothing here yet.</strong><span>Paste a wallet above and run <b>Scan</b></span></div>}
      </main>
      <aside className="scanner-side scanner-side-right" aria-label="How to use">
        <h2>How to use</h2>
        <div><strong>Scan</strong><p>Analyze public wallet addresses.</p></div>
        <div><strong>Scan Contract</strong><p>Filter a wallet scan to one NFT contract.</p></div>
        <div><strong>Bot PNL</strong><p>Combine supplied wallets for one contract.</p></div>
      </aside>
    </div>
  </div>;
}
