"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Share2, Pencil, X, ExternalLink, ImagePlus, RotateCcw } from "lucide-react";
import Image from "next/image";
import type { TradeEvent } from "@/lib/schema";
import type { EthUsdSpot } from "@/lib/eth-usd-spot";
import { formatEthPnlUsd } from "@/lib/eth-usd-spot";
import { safeCardName, summarizeOverallWalletPnl } from "@/lib/overall-wallet-pnl";

function ethLabel(value: string | null): string {
  if (value === null) return "Unknown";
  const n = Number(value);
  return Number.isFinite(n) ? (n > 0 ? "+" : "") + n.toFixed(4) + " ETH" : "Unknown";
}

type OverallMetrics = ReturnType<typeof summarizeOverallWalletPnl>;
type RenderAssets = { profile: HTMLImageElement | null; logo: HTMLImageElement | null };

async function loadCardImage(source: string | null): Promise<HTMLImageElement | null> {
  if (!source) return null;
  try {
    // A user-selected raster image is stored locally as a data URL.
    // Never allow SVG/HTML or arbitrary data URLs in the export canvas.
    const localRaster = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source) &&
      source.length <= 6_000_000;
    if (source.startsWith("data:") && !localRaster) return null;
    const url = localRaster ? null : new URL(source, window.location.origin);
    if (url && url.origin !== window.location.origin && url.protocol !== "https:") return null;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.src = localRaster ? source : url!.href;
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => window.setTimeout(
        () => reject(new Error("Image decode timeout")), 3500)),
    ]);
    return image;
  } catch {
    // A remote provider may disallow canvas CORS; render a stable avatar fallback.
    return null;
  }
}
async function loadCardAssets(avatarUrl: string | null): Promise<RenderAssets> {
  const [profile, logo] = await Promise.all([
    loadCardImage(avatarUrl), loadCardImage("/sentinel-logo.svg"),
  ]);
  return { profile, logo };
}
function drawOverallCard(
  canvas: HTMLCanvasElement, name: string, address: string | null,
  metrics: OverallMetrics, spot: EthUsdSpot | null, assets: RenderAssets,
) {
  const W = 1000, H = 1000;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  ctx.textBaseline = "alphabetic";
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0c0a1a");
  bg.addColorStop(1, "#20142e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#695083";
  ctx.strokeRect(26, 26, W - 52, H - 52);

  const text = (label: string, x: number, y: number, size: number,
    color: string, weight = 700, width?: number, align: CanvasTextAlign = "left") => {
    ctx.font = weight + " " + size + 'px "Space Grotesk", Arial, sans-serif';
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(label, x, y, width);
  };
  const rule = (y: number) => {
    ctx.beginPath();
    ctx.strokeStyle = "#453451";
    ctx.moveTo(70, y);
    ctx.lineTo(930, y);
    ctx.stroke();
  };
  // OpenSea PFP: preserve aspect ratio with a rounded image crop.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(70, 88, 126, 126, 24);
  ctx.clip();
  ctx.fillStyle = "#302345";
  ctx.fillRect(70, 88, 126, 126);
  if (assets.profile) {
    const photo = assets.profile;
    const scale = Math.max(126 / photo.naturalWidth, 126 / photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    ctx.drawImage(photo, 70 + (126 - w) / 2, 88 + (126 - h) / 2, w, h);
  } else {
    text(name.slice(0, 1).toUpperCase() || "?", 133, 168, 64, "#c6a9ef", 800, 120, "center");
  }
  ctx.restore();
  // Use the project's actual logo asset; no artificial Sentinel heading.
  if (assets.logo) ctx.drawImage(assets.logo, 867, 84, 58, 61);
  ctx.font = '800 47px "Space Grotesk", Arial, sans-serif';
  text(safeCardName(name, address || "Multiple wallets"), 225, 156, 47, "#f7f1ff", 800, 600);
  const addressLabel = address || "Multiple public wallets";
  text(addressLabel, 227, 202, 21, "#a9a0be", 500, 680);
  rule(264);

  text("REALIZED PNL • ETH", 72, 325, 26, "#c2abd8", 800);
  const pnl = ethLabel(metrics.realizedEth);
  const usd = formatEthPnlUsd(metrics.realizedEth, spot);
  const negative = metrics.realizedEth !== null && Number(metrics.realizedEth) < 0;
  const positive = metrics.realizedEth !== null && !negative;
  const pnlColor = metrics.realizedEth === null ? "#bbb0ce" : positive ? "#39dbb2" : "#ff8ea3";
  // Same typography and size for the ETH and USD display values.
  text(pnl, 72, 405, 57, pnlColor, 800, 856);
  text(usd === null ? "USD unavailable" : "(" + usd + ")", 72, 478, 57,
    usd === null ? "#9a90ac" : pnlColor, 800, 856);
  rule(532);

  const stats = [
    ["BOUGHT", metrics.bought],
    ["SOLD", metrics.sold],
    ["MATCHED SALES", metrics.matchedSales],
  ] as const;
  stats.forEach(([label, count], index) => {
    const y = 638 + index * 104;
    text(label, 74, y, 32, "#b7aac8", 800);
    text(count.toLocaleString("en-US"), 924, y, 38, "#fff9ff", 800, 330, "right");
    if (index < stats.length - 1) rule(y + 39);
  });
}

export function WalletOverallCard({ events, wallet, partial, spot }: {
  events: TradeEvent[]; wallet: string | null; partial: boolean; spot: EthUsdSpot | null;
}) {
  const summary = useMemo(() => summarizeOverallWalletPnl(events, wallet), [events, wallet]);
  const [profile, setProfile] = useState<{ wallet: string; name: string | null; avatarUrl: string | null } | null>(null);
  // Async responses from an old scan must never label a different wallet.
  const currentProfile = profile?.wallet.toLowerCase() === wallet?.toLowerCase() ? profile : null;
  const profileName = currentProfile?.name || null;
  const avatarUrl = currentProfile?.avatarUrl || null;
  const [customName, setCustomName] = useState("");
  const [customAvatar, setCustomAvatar] = useState<{ wallet: string | null; dataUrl: string } | null>(null);
  const avatarFileInput = useRef<HTMLInputElement>(null);
  // Do not reuse a custom photo when the user scans a different wallet.
  const customAvatarUrl = customAvatar?.wallet === wallet ? customAvatar.dataUrl : null;
  const effectiveAvatarUrl = customAvatarUrl || avatarUrl;
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
        if (active) setProfile({ wallet, name: label ? safeCardName(label, wallet) : null, avatarUrl: image });
      } catch { /* Wallet address remains a valid display fallback. */ }
    })();
    return () => { active = false; };
  }, [wallet]);

  useEffect(() => {
    if (!expanded || !canvas.current) return;
    let active = true;
    const target = canvas.current;
    void loadCardAssets(effectiveAvatarUrl).then(assets => {
      if (active) drawOverallCard(target, name, wallet, summary, spot, assets);
    }).catch(() => { /* Export action surfaces graphics errors. */ });
    return () => { active = false; };
  }, [expanded, name, wallet, summary, spot, effectiveAvatarUrl]);

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
      const assets = await loadCardAssets(effectiveAvatarUrl);
      drawOverallCard(target, name, wallet, summary, spot, assets);
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
  function onAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setNotice("Please choose a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024 || file.size === 0) {
      setNotice("PFP must be a non-empty image smaller than 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" ||
          !reader.result.startsWith("data:" + file.type + ";base64,")) {
        setNotice("The uploaded image could not be read.");
        return;
      }
      setCustomAvatar({ wallet, dataUrl: reader.result });
      setNotice("");
    };
    reader.onerror = () => setNotice("Could not read the selected PFP.");
    reader.readAsDataURL(file);
  }

  function shareX() {
    const post = name + " · Realized NFT PnL " + pnl +
      (usd ? " (" + usd + " at current ETH/USD)" : "") +
      " · Estimated, partial on-chain history · via Sentinel NFT PnL";
    window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(post), "_blank", "noopener,noreferrer");
  }

  return <>
    <section className="wallet-overall-summary" aria-label="Overall matched NFT PnL for scanned wallet"
      title={partial ? "Results are partial: some trades or network fees may not be indexed." : "Based on matched indexed NFT trades; fees may be incomplete."}>
      <div className="wallet-overall-identity">
        <div className="wallet-overall-avatar" aria-hidden="true">
          {avatarUrl ? <Image unoptimized src={avatarUrl} width={54} height={54} alt="OpenSea public profile avatar"/> :
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
        <span>{usd ? "(" + usd + ")" : "USD unavailable"}</span>
        <small>{summary.matchedSales} matched sales</small>
      </div>
      <div className="wallet-overall-actions">
        <button type="button" onClick={() => { setNotice(""); setExpanded(true); }}>
          <span className="wallet-overall-action-label">
            <Share2 size={18} aria-hidden="true"/>
            <span>Overall PnL Card</span>
          </span>
          <ExternalLink size={17} aria-hidden="true"/>
        </button>
      </div>
      <details className="wallet-overall-audit"
        title={summary.netReconciled
          ? "Reconciled matched ETH/WETH sales only. Missing fees, history, or acquisition basis may affect the total. USD uses current spot."
          : "Ledger reconciliation failed; the net amount is withheld."}>
        <summary>Verify PnL calculation</summary>
        <div className="wallet-overall-audit-grid">
          <span>Matched sale profits</span><strong>{summary.grossProfitsEth} ETH</strong>
          <span>Matched sale losses</span><strong>-{summary.grossLossesEth} ETH</strong>
          <span>Net realized PnL</span><strong>{summary.realizedEth ?? "Unknown"} ETH</strong>
          <span>Matched sales</span><strong>{summary.matchedSales}</strong>
          <span>Unmatched sale basis</span><strong>{summary.unknownBasisSales}</strong>
        </div>
      </details>
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
        <div className="wallet-overall-avatar-tools">
          <div className="wallet-overall-avatar-preview" aria-label="Selected card profile image">
            {effectiveAvatarUrl
              ? <Image unoptimized src={effectiveAvatarUrl} width={46} height={46} alt="Card PFP preview"/>
              : <span>{name.slice(0, 1).toUpperCase()}</span>}
          </div>
          <input ref={avatarFileInput} type="file" accept="image/png,image/jpeg,image/webp"
            className="wallet-overall-avatar-input" aria-label="Choose a custom profile image"
            onChange={onAvatarUpload}/>
          <button type="button" className="wallet-overall-avatar-button"
            onClick={() => avatarFileInput.current?.click()}>
            <ImagePlus size={17}/> {customAvatarUrl ? "Change PFP" : "Upload PFP"}
          </button>
          {customAvatarUrl && <button type="button" className="wallet-overall-avatar-reset"
            onClick={() => { setCustomAvatar(null); setNotice(""); }}
            aria-label="Reset to OpenSea profile image">
            <RotateCcw size={15}/> Reset
          </button>}
        </div>
        <div className="studio-rendered wallet-overall-canvas"
          title="Matched priced sales only. Fees, partial history and missing basis can affect realized PnL. USD uses current ETH spot, not trade-time FX.">
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
        {notice && <p className="studio-notice" role="status">{notice}</p>}
      </div>
    </div>}
  </>;
}
