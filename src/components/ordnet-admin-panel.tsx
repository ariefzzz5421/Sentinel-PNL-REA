"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LockKeyhole, RefreshCcw, ShieldCheck, Wallet, XCircle } from "lucide-react";

type Status = {
  configured: boolean; authenticated: boolean; connected: boolean;
  expiresAt: string | null; ordinalsAddress: string | null; paymentAddress: string | null;
};
type Challenge = { challengeId: string; address: string; role: string; message: string };
type Pending = { authRequestId: string; challenges: Challenge[] };
type Verification = { challengeId: string; address: string; signature: string };
type Unisat = {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
  getNetwork?: () => Promise<string>;
  signMessage: (message: string, type: "bip322-simple") => Promise<string>;
};
const API = "/api/admin/ordnet";
const initial: Status = { configured: false, authenticated: false, connected: false, expiresAt: null, ordinalsAddress: null, paymentAddress: null };

function unisatWallet(): Unisat | null {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & { unisat?: Unisat }).unisat;
  return provider && typeof provider.signMessage === "function" ? provider : null;
}

async function call<T>(action: string, body?: unknown): Promise<T> {
  const response = await fetch(API + "/" + action, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? "Request failed (" + response.status + ")");
  return json;
}

function base64ToHex(base64: string): string {
  // UniSat explicitly returns a Base64 BIP-322 simple witness; ORD.NET expects hex bytes.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Wallet did not return a valid Base64 BIP-322 signature.");
  const raw = atob(base64);
  if (raw.length === 0 || raw.length > 4096) throw new Error("Wallet returned an invalid signature size.");
  return Array.from(raw, (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export function OrdnetAdminPanel() {
  const [status, setStatus] = useState<Status>(initial);
  const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState("");
  const [ordinalsAddress, setOrdinalsAddress] = useState("");
  const [paymentAddress, setPaymentAddress] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [signed, setSigned] = useState<Verification[]>([]);
  const [slugs, setSlugs] = useState("bitcoin-puppets");
  const [floorData, setFloorData] = useState<unknown>(null);
  const [profile, setProfile] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const next = await call<Status>("status");
    setStatus(next);
    setLoaded(true);
  }, []);
  useEffect(() => {
    refresh().catch(() => { setLoaded(true); setError("Cannot reach ORD.NET admin backend."); });
  }, [refresh]);

  const task = async (fn: () => Promise<void>) => {
    setWorking(true); setError(""); setMessage("");
    try { await fn(); } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Unexpected error.");
    } finally { setWorking(false); }
  };

  const login = () => task(async () => {
    await call("login", { password });
    setPassword("");
    await refresh();
    setMessage("Admin unlocked. Connect a Bitcoin wallet to continue.");
  });

  const connect = () => task(async () => {
    const provider = unisatWallet();
    if (!provider) throw new Error("UniSat browser extension not detected. Install UniSat, then reload.");
    if (provider.getNetwork && (await provider.getNetwork()) !== "livenet")
      throw new Error("Switch UniSat to Bitcoin Mainnet (livenet).");
    const accounts = await provider.requestAccounts();
    if (!accounts[0]) throw new Error("Wallet did not provide an address.");
    setWalletAddress(accounts[0]);
    setOrdinalsAddress(accounts[0]);
    setPaymentAddress(accounts[0]);
    setPending(null); setSigned([]);
    setMessage("UniSat connected. Confirm both addresses. You may edit them if ORD.NET needs different addresses.");
  });

  const challenge = () => task(async () => {
    if (!unisatWallet()) throw new Error("Connect UniSat first.");
    const result = await call<Pending>("challenge", { ordinalsAddress: ordinalsAddress.trim(), paymentAddress: paymentAddress.trim() });
    setPending(result); setSigned([]);
    setMessage("Challenge received. Sign the exact ORD.NET message for each requested address.");
  });

  const signNext = () => task(async () => {
    if (!pending) throw new Error("Start a new challenge.");
    const target = pending.challenges.find((challenge) => !signed.some((entry) => entry.challengeId === challenge.challengeId));
    if (!target) throw new Error("All challenges already signed.");
    const provider = unisatWallet();
    if (!provider) throw new Error("UniSat extension not detected.");
    if (provider.getNetwork && (await provider.getNetwork()) !== "livenet")
      throw new Error("Switch UniSat to Bitcoin Mainnet.");
    const accounts = await provider.getAccounts();
    if (!accounts.some((address) => address === target.address))
      throw new Error("Select " + target.role + " address " + target.address + " in UniSat, then click Sign next again. Previous signatures will be retained.");
    const rawSignature = await provider.signMessage(target.message, "bip322-simple");
    const verification = { challengeId: target.challengeId, address: target.address, signature: base64ToHex(rawSignature) };
    const complete = [...signed, verification];
    setSigned(complete);
    if (complete.length < pending.challenges.length) {
      setMessage("Signature " + complete.length + "/" + pending.challenges.length + " complete. Sign the next address.");
      return;
    }
    const verified = await call<{ connected: boolean; expiresAt: string }>("verify", {
      authRequestId: pending.authRequestId, verifications: complete,
    });
    setPending(null); setSigned([]);
    await refresh();
    setMessage("ORD.NET connected until " + new Date(verified.expiresAt).toLocaleString() + ".");
  });

  const logout = (action: "logout" | "disconnect") => task(async () => {
    await call(action, {});
    setPending(null); setSigned([]); setFloorData(null); setProfile(null); setWalletAddress("");
    await refresh();
    setMessage(action === "logout" ? "Admin logged out." : "ORD.NET session disconnected.");
  });

  const testConnection = () => task(async () => {
    const data = await call<unknown>("me");
    setProfile(data);
    setMessage("ORD.NET /me request succeeded.");
  });

  const testFloors = () => task(async () => {
    const data = await call<unknown>("floors?slugs=" + encodeURIComponent(slugs.trim()));
    setFloorData(data);
    setMessage("Live floor response received from ORD.NET.");
  });

  const pendingNext = pending?.challenges.find((entry) => !signed.some((item) => item.challengeId === entry.challengeId));

  return (
    <main className="min-h-screen bg-[#090c19] px-4 py-10 text-[#f5f4ff]">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#a9c7e8] hover:text-white"><ArrowLeft size={16}/> Back to Sentinel</Link>
        <header className="rounded-2xl border border-[#40325d] bg-[#151325] p-6 sm:p-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[.2em] text-[#ad8af7]"><ShieldCheck size={16}/> SENTINEL / PROVIDER ADMIN</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">ORD.NET Connection</h1>
          <p className="mt-3 text-sm leading-6 text-[#b4aec8]">Read-only Bitcoin marketplace provider. Your existing Ordiscan scanner and NFT PnL engine are untouched.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-[#4b3b63] px-3 py-2">Provider: ORD.NET</span>
            <span className="rounded-lg border border-[#4b3b63] px-3 py-2">Signatures: BIP-322</span>
            <span className="rounded-lg border border-[#4b3b63] px-3 py-2">Session: ~1 hour</span>
          </div>
        </header>
        {!loaded ? <p className="text-[#b4aec8]">Checking admin configuration…</p> :
          !status.configured ? (
            <section className="rounded-2xl border border-amber-700/60 bg-[#201a22] p-6">
              <h2 className="font-bold">Server setup required</h2>
              <p className="mt-2 text-sm text-[#d4bdab]">Configure ORDNET_ADMIN_PASSWORD (20+ characters) and ORDNET_COOKIE_SECRET (32+ random characters) in Vercel, then redeploy. Never use NEXT_PUBLIC_.</p>
            </section>
          ) : !status.authenticated ? (
            <form onSubmit={(event) => { event.preventDefault(); void login(); }} className="rounded-2xl border border-[#40325d] bg-[#151325] p-6">
              <h2 className="flex items-center gap-2 font-bold"><LockKeyhole size={18}/> Admin login</h2>
              <p className="mb-5 mt-2 text-sm text-[#b4aec8]">This password protects the ORD.NET wallet-signature flow from public visitors.</p>
              <label htmlFor="ordnet-password" className="text-xs font-semibold text-[#b4aec8]">Admin password</label>
              <input id="ordnet-password" autoComplete="current-password" type="password" required value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-[#50446e] bg-[#0b0b19] px-4 py-3 text-sm outline-none focus:border-[#69cffa]"/>
              <button disabled={working} className="mt-4 rounded-xl bg-[#62ccf4] px-5 py-3 text-sm font-bold text-[#091321] disabled:opacity-50">Unlock admin</button>
            </form>
          ) : (
            <>
              <section className="space-y-4 rounded-2xl border border-[#40325d] bg-[#151325] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-bold"><Wallet size={20}/> Bitcoin wallet</h2>
                  <div className="flex items-center gap-2 text-sm">{status.connected ?
                    <><CheckCircle2 className="text-emerald-400" size={18}/> Connected</> :
                    <><XCircle className="text-amber-400" size={18}/> Disconnected</>}</div>
                </div>
                {status.connected ? (
                  <div className="space-y-2 rounded-lg bg-[#101120] p-4 text-sm">
                    <p>Ordinals: <span className="break-all font-mono text-[#a8dcf0]">{status.ordinalsAddress}</span></p>
                    <p>Payment: <span className="break-all font-mono text-[#a8dcf0]">{status.paymentAddress}</span></p>
                    <p>Expires: <strong>{status.expiresAt ? new Date(status.expiresAt).toLocaleString() : "Unknown"}</strong></p>
                  </div>
                ) : <p className="text-sm text-[#b4aec8]">Connect using a UniSat browser extension. No transfer, PSBT, or private-key permission is requested.</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={working} onClick={() => void connect()}
                    className="rounded-xl bg-[#62ccf4] px-4 py-3 text-sm font-bold text-[#091321] disabled:opacity-50">
                    {walletAddress ? "Reconnect UniSat" : "Connect UniSat"}</button>
                  <button type="button" disabled={working || !status.connected} onClick={() => void logout("disconnect")}
                    className="rounded-xl border border-[#554267] px-4 py-3 text-sm disabled:opacity-50">Disconnect ORD.NET</button>
                  <button type="button" disabled={working} onClick={() => void logout("logout")}
                    className="rounded-xl border border-[#554267] px-4 py-3 text-sm disabled:opacity-50">Log out</button>
                </div>
                {walletAddress && <p className="break-all text-xs text-[#aaa3bc]">Current UniSat address: {walletAddress}</p>}
                <p className="text-xs leading-5 text-[#aaa3bc]">ORD.NET checks 100,000 confirmed sats on the payment address at verification. You do not need to send funds to ORD.NET.</p>
              </section>
              <section className="space-y-4 rounded-2xl border border-[#40325d] bg-[#151325] p-6">
                <h2 className="text-lg font-bold">BIP-322 authentication</h2>
                <p className="text-sm text-[#b4aec8]">ORD.NET may ask for one or two signatures. If addresses differ, switch the selected address inside UniSat before signing the next challenge.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {([["Ordinals address", ordinalsAddress, setOrdinalsAddress], ["Payment address", paymentAddress, setPaymentAddress]] as const).map(([label, value, setter]) =>
                    <label key={label} className="space-y-2 text-xs font-semibold text-[#b4aec8]">{label}
                      <input spellCheck={false} value={value} onChange={(event) => setter(event.target.value)}
                        placeholder="bc1…" className="block w-full rounded-xl border border-[#50446e] bg-[#0b0b19] px-3 py-3 font-mono text-xs text-white outline-none focus:border-[#69cffa]"/>
                    </label>)}
                </div>
                <button type="button" disabled={working || !ordinalsAddress || !paymentAddress}
                  onClick={() => void challenge()} className="rounded-xl border border-[#69cffa] px-4 py-3 text-sm font-bold text-[#8dddfc] disabled:opacity-50">
                  <span className="inline-flex items-center gap-2"><RefreshCcw size={15}/> Request fresh challenge</span>
                </button>
                {pending && <div className="space-y-3 rounded-xl border border-[#50446e] bg-[#0c0c19] p-4 text-sm">
                  <p>Signed: <strong>{signed.length}/{pending.challenges.length}</strong></p>
                  {pendingNext && <p className="break-all text-[#b9b1ca]">Next: <strong className="text-white">{pendingNext.role}</strong> · {pendingNext.address}</p>}
                  <button type="button" disabled={working || !pendingNext} onClick={() => void signNext()}
                    className="rounded-lg bg-[#ad8af7] px-4 py-3 text-sm font-bold text-[#100b1d] disabled:opacity-50">
                    Sign next BIP-322 message
                  </button>
                </div>}
              </section>
              <section className="space-y-3 rounded-2xl border border-[#40325d] bg-[#151325] p-6">
                <h2 className="text-lg font-bold">Read-only API diagnostics</h2>
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={working || !status.connected} onClick={() => void testConnection()}
                    className="rounded-lg border border-[#554267] px-4 py-3 text-sm disabled:opacity-50">Test /me</button>
                  <button type="button" disabled={working} onClick={() => void refresh()}
                    className="rounded-lg border border-[#554267] px-4 py-3 text-sm disabled:opacity-50">Refresh status</button>
                </div>
                <label htmlFor="ordnet-slugs" className="block text-xs text-[#b4aec8]">Collection slugs (comma-separated, max 10)</label>
                <div className="flex flex-wrap gap-3">
                  <input id="ordnet-slugs" value={slugs} onChange={(event) => setSlugs(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-[#50446e] bg-[#0b0b19] px-4 py-3 text-sm outline-none"/>
                  <button type="button" disabled={working || !status.connected} onClick={() => void testFloors()}
                    className="rounded-lg bg-[#222d43] px-4 py-3 text-sm font-bold text-[#9ddcfa] disabled:opacity-50">Fetch floor</button>
                </div>
                {profile !== null && <details className="text-xs"><summary className="cursor-pointer text-[#ad8af7]">Verified ORD.NET profile response</summary><pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-[#0c0c19] p-3">{JSON.stringify(profile, null, 2)}</pre></details>}
                {floorData !== null && <details open className="text-xs"><summary className="cursor-pointer text-[#ad8af7]">ORD.NET floor data</summary><pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-[#0c0c19] p-3">{JSON.stringify(floorData, null, 2)}</pre></details>}
              </section>
            </>
          )}
        {message && <p role="status" className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4 text-sm text-emerald-300">{message}</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-700/60 bg-rose-950/30 p-4 text-sm text-rose-300">{error}</p>}
        <p className="text-xs leading-5 text-[#918ba7]">This admin session is browser-specific. The ORD.NET API token is encrypted inside an HttpOnly cookie and never returned to client JavaScript. You must sign again after expiry. ORD.NET may reject access if the payment address has fewer than 0.001 BTC confirmed. Signing a login message is not a transaction authorization.</p>
      </div>
    </main>
  );
}
