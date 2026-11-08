"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Share2, Pencil, X, ExternalLink } from "lucide-react";
import type { TradeEvent } from "@/lib/schema";
import type { EthUsdSpot } from "@/lib/eth-usd-spot";
import { formatEthPnlUsd } from "@/lib/eth-usd-spot";
import { safeCardName, summarizeOverallWalletPnl } from "@/lib/overall-wallet-pnl";

function ethLabel(value: string | null): string {
  if (value === null) return "Unknown";
  const n = Number(value);
  return Number.isFinite(n) ? (n > 0 ? "+" : "") + n.toFixed(4) + " ETH" : "Unknown";
}

function drawOverallCard(
  canvas: HTMLCanvasElement, name: string, address: string | null,
  metrics: ReturnType<typeof summarizeOverallWalletPnl>,
  spot: EthUsdSpot | null, partial: boolean,
) {
  canvas.width = 1000;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  const bg = ctx.createLinearGradient(0, 0, 1000, 1200);
  bg.addColorStop(0, "#0b0b1b"); bg.addColorStop(1, "#231333");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1000, 1200);
  ctx.strokeStyle = "#76549d"; ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, 948, 1148);

  const line = (y: number) => {
    ctx.strokeStyle = "#443350"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(938, y); ctx.stroke();
  };
  const left = (text: string, y: number, size = 26, color = "#c5bdd7") => {
    ctx.textAlign = "left"; ctx.fillStyle = color;
    ctx.font = "600 " + size + "px Arial, sans-serif";
    ctx.fillText(text, 68, y, 870);
  };
  const right = (text: string, y: number, color = "#f7f0ff") => {
    ctx.textAlign = "right"; ctx.fillStyle = color;
    ctx.font = "bold 31px monospace"; ctx.fillText(text, 922, y, 445);
  };
  left("SENTINEL / WALLET PNL", 100, 26, "#b293f3");
  left("OVERALL REALIZED PERFORMANCE", 155, 22, "#8c82a2");
  left(safeCardName(name, address || "Multiple wallets"), 236, 52, "#f6f2ff");
  left(address || "Multiple public wallets", 291, 21, "#aea3c3");
  line(335);

  left("MATCHED REALIZED PNL · ETH/WETH", 403, 24);
  const raw = metrics.realizedEth;
  const positive = raw !== null && Number(raw) >= 0;
  const pnlColor = raw === null ? "#b9afcd" : positive ? "#33deb0" : "#fd8399";
  left(ethLabel(raw), 480, 58, pnlColor);
  const usd = formatEthPnlUsd(raw, spot);
  left(usd ? "(" + usd + ") · CURRENT ETH/USD SPOT" : "USD spot unavailable", 530, 26, pnlColor);
  line(580);

  left("BOUGHT", 650); right(String(metrics.bought), 650);
  left("SOLD", 717); right(String(metrics.sold), 717);
  left("MATCHED SALES", 784); right(String(metrics.matchedSales), 784);
  left("UNKNOWN BASIS SALES", 851); right(String(metrics.unknownBasisSales), 851);
  left("PRICED COLLECTIONS", 918); right(String(metrics.collections), 918);
  line(958);
  left("NETWORKS: ETH · BASE · ARB · RH", 1006, 23, "#62cffa");
  left("Matching only. Ink/Arc and unverified prices excluded.", 1050, 19);
  left(partial || metrics.estimatedSales > 0
    ? "Estimated · partial history or fees may be missing"
    : "Based on matched transactions in available indexed history", 1090, 18);
  left("USD = current spot value, not historical trade-time profit.", 1123, 18);
}

