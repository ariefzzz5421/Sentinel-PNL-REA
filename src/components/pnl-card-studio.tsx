"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, Share2 } from "lucide-react";
import type { CalculatedTrade } from "@/lib/pnl/calculate";
import type { Chain } from "@/lib/schema";
import { scanChainById } from "@/lib/scan-chains";

export type StudioCollection = {
  name: string; chain: Chain; bought: number; sold: number; minted: number; transfersIn: number; held: number | null;
  image: string | null; pnl: string | null; trades: CalculatedTrade[];
};
type StudioMode = "complete" | "simple";
type CardSize = "fixed" | "image";
type FontChoice = "space" | "satoshi" | "plex" | "oswald" | "orbitron";
const fonts: Record<FontChoice, string> = {
  space: '"Space Grotesk", Arial, sans-serif',
  satoshi: 'Satoshi, "Inter", Arial, sans-serif',
  plex: '"IBM Plex Mono", monospace',
  oswald: 'Oswald, "Arial Narrow", sans-serif',
  orbitron: 'Orbitron, Arial, sans-serif',
};
function shortName(value: string, length: number) {
  return value.length > length ? value.slice(0, length - 1) + "…" : value;
}
function fmt(n: number | null, unit: "ETH" | "USD" | ""): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const digits = unit === "USD" ? 2 : 4;
  return (n > 0 ? "+" : "") + n.toFixed(digits);
}
function fileDownload(blob: Blob, filename: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not generate PNG.")), "image/png",
  ));
}
const imageCache = new Map<string, Promise<HTMLImageElement>>();
async function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  const cached = !src.startsWith("blob:") && imageCache.get(src);
  if (cached) return cached;
  const task = loadUncachedImage(src);
  if (!src.startsWith("blob:")) {
    if (imageCache.size > 35) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(src, task);
    void task.catch(() => imageCache.delete(src));
  }
  return task;
}
async function loadUncachedImage(src: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) {
  const factor = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = img.naturalWidth * factor, h = img.naturalHeight * factor;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}
