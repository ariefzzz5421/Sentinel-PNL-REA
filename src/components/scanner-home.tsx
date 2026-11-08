"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CircleHelp, FileInput, ScanSearch } from "lucide-react";
import { addressSchema, eventsSchema, type TradeEvent } from "@/lib/schema";
import { autoPricedChains, detectAutomaticWalletFamily, scanAllEvmNetworks, type AutoScanNetworkStatus } from "@/lib/automatic-scan";
import { scanChains } from "@/lib/scan-chains";
import { resolveWalletInput } from "@/lib/resolve-wallet-input";
import { WalletConnectControl } from "@/components/wallet-connect-control";
import { ScanResults, type PublicHolding } from "@/components/scan-results";
import { MarketTape } from "@/components/market-tape";
import { DiscoveryResults } from "@/components/discovery-results";
import type { DiscoveryResult } from "@/lib/nft-discovery";

const STORE = "sentinel-pnl-events-v1";
export function ScannerHome() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [wallets, setWallets] = useState("");
  const [contract, setContract] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [resultEvents, setResultEvents] = useState<TradeEvent[] | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [evmDiscoveries, setEvmDiscoveries] = useState<DiscoveryResult[]>([]);
  const [networkStatuses, setNetworkStatuses] = useState<AutoScanNetworkStatus[]>([]);
  const [resultHoldings, setResultHoldings] = useState<PublicHolding[]>([]);
  const [holdingsComplete, setHoldingsComplete] = useState(false);
  const [resultAddress, setResultAddress] = useState<string | null>(null);
  const [resultPartial, setResultPartial] = useState(false);
  const [resultWarning, setResultWarning] = useState("");
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
    setResultEvents(null);
    setDiscovery(null);
    setEvmDiscoveries([]);
    setNetworkStatuses([]);
    setResultHoldings([]);
    setHoldingsComplete(false);
    setResultAddress(null);
    setResultWarning("");
    const pasted = wallets.trim();
    let walletFamily: ReturnType<typeof detectAutomaticWalletFamily>;
    try { walletFamily = detectAutomaticWalletFamily(pasted); }
    catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Invalid wallet address.");
      setError(true);
      return;
    }

    // A BTC/SOL address cannot be derived from a 0x address. Detect the
    // address family automatically without requiring the decorative chain bar.
    if (walletFamily.kind === "discovery") {
      if (mode !== "wallet") {
        setMessage("Use Scan for Bitcoin or Solana wallet discovery. Contract and Bot PnL scans require EVM addresses.");
        setError(true); return;
      }
      setBusy(true); setError(false);
      setMessage("Reading public NFT data from " + walletFamily.chain + "…");
      try {
        const response = await fetch("/api/nft-discovery", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chain: walletFamily.chain, address: walletFamily.address }),
        });
        const data = await response.json() as DiscoveryResult & { error?: string };
        if (!response.ok) throw new Error(data.error || "NFT discovery failed.");
        if (!Array.isArray(data.assets) || typeof data.pnlAvailable !== "boolean")
          throw new Error("Unexpected NFT discovery response.");
        setDiscovery(data);
        setMessage("Discovery completed.");
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "NFT discovery failed.");
        setError(true);
      } finally { setBusy(false); }
      return;
    }

    setBusy(true); setError(false); setMessage("Resolving EVM wallet inputs…");
    try {
      // Ethereum resolution is sufficient for the same 0x address on all
      // supported EVM networks; do not resolve ENS separately on every chain.
      const resolved = await resolveWalletInput(wallets, "ethereum");
      const addresses = resolved.addresses;
      const contractFilter = contract.trim();
      if (mode !== "wallet" && !addressSchema.safeParse(contractFilter).success)
        throw new Error("Enter a valid EVM collection contract address.");

      setMessage("Scanning " + addresses.length + " wallet(s) across ETH, Base, ARB, RH, ARC and INK…");
      const scan = await scanAllEvmNetworks(addresses, mode,
        mode === "wallet" ? undefined : contractFilter, fetch,
        (complete, total) => setMessage("Scanning supported EVM networks… " + complete + "/" + total));
      const warnings = [...scan.warnings];
      let partial = scan.partial;

      // Storage is optional for the live result; a storage failure should
      // never hide a successful network scan from the user.
      try {
        const saved = localStorage.getItem(STORE);
        const prior = eventsSchema.safeParse(JSON.parse(saved || "[]"));
        const merged = new Map((prior.success ? prior.data : []).map(event => [event.id, event]));
        for (const event of scan.events) merged.set(event.id, event);
        if (merged.size > 10_000) throw new Error("Local ledger exceeds 10,000 events.");
        localStorage.setItem(STORE, JSON.stringify([...merged.values()]));
      } catch {
        partial = true;
        warnings.push("Local browser ledger could not be saved; current scan results are still displayed.");
      }

      let holdings: PublicHolding[] = [];
      let holdingsComplete = false;
      if (mode === "wallet" && addresses.length === 1) {
        try {
          const response = await fetch("/api/opensea/holdings?address=" + encodeURIComponent(addresses[0]));
          const payload: unknown = await response.json();
          if (!response.ok) throw new Error("OpenSea holdings unavailable.");
          if (payload && typeof payload === "object" && "holdings" in payload &&
              Array.isArray(payload.holdings)) {
            holdings = (payload.holdings as PublicHolding[])
              .filter(item => autoPricedChains.some(chain => chain === item.chain) &&
                addressSchema.safeParse(item.contract).success);
            holdingsComplete = !("partial" in payload && payload.partial === true);
            if (!holdingsComplete) throw new Error("Holdings list is incomplete.");
          } else throw new Error("Holdings response is invalid.");
        } catch {
          partial = true;
          warnings.push("OpenSea current holdings could not be fully verified.");
        }
      }

      setNetworkStatuses(scan.statuses);
      setEvmDiscoveries(scan.discoveries);
      setResultEvents(scan.events);
      setResultHoldings(holdings);
      setHoldingsComplete(holdingsComplete);
      setResultAddress(addresses.length === 1 ? addresses[0] : null);
      setResultPartial(partial);
      const warning = [resolved.description, ...warnings].filter(Boolean).join(" ");
      setResultWarning(warning);
      try {
        sessionStorage.setItem("sentinel-pnl-scan-status-v1",
          JSON.stringify({ partial, warning }));
      } catch { /* Scan results remain available even without session storage. */ }
      setMessage((resolved.description ? resolved.description + " " : "") +
        "Scan complete · " + scan.events.length + " priced EVM NFT events, " +
        scan.discoveries.reduce((count, item) => count + item.assets.length, 0) +
        " Arc/Ink indexed holdings and transfers across " +
        scan.requestsSucceeded + "/" +
        (scan.requestsSucceeded + scan.requestsFailed) + " successful network requests." +
        (scan.requestsFailed ? " Some networks failed; see Details below." : ""));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "EVM scan failed.");
      setError(true);
    } finally { setBusy(false); }
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
        <div className="scanner-chains" role="img" aria-label="Network logos: Ethereum, Base, Arbitrum, Robinhood, Arc, Solana, Ink and Bitcoin. Network selection is automatic.">
          {scanChains.map((item) => <span key={item.id} className="scanner-chain-display"
            title={item.scanReady || item.id === "arc" || item.id === "ink"
              ? item.label + " scanned automatically for EVM addresses" : item.label + ": " + ("unavailableReason" in item ? item.unavailableReason : "Requires a matching address")}>
            <Image src={item.icon} width={19} height={19} alt=""/>{item.label}
          </span>)}
        </div>
        <p className="scanner-network-note">Auto scan for 0x wallets: ETH · Base · ARB · RH · ARC · INK. BTC/SOL detected from their own address formats; Arc/Ink price history may be Unknown.</p>
        <MarketTape/>
        <div className="scanner-intro"><div className="scanner-kicker"><span className="signal-dot"/> SENTINEL ANALYSIS</div>
          <h1>Track your NFT <em>performance</em></h1>
          <p>Analyze NFT trades and realized PnL across supported chains.</p>
        </div>
        <section className="scanner-form" aria-label="Wallet scanner">
          <div className="scanner-primary-row">
            <div className="scanner-wallet-field">
              <textarea aria-label="Wallet addresses or ENS names" title="Paste up to 100 addresses or 20 ENS names, separated by lines, spaces, or commas." rows={2} value={wallets} onChange={(event) => setWallets(event.target.value)} placeholder="0x... · name.eth · Solana · bc1p..."/>
              <input ref={fileRef} className="visually-hidden" type="file" accept=".txt,text/plain" onChange={(event) => void loadWallets(event.target.files?.[0])}/>
              <button className="scanner-file" type="button" onClick={() => fileRef.current?.click()}><FileInput size={14}/> .txt</button>
            </div>
            <button className="scanner-submit" type="button" disabled={busy} onClick={() => void scan("wallet")}>{busy ? "Scanning…" : "Scan"}</button>
          </div>
          <input className="scanner-contract" aria-label="Collection contract address" value={contract} onChange={(event) => setContract(event.target.value)} placeholder="Collection contract (optional for wallet scan, required for Contract / Bot PnL)"/>
          <div className="scanner-secondary-row">
            <button type="button" className="scanner-contract-btn" disabled={busy} onClick={() => void scan("contract")}>Scan Contract</button>
            <button type="button" className="scanner-bot-btn" disabled={busy} onClick={() => void scan("bot")}>Bot PNL</button>
          </div>
        </section>
        {message && (!discovery || error) && <p className={error ? "scanner-inline-status is-error" : "scanner-inline-status"} role={error ? "alert" : "status"}>
          {message}
        </p>}
        {discovery ? <DiscoveryResults result={discovery}/> : resultEvents !== null
          ? <><ScanResults events={resultEvents} holdings={resultHoldings} holdingsComplete={holdingsComplete} address={resultAddress} partial={resultPartial} warning={resultWarning} networkStatuses={networkStatuses}/>
            {evmDiscoveries.map(result => <DiscoveryResults key={result.chain + ":" + result.address} result={result}/>) }</>
          : !message && <div className="scanner-empty"><ScanSearch size={33}/><strong>Nothing here yet.</strong><span>Paste a wallet above and run <b>Scan</b></span></div>}
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
