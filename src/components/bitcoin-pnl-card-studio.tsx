"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Share2, X } from "lucide-react";
import type { DiscoveryAsset } from "@/lib/nft-discovery";
import type { BitcoinPnl } from "@/lib/bitcoin-pnl";
import {
  bitcoinCardShareText, buildBitcoinCardView, type BitcoinCardScope,
  type BitcoinCardView,
} from "@/lib/bitcoin-card";

const W = 1080;
const H = 1350;
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number,
  h: number, radius: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number,
  font: string, color: string, maxWidth?: number) {
  ctx.font = font;
  ctx.fillStyle = color;
  if (maxWidth) ctx.fillText(value, x, y, maxWidth);
  else ctx.fillText(value, x, y);
}
function valueOrUnknown(value: string | null, unit = " BTC"): string {
  return value === null ? "Unknown" : value + unit;
}
function signedBtc(value: string | null): string {
  return value === null ? "Unknown" : (value.startsWith("-") || value === "0.00000000" ? "" : "+") + value + " BTC";
}
function shortTitle(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  let output = value;
  while (ctx.measureText(output).width > maxWidth && output.length > 4) {
    output = output.slice(0, -2).replace(/…$/, "") + "…";
  }
  return output;
}
function drawCard(canvas: HTMLCanvasElement, view: BitcoinCardView, art?: HTMLImageElement) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.textBaseline = "alphabetic";
  const background = ctx.createLinearGradient(0, 0, W, H);
  background.addColorStop(0, "#110c23");
  background.addColorStop(0.52, "#0c0918");
  background.addColorStop(1, "#171026");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#41305b"; ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  rounded(ctx, 65, 65, 67, 67, 18, "#a883ef");
  text(ctx, "S", 88, 114, "800 42px Arial", "#110c23");
  text(ctx, "SENTINEL PNL", 157, 113, "800 36px Arial", "#f2e9ff");
  ctx.textAlign = "right";
  text(ctx, "BITCOIN ORDINALS", W - 72, 110, "700 23px Arial", "#ba9deb");
  ctx.textAlign = "left";

  rounded(ctx, 66, 177, 947, 303, 26, "#1c152e", "#3c2d52");
  if (art) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(91, 202, 254, 254, 19); ctx.clip();
    const scale = Math.max(254 / art.naturalWidth, 254 / art.naturalHeight);
    const iw = art.naturalWidth * scale, ih = art.naturalHeight * scale;
    ctx.drawImage(art, 91 + (254 - iw) / 2, 202 + (254 - ih) / 2, iw, ih);
    ctx.restore();
  } else {
    rounded(ctx, 91, 202, 254, 254, 19, "#302448");
    text(ctx, "₿", 161, 365, "800 142px Arial", "#b69af3");
  }
  text(ctx, view.scope === "wallet" ? "WALLET OVERVIEW" : "COLLECTION", 376, 250,
    "700 23px Arial", "#c7aaf4");
  ctx.font = "800 50px Arial";
  text(ctx, shortTitle(ctx, view.title, 597), 376, 319,
    "800 50px Arial", "#fff8ff");
  text(ctx, view.subtitle, 376, 361, "400 25px Arial", "#c4b6d1", 598);
  text(ctx, "OWNED INSCRIPTIONS", 376, 404, "700 19px Arial", "#aaa0c1");
  text(ctx, String(view.held), 376, 442, "800 39px Arial", "#f2ebff");

  const mainY = 522;
  rounded(ctx, 66, mainY, 947, 231, 24, "#231b36", "#58406f");
  text(ctx, "REALIZED PNL  ·  VERIFIED MATCHES ONLY", 101, mainY + 49, "700 22px Arial", "#c9aaf6");
  const main = signedBtc(view.realizedBtc);
  const mainColor = view.realizedBtc === null ? "#c3b7cf" :
    view.realizedBtc.startsWith("-") ? "#ff9cae" : "#6de6bc";
  const fontSize = main.length > 19 ? 52 : 70;
  ctx.font = "800 " + fontSize + "px Arial";
  text(ctx, shortTitle(ctx, main, 850), 99, mainY + 137,
    "800 " + fontSize + "px Arial", mainColor);
  text(ctx, view.matchedSales + " matched sales · incomplete historical coverage",
    102, mainY + 187, "400 23px Arial", "#b0a3c2");

  rounded(ctx, 66, 780, 463, 181, 22, "#1d172d", "#473750");
  rounded(ctx, 550, 780, 463, 181, 22, "#1d172d", "#473750");
  text(ctx, "UNREALIZED PNL", 97, 827, "700 21px Arial", "#bca7dc");
  text(ctx, "FLOOR ESTIMATE · PARTIAL", 97, 850, "400 17px Arial", "#8d82a2");
  text(ctx, signedBtc(view.unrealizedBtc), 97, 924, "800 37px Arial", "#f4edff", 413);
  text(ctx, "REALIZED ROI", 582, 827, "700 21px Arial", "#bca7dc");
  text(ctx, "MATCHED PURCHASE COSTS ONLY", 582, 850, "400 17px Arial", "#8d82a2");
  text(ctx, view.roiPct === null ? "Unknown" : view.roiPct.toFixed(2) + "%",
    582, 924, "800 45px Arial", "#f4edff", 411);

  rounded(ctx, 66, 988, 947, 144, 20, "#171225", "#3a2e4b");
  text(ctx, "DATA COVERAGE", 95, 1031, "700 20px Arial", "#ac97cf");
  text(ctx, view.pricedHoldings + " holdings with priced basis + floor", 95, 1072, "500 23px Arial", "#efe6f8", 850);
  text(ctx, view.unknownBasisSales + " sales with unknown cost basis", 95, 1104, "400 20px Arial", "#b5aac3", 850);

  text(ctx, "WALLET", 71, 1201, "700 18px Arial", "#af9bc7");
  text(ctx, view.walletLabel, 71, 1238, "600 25px Arial", "#e8ddf4");
  ctx.textAlign = "right";
  text(ctx, view.priceStatus, 1001, 1202, "700 20px Arial", "#c5a3f4");
  text(ctx, "READ-ONLY · NOT A COMPLETE LEDGER", 1001, 1237,
    "600 17px Arial", "#b4a4c9");
  ctx.textAlign = "left";
  text(ctx, "Unknown means historical purchase/sale price could not be verified.",
    70, 1296, "400 17px Arial", "#988bad", 933);
}
async function decodedArtwork(src: string): Promise<HTMLImageElement | null> {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return null;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = url.toString();
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("Artwork timeout")), 3500)),
    ]);
    return img;
  } catch {
    // Third-party images often disallow canvas CORS; keep a working card with a placeholder.
    return null;
  }
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const element = document.createElement("a");
  element.href = url; element.download = name;
  document.body.appendChild(element); element.click(); element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function BitcoinPnlCardStudio({ address, assets, report, partial, onBack }: {
  address: string;
  assets: DiscoveryAsset[];
  report: BitcoinPnl;
  partial: boolean;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scope, setScope] = useState<BitcoinCardScope>("wallet");
  const [slug, setSlug] = useState(report.collections[0]?.slug || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const view = useMemo(() => buildBitcoinCardView(address, assets, report,
    scope, slug, partial), [address, assets, report, scope, slug, partial]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    drawCard(canvas, view);
    if (view.imageUrl) void decodedArtwork(view.imageUrl).then(img => {
      if (!cancelled && img) drawCard(canvas, view, img);
    });
    return () => { cancelled = true; };
  }, [view]);
  async function shareOrSave(share: boolean) {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const blob = await canvasBlob(canvas);
      const filename = "sentinel-btc-" +
        (scope === "wallet" ? "wallet" : slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60)) + ".png";
      if (share && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Sentinel BTC Ordinals" });
          return;
        }
      }
      downloadBlob(blob, filename);
      if (share) setNotice("Image downloaded. Attach the PNG manually to your post.");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setNotice("Image export failed. Try again.");
    } finally { setBusy(false); }
  }
  function shareX() {
    const url = "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(bitcoinCardShareText(view));
    window.open(url, "_blank", "noopener,noreferrer");
    setNotice("X opens with text only. Download or share the PNG separately.");
  }
  return <div className="scan-modal-backdrop" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onBack(); }}>
    <div className="scan-detail-modal studio-modal bitcoin-card-dialog" role="dialog"
      aria-modal="true" aria-label="Bitcoin Ordinals PnL card studio">
      <div className="scan-modal-head">
        <div><span>BITCOIN ORDINALS</span><h2>Sentinel PnL Cards</h2></div>
        <button type="button" className="scan-modal-close" aria-label="Close BTC card"
          onClick={onBack}><X size={20}/></button>
      </div>
      <button type="button" className="studio-back" onClick={onBack}>
        <ArrowLeft size={17}/> Back to Bitcoin scan
      </button>
      <div className="bitcoin-card-options" role="group" aria-label="Bitcoin PnL card scope">
        <div className="studio-segment">
          <button type="button" className={scope === "wallet" ? "active" : ""}
            onClick={() => setScope("wallet")}>Wallet overview</button>
          <button type="button" disabled={!report.collections.length}
            className={scope === "collection" ? "active" : ""}
            onClick={() => setScope("collection")}>Collection</button>
        </div>
        {scope === "collection" && <label>
          Collection
          <select value={slug} onChange={event => setSlug(event.target.value)}>
            {report.collections.map(row => <option key={row.slug} value={row.slug}>{row.slug}</option>)}
          </select>
        </label>}
      </div>
      <div className="studio-choice-bar">
        <div className="studio-controls">
          <button type="button" className="studio-x" onClick={shareX}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"
              aria-hidden="true" focusable="false">
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.64 7.584H.473l8.6-9.83L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.494h2.039L6.486 3.244H4.298l13.313 17.403Z"/>
            </svg>
            Share on X
          </button>
        </div>
      </div>
      <button type="button" className="studio-download" disabled={busy}
        onClick={() => void shareOrSave(false)}>
        <Download size={18}/>{busy ? "Preparing…" : "Download PNG"}
      </button>
      <div className="studio-rendered">
        <canvas ref={canvasRef} aria-label="Bitcoin Ordinals PnL card preview"/>
      </div>
      <div className="studio-export-actions">
        <button type="button" disabled={busy} onClick={() => void shareOrSave(true)}>
          <Share2 size={16}/> Share image
        </button>
      </div>
      <p className="studio-caveat">
        This card covers only the scanned public BTC address. Historical sale data,
        costs and market floors may be incomplete. Unknown is not zero.
        Ordiscan-only scans do not imply verified buy or sale prices.
      </p>
      {notice && <p className="studio-notice" role="status">{notice}</p>}
    </div>
  </div>;
}