export function PnlCardStudio({ row, wallet, partial, onBack }: {
  row: StudioCollection; wallet: string | null; partial: boolean; onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<StudioMode>("complete");
  const [quote, setQuote] = useState<number | null>(null);
  const [quoteAt, setQuoteAt] = useState<string | null>(null);
  const renderSerial = useRef(0);
  const [alias, setAlias] = useState("");
  const [background, setBackground] = useState<string | null>(null);
  const [backgroundRatio, setBackgroundRatio] = useState(1200 / 700);
  const [cardSize, setCardSize] = useState<CardSize>("fixed");
  const [font, setFont] = useState<FontChoice>("oswald");
  const [aliasSize, setAliasSize] = useState(25);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const metrics = useMemo(() => {
    const buys = row.trades.filter((t) => t.type === "buy");
    const sells = row.trades.filter((t) => t.type === "sell");
    const realized = sells.filter((t) => t.realizedEth !== null);
    const totalBuy = buys.reduce((n, t) => n + Number(t.amountEth), 0);
    const totalSell = sells.reduce((n, t) => n + Number(t.amountEth), 0);
    const matchedCost = realized.reduce((n, t) => n + Number(t.costEth || 0), 0);
    const matchedProfit = realized.reduce((n, t) => n + Number(t.realizedEth || 0), 0);
    return {
      avgBuy: buys.length ? totalBuy / buys.length : null,
      avgSale: sells.length ? totalSell / sells.length : null,
      invested: buys.length ? totalBuy : null,
      sales: sells.length ? totalSell : null,
      roi: matchedCost > 0 ? (matchedProfit / matchedCost) * 100 : null,
      matched: realized.length,
    };
  }, [row.trades]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/market/eth-usd", { cache: "no-store" });
        if (!response.ok) throw new Error("FX feed offline");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("usd" in data) || typeof data.usd !== "number"
          || !Number.isFinite(data.usd) || data.usd <= 0) throw new Error("Invalid FX quote");
        const timestamp = "updatedAt" in data && typeof data.updatedAt === "string" ? data.updatedAt : null;
        if (!timestamp || Number.isNaN(Date.parse(timestamp)) ||
          Math.abs(Date.now() - Date.parse(timestamp)) > 10 * 60_000) throw new Error("Stale FX quote");
        if (active) { setQuote(data.usd); setQuoteAt(timestamp); }
      } catch {
        if (active) { setQuote(null); setQuoteAt(null); }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 90_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!background) return;
    return () => { if (background.startsWith("blob:")) URL.revokeObjectURL(background); };
  }, [background]);

  // Keep ETH as the native unit; USD is a spot-rate annotation only.
  const profit = row.pnl === null ? null : Number(row.pnl);
  const pairedValue = profit === null || quote === null ? null : profit * quote;
  const aliasText = alias.trim().slice(0, 32);
  const walletLabel = wallet || "Multiple public wallets";
  // Portrait-oriented card so native text remains readable after scaling to phone width.
  const fixedHeight = mode === "complete" ? 1200 : 760;
  const imageHeight = cardSize === "image" && background
    ? Math.round(900 / Math.max(0.55, Math.min(1.8, backgroundRatio)))
    : fixedHeight;
  const canvasHeight = Math.max(fixedHeight, imageHeight);

  async function render(target: HTMLCanvasElement) {
    const renderId = ++renderSerial.current;
    const buffer = document.createElement("canvas");
    buffer.width = 900;
    buffer.height = canvasHeight;
    const context = buffer.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    const c: CanvasRenderingContext2D = context;
    const w = buffer.width, h = buffer.height;
    const family = fonts[font];

    try {
      await Promise.all([
        document.fonts.load("700 46px " + family.split(",")[0]),
        document.fonts.load("700 46px " + fonts.plex.split(",")[0]),
      ]);
    } catch { /* Native fallback fonts stay available. */ }

    const grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#120e1e"); grad.addColorStop(1, "#241530");
    c.fillStyle = grad; c.fillRect(0, 0, w, h);
    if (background) {
      try { cover(c, await loadCanvasImage(background), w, h); }
      catch { /* Unsupported or revoked custom art is ignored safely. */ }
    }
    c.fillStyle = "rgba(7,6,16,.90)";
    c.fillRect(20, 20, w - 40, h - 40);
    c.strokeStyle = "#594475"; c.lineWidth = 2;
    c.strokeRect(20, 20, w - 40, h - 40);

    // Sentinel signature moves to the top-right; larger but clear of collection details.
    const sentinelSize = 54;
    const sentinelX = w - 50 - sentinelSize;
    const sentinelY = 43;
    try {
      c.drawImage(await loadCanvasImage("/sentinel-logo.svg"), sentinelX, sentinelY, sentinelSize, sentinelSize);
    } catch {
      c.textAlign = "right"; c.font = "bold 37px Arial"; c.fillStyle = "#ad85e8";
      c.fillText("◈", w - 52, sentinelY + 39); c.textAlign = "left";
    }

    // 26% larger cover-cropped NFT preview; still within the header/divider bounds.
    const avatarX = 53, avatarY = 113, avatarSide = 126;
    const collectionTextX = avatarX + avatarSide + 20;
    if (row.image) {
      try {
        const artwork = await loadCanvasImage(row.image);
        c.save();
        c.beginPath(); c.roundRect(avatarX, avatarY, avatarSide, avatarSide, 16); c.clip();
        c.translate(avatarX, avatarY);
        cover(c, artwork, avatarSide, avatarSide);
        c.restore();
      } catch {
        c.fillStyle = "#25203a"; c.beginPath();
        c.roundRect(avatarX, avatarY, avatarSide, avatarSide, 16); c.fill();
      }
    } else {
      c.fillStyle = "#262039"; c.beginPath();
      c.roundRect(avatarX, avatarY, avatarSide, avatarSide, 16); c.fill();
    }
    c.textAlign = "left";
    c.fillStyle = "#f9f5ff";
    c.font = "bold 43px " + family;
    c.fillText(shortName(row.name, 25), collectionTextX, 170, w - collectionTextX - 53);
    const chainName = row.chain.toUpperCase();
    try {
      c.drawImage(await loadCanvasImage(scanChainById(row.chain).icon), collectionTextX, 187, 22, 22);
    } catch { /* Chain text remains readable when the image fails. */ }
    c.fillStyle = "#64cfff"; c.font = "bold 21px Arial";
    c.fillText(chainName, collectionTextX + 30, 205);

    const divider = (y: number) => {
      c.strokeStyle = "#443350"; c.lineWidth = 2; c.beginPath();
      c.moveTo(54, y); c.lineTo(w - 54, y); c.stroke();
    };
    const metricRow = (label: string, value: string, y: number, color = "#f7f2ff", usd: number | null = null) => {
      c.textAlign = "left"; c.font = "600 25px " + family;
      c.fillStyle = "#ada2bd"; c.fillText(label, 55, y, 400);
      const dollars = usd === null ? "" : " (" + (usd < 0 ? "-$" : "$") + Math.abs(usd).toFixed(2) + ")";
      c.textAlign = "right"; c.fillStyle = color; c.font = "bold 29px " + fonts.plex;
      c.fillText(value + dollars, w - 55, y, 475);
      c.textAlign = "left";
    };
    const totalUsd = (amount: number | null) => amount === null || quote === null ? null : amount * quote;
    const totalEth = (amount: number | null) => amount === null ? "—" : amount.toFixed(4);
    const pnlColor = profit === null ? "#bfb3d1" : profit < 0 ? "#ff8296" : "#35e1aa";
    const mainPnl = profit === null ? "—" : fmt(profit, "ETH") + " ETH";
    const secondary = pairedValue === null ? "" : " (" +
      (pairedValue < 0 ? "-$" : "$") +
      Math.abs(pairedValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ")";
    const printPnl = (y: number, maxWidth: number) => {
      c.fillStyle = pnlColor;
      c.textAlign = "left";
      c.font = "bold 50px " + fonts.plex;
      c.fillText(mainPnl + secondary, 55, y, maxWidth);
    };

    divider(258);
    if (mode === "complete") {
      metricRow("MINTED", String(row.minted), 320);
      metricRow("BOUGHT", String(row.bought), 376);
      metricRow("SOLD", String(row.sold), 432);
      metricRow("HOLD", row.held === null ? "—" : String(row.held), 488);
      metricRow("TRANSFER IN", String(row.transfersIn), 544);
      divider(570);
      metricRow("AVG BUY", totalEth(metrics.avgBuy), 636, "#ff8296", totalUsd(metrics.avgBuy));
      metricRow("AVG SALE", totalEth(metrics.avgSale), 696, "#38dcb0", totalUsd(metrics.avgSale));
      divider(726);
      metricRow("TOTAL INVESTED", totalEth(metrics.invested), 791, "#f7f2ff", totalUsd(metrics.invested));
      metricRow("TOTAL SALES", totalEth(metrics.sales), 854, "#f7f2ff", totalUsd(metrics.sales));
      divider(886);
      c.fillStyle = "#ada2bd"; c.font = "500 25px " + family;
      c.fillText("REALIZED PROFIT", 55, 942);
      c.font = "bold 30px " + fonts.plex; c.fillStyle = pnlColor;
      const roiText = metrics.roi === null ? "ROI —" :
        (metrics.roi > 0 ? "+" : "") + metrics.roi.toFixed(2) + "%";
      c.fillText(roiText, 55, 994);
      printPnl(1064, w - 110);
    } else {
      metricRow("BOUGHT", String(row.bought), 325);
      metricRow("SOLD", String(row.sold), 385);
      metricRow("HOLD", row.held === null ? "—" : String(row.held), 445);
      divider(480);
      c.fillStyle = "#ada2bd"; c.font = "500 25px " + family;
      c.fillText("REALIZED PROFIT", 55, 531);
      printPnl(601, w - 110);
    }

    // Optional nickname sits above wallet identifier; footer scales with Fit image.
    if (aliasText) {
      c.fillStyle = "#d9c0ed"; c.font = "bold " + aliasSize + "px " + family;
      c.fillText("@" + aliasText.replace(/^@/, ""), 54, h - 94, w - 108);
    }
    c.font = "20px " + fonts.plex; c.fillStyle = "#a89eb9";
    c.fillText(walletLabel, 54, h - 52, w - 108);

    if (renderId !== renderSerial.current) return false;
    target.width = w; target.height = h;
    const resultContext = target.getContext("2d");
    if (!resultContext) throw new Error("Card preview unavailable");
    resultContext.drawImage(buffer, 0, 0);
    return true;
  }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timer = window.setTimeout(() => void render(canvas).catch(() => setNotice("Cannot draw card preview.")), 75);
    return () => window.clearTimeout(timer);
    // Render depends on every visible card setting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, mode, quote, background, canvasHeight, font, aliasSize, alias]);

  async function save(share: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true); setNotice("");
    try {
      const complete = await render(canvas);
      if (!complete) throw new Error("Preview changed during export. Try again.");
      const blob = await blobFromCanvas(canvas);
      const file = new File([blob], "sentinel-" + row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".png", { type: "image/png" });
      if (share && navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: "Sentinel PnL · " + row.name, files: [file] });
      } else {
        fileDownload(blob, file.name);
        if (share) setNotice("Image downloaded. Attach it to your post or message.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setNotice(e instanceof Error ? e.message : "Unable to export PNG.");
    } finally { setBusy(false); }
  }
  function openX() {
    const text = row.name + " · Estimated realized NFT PnL " + (profit === null ? "unavailable" : fmt(profit, "ETH") + " ETH") +
      "\nGenerated with Sentinel PNL · partial historical coverage may apply.";
    const url = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");
    setNotice("X opened with your text. Download the card and attach the PNG manually; X does not accept image attachments via share-intent URL.");
  }
  async function chooseImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      setNotice("Choose a PNG, JPG or WebP image under 5 MB."); return;
    }
    const src = URL.createObjectURL(file);
    try {
      const img = await loadCanvasImage(src);
      setBackgroundRatio(img.naturalWidth / img.naturalHeight);
      setBackground(src); setNotice("");
    } catch { URL.revokeObjectURL(src); setNotice("Could not load background image."); }
  }

  return <div className="pnl-studio">
    <button type="button" className="studio-back" onClick={onBack}><ArrowLeft size={17}/> Back to trades</button>
    <div className="studio-choice-bar">
      <div className="studio-segment" role="group" aria-label="PnL card detail level">
        <button type="button" className={mode === "complete" ? "active" : ""} onClick={() => setMode("complete")}>Complete</button>
        <button type="button" className={mode === "simple" ? "active" : ""} onClick={() => setMode("simple")}>Simple</button>
      </div>
      <div className="studio-controls">
        <button type="button" className="studio-x" onClick={openX}>Share on X</button>
      </div>
    </div>
    <button type="button" className="studio-download" disabled={busy} onClick={() => void save(false)}><Download size={18}/> {busy ? "Preparing…" : "Download PNG"}</button>
    <div className="studio-rendered"><canvas ref={canvasRef} aria-label="Sentinel PnL card preview"/></div>

    <div className="studio-export-actions"><button type="button" disabled={busy} onClick={() => void save(true)}><Share2 size={16}/> Share image</button></div>
    <details className="studio-custom" open>
      <summary>Customize card</summary>
      <div className="studio-fields">
        <label>Alias <input type="text" maxLength={32} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="@alias"/></label>
        <div><span>Background</span><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void chooseImage(e.target.files?.[0])}/>
          <div className="studio-control-row"><button type="button" onClick={() => uploadRef.current?.click()}><ImagePlus size={15}/> Choose image</button>
            {background && <button type="button" onClick={() => setBackground(null)}>Reset</button>}</div>
        </div>
        <div><span>Card size</span><div className="studio-segment"><button type="button" className={cardSize === "fixed" ? "active" : ""} onClick={() => setCardSize("fixed")}>Fixed</button>
          <button type="button" disabled={!background} className={cardSize === "image" ? "active" : ""} onClick={() => setCardSize("image")}>Fit image</button></div></div>
        <label>Font <select value={font} onChange={(e) => setFont(e.target.value as FontChoice)}>
          <option value="oswald">Oswald</option><option value="space">Space Grotesk</option><option value="satoshi">Satoshi</option><option value="plex">IBM Plex Mono</option><option value="orbitron">Orbitron</option>
        </select></label>
        <label>Alias size <div className="studio-range"><input type="range" min="16" max="42" value={aliasSize} onChange={(e) => setAliasSize(Number(e.target.value))}/><span>{aliasSize}px</span></div></label>
      </div>
    </details>
    <p className="studio-caveat">NFT profit is estimated when historical mint cost, gas, or marketplace fees are missing. USD uses the current market rate, not the historical transaction rate. {quoteAt ? `FX updated ${new Date(quoteAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.` : "Live FX unavailable."}</p>
    {notice && <p className="studio-notice" role="status">{notice}</p>}
  </div>;
}