export function WalletOverallCard({ events, wallet, partial, spot }: {
  events: TradeEvent[]; wallet: string | null; partial: boolean; spot: EthUsdSpot | null;
}) {
  const summary = useMemo(() => summarizeOverallWalletPnl(events, wallet), [events, wallet]);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = wallet || "Multiple wallets";
  const name = safeCardName(customName || profileName || fallback, fallback);
  const pnl = ethLabel(summary.realizedEth);
  const usd = formatEthPnlUsd(summary.realizedEth, spot);

  // Public account lookup is optional and NEVER controls financial matching.
  useEffect(() => {
    let active = true;
    setProfileName(null);
    setAvatarUrl(null);
    if (!wallet) return;
    void (async () => {
      try {
        const response = await fetch("/api/opensea/profile?address=" + encodeURIComponent(wallet));
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("profile" in data)) return;
        const profile = data.profile;
        if (!profile || typeof profile !== "object") return;
        const fields = profile as Record<string, unknown>;
        const label = typeof fields.username === "string" && fields.username.trim()
          ? fields.username : typeof fields.displayName === "string" ? fields.displayName : null;
        const image = typeof fields.avatar === "string" && fields.avatar.startsWith("https://")
          ? fields.avatar : null;
        if (active) {
          setProfileName(label ? safeCardName(label, wallet) : null);
          setAvatarUrl(image);
        }
      } catch { /* Wallet address remains a valid display fallback. */ }
    })();
    return () => { active = false; };
  }, [wallet]);

  useEffect(() => {
    if (!expanded || !canvas.current) return;
    try { drawOverallCard(canvas.current, name, wallet, summary, spot, partial); }
    catch { setNotice("Unable to render overall PnL preview."); }
  }, [expanded, name, wallet, summary, spot, partial]);

  useEffect(() => {
    if (!expanded) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [expanded]);

  async function save(share: boolean) {
    const target = canvas.current;
    if (!target) return;
    setNotice(""); setExporting(true);
    try {
      drawOverallCard(target, name, wallet, summary, spot, partial);
      const blob = await new Promise<Blob>((resolve, reject) => target.toBlob(
        image => image ? resolve(image) : reject(new Error("PNG export failed.")), "image/png"));
      const filename = "sentinel-overall-" +
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36) + ".png";
      const file = new File([blob], filename, { type: "image/png" });
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sentinel Overall NFT PnL" });
      } else {
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        if (share) setNotice("PNG downloaded. Attach it to your post to share.");
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setNotice(cause instanceof Error ? cause.message : "Unable to export image.");
    } finally { setExporting(false); }
  }
  function shareX() {
    const post = name + " · Matched NFT PnL " + pnl +
      (usd ? " (" + usd + " at current ETH/USD)" : "") +
      " · Estimated, partial on-chain history · via Sentinel NFT PnL";
    window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(post), "_blank", "noopener,noreferrer");
  }

  return <>
    <section className="wallet-overall-summary" aria-label="Overall matched NFT PnL for scanned wallet">
      <div className="wallet-overall-identity">
        <div className="wallet-overall-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" onError={e => { e.currentTarget.style.display = "none"; }}/> :
            <span>◈</span>}
        </div>
        <div className="wallet-overall-name">
          <span className="wallet-overall-eyebrow">OVERALL WALLET PNL</span>
          <strong title={name}>{name}</strong>
          <small title={fallback}>{fallback}</small>
        </div>
      </div>
      <div className="wallet-overall-money" title="Matched ETH/WETH realized PnL, with incomplete history/fees possible">
        <strong className={summary.realizedEth === null ? "unknown" :
          Number(summary.realizedEth) < 0 ? "negative" : "positive"}>{pnl}</strong>
        <span>{usd ? "(" + usd + ")" : "(USD unavailable)"} <small>spot</small></span>
        <small>{summary.matchedSales} matched sales · {summary.unknownBasisSales} unknown basis</small>
      </div>
      <div className="wallet-overall-actions">
        <button type="button" onClick={() => { setNotice(""); setExpanded(true); }}>
          <Share2 size={17}/> Overall PnL Card <ExternalLink size={15}/>
        </button>
      </div>
    </section>
    {expanded && <div className="scan-modal-backdrop" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) setExpanded(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Overall wallet PnL card editor"
        className="scan-detail-modal studio-modal wallet-overall-dialog">
        <div className="scan-modal-head"><div><span>OVERALL WALLET</span><h2>Share Your PnL</h2></div>
          <button type="button" className="scan-modal-close" aria-label="Close overall wallet card"
            onClick={() => setExpanded(false)}><X size={20}/></button>
        </div>
        <label className="wallet-overall-edit"><Pencil size={16}/> Card display name
          <input value={customName} maxLength={48}
            onChange={e => setCustomName(e.target.value)}
            placeholder={profileName || fallback}/>
        </label>
        <p className="wallet-overall-source">
          {profileName ? "Default name from public OpenSea profile. " : "Default name is the scanned wallet address. "}
          The label is editable; it does not change ownership or PnL calculation.
        </p>
        <div className="studio-rendered wallet-overall-canvas">
          <canvas ref={canvas} aria-label="Overall wallet PnL PNG preview"/>
        </div>
        <div className="wallet-overall-export">
          <button type="button" disabled={exporting} onClick={() => void save(false)}>
            <Download size={17}/> Download PNG
          </button>
          <button type="button" disabled={exporting} onClick={() => void save(true)}>
            <Share2 size={17}/> Share Image
          </button>
          <button type="button" onClick={shareX}>Share on X</button>
        </div>
        <p className="wallet-overall-source">
          Only matched sale prices are included; gas/fees may be missing. Ink/Arc pricing,
          unmatched trades and unpriced holdings are excluded. USD uses live spot, not historical FX.
        </p>
        {notice && <p className="studio-notice" role="status">{notice}</p>}
      </div>
    </div>}
  </>;
}
