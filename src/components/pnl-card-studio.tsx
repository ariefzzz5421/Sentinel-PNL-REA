"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, Share2 } from "lucide-react";
import type { CalculatedTrade } from "@/lib/pnl/calculate";
import type { Chain } from "@/lib/schema";

export type StudioCollection = {
  name: string; chain: Chain; bought: number; sold: number; held: number | null;
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
async function loadCanvasImage(src: string): Promise<HTMLImageElement> {
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
  const [quoteError, setQuoteError] = useState(false);
  const [unit, setUnit] = useState<"ETH" | "USD">("ETH");
  const [alias, setAlias] = useState("");
  const [background, setBackground] = useState<string | null>(null);
  const [backgroundRatio, setBackgroundRatio] = useState(1200 / 700);
  const [cardSize, setCardSize] = useState<CardSize>("fixed");
  const [font, setFont] = useState<FontChoice>("oswald");
  const [aliasSize, setAliasSize] = useState(25);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const metrics = useMemo(() => {
    const buys = row.trades.filter((t) => t.type === "buy" || t.type === "mint");
    const sells = row.trades.filter((t) => t.type === "sell");
    const realized = sells.filter((t) => t.realizedEth !== null);
    const totalBuy = buys.reduce((n, t) => n + Number(t.amountEth), 0);
    const totalSell = sells.reduce((n, t) => n + Number(t.amountEth), 0);
    const matchedCost = realized.reduce((n, t) => n + Number(t.costEth || 0), 0);
    const matchedProfit = realized.reduce((n, t) => n + Number(t.realizedEth || 0), 0);
    const knownGas = row.trades.every((t) => t.feeKnown !== false);
    return {
      avgBuy: buys.length ? totalBuy / buys.length : null,
      avgSale: sells.length ? totalSell / sells.length : null,
      invested: buys.length ? totalBuy : null,
      sales: sells.length ? totalSell : null,
      roi: matchedCost > 0 ? (matchedProfit / matchedCost) * 100 : null,
      matched: realized.length,
      knownGas,
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
        if (active) { setQuote(data.usd); setQuoteAt(timestamp); setQuoteError(false); }
      } catch {
        if (active) { setQuote(null); setQuoteAt(null); setQuoteError(true); }
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

  const exchange = (n: number | null) => n === null ? null : unit === "USD" && quote ? n * quote : n;
  const coin = unit === "USD" && quote ? "USD" : "ETH";
  const profit = row.pnl === null ? null : exchange(Number(row.pnl));
  const nativePnl = row.pnl === null ? null : Number(row.pnl);
  const pairedValue = nativePnl === null ? null : coin === "ETH" ? (quote ? nativePnl * quote : null) : nativePnl;
  const aliasText = alias.trim().slice(0, 32);
  const walletLabel = wallet && wallet.length > 15 ? wallet.slice(0, 7) + "…" + wallet.slice(-5) : "Public wallet";
  const imageSize = cardSize === "image" && background ? Math.min(1.85, Math.max(0.85, backgroundRatio)) : 1200 / 700;
  const minimumHeight = mode === "complete" ? 1080 : alias.trim() ? 750 : 690;
  const canvasHeight = cardSize === "image" && background ? Math.max(minimumHeight, Math.round(1200 / imageSize)) : minimumHeight;

  async function render(target: HTMLCanvasElement) {
    const id = ++renderSerial.current;
    const buffer = document.createElement("canvas");
    buffer.width = 1200; buffer.height = canvasHeight;
    const context = buffer.getContext("2d");
    if (!context) throw new Error("Canvas unavailable.");
    const c: CanvasRenderingContext2D = context;
    const w = buffer.width, h = buffer.height;
    try { await Promise.all([document.fonts.load("700 52px " + fonts[font].split(",")[0]), document.fonts.load("700 76px " + fonts.plex.split(",")[0])]); } catch { /* Fall back without suppressing export. */ }
    const gradient = c.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#120e1e"); gradient.addColorStop(1, "#27183d");
    c.fillStyle = gradient; c.fillRect(0, 0, w, h);
    if (background) {
      try {
        const img = await loadCanvasImage(background);
        cover(c, img, w, h);
      } catch { /* Invalid or CORS-blocked artwork is omitted from the exported image. */ }
    }
    c.fillStyle = "rgba(7,6,16,.88)"; c.fillRect(36, 36, w - 72, h - 72);
    c.strokeStyle = "#614780"; c.lineWidth = 2; c.strokeRect(36, 36, w - 72, h - 72);
    const fontFamily = fonts[font];
    c.fillStyle = "#ae93ff"; c.font = "bold 27px Arial";
    c.fillText("◈ SENTINEL PNL", 84, 102);
    c.fillStyle = "#67d3ff"; c.font = "bold 24px Arial"; c.textAlign = "right";
    c.fillText(row.chain.toUpperCase(), w - 84, 102); c.textAlign = "left";
    c.fillStyle = "#faf8ff"; c.font = "bold 50px " + fontFamily;
    c.fillText(shortName(row.name, 28), 85, 190, row.image ? 800 : w - 170);
    if (row.image) {
      try {
        const artwork = await loadCanvasImage(row.image);
        const side = 112, x = w - 205, y = 139;
        c.save(); c.beginPath(); c.roundRect(x, y, side, side, 13); c.clip();
        c.translate(x, y); cover(c, artwork, side, side);
        c.restore();
      } catch { /* External artwork may block CORS; never prevent image export. */ }
    }
    if (aliasText) {
      c.font = aliasSize + "px " + fontFamily; c.fillStyle = "#c8bbdc";
      c.fillText("@" + aliasText.replace(/^@/, ""), 86, 237);
    }
    const originY = aliasText ? 310 : 275;
    const rows = [
      ["BOUGHT", String(row.bought)], ["SOLD", String(row.sold)],
      ["HOLD", row.held === null ? "—" : String(row.held)],
    ];
    c.font = "bold 76px " + fonts.plex;
    c.fillStyle = profit === null ? "#c1b4d5" : profit < 0 ? "#ff8192" : "#33dea1";
    const mainValue = profit === null ? "—" : coin === "USD" ? (profit > 0 ? "+$" : profit < 0 ? "-$" : "$") + Math.abs(profit).toFixed(2) : fmt(profit, coin) + " ETH";
    c.fillText(mainValue, 85, originY + 44, 685);
    c.textAlign = "right";
    c.font = "bold 31px " + fonts.plex;
    c.fillStyle = "#d8d0e8";
    const pairedText = pairedValue === null ? (quoteError ? "FX unavailable" : "—") :
      coin === "ETH" ? "≈ " + (pairedValue < 0 ? "-$" : pairedValue > 0 ? "+$" : "$") + Math.abs(pairedValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmt(pairedValue, "ETH") + " ETH";
    c.fillText(pairedText, w - 82, originY + 19, 300);
    c.font = "19px Arial"; c.fillStyle = "#9e93b1";
    c.fillText(quoteAt ? "USD spot · CoinGecko" : "USD quote unavailable", w - 82, originY + 53);
    c.textAlign = "left";
    c.fillStyle = "#baa8c7"; c.font = "22px Arial";
    c.fillText("ESTIMATED REALIZED PNL  ·  " + (partial ? "PARTIAL HISTORY" : "SUPPORTED SALES ONLY"), 87, originY + 87);
    c.strokeStyle = "#4f3a64"; c.beginPath(); c.moveTo(85, originY + 113);
    c.lineTo(w - 85, originY + 113); c.stroke();
    let y = originY + 157;
    function detail(label: string, value: string, color = "#f4ecff") {
      c.textAlign = "left"; c.fillStyle = "#a99bb7"; c.font = "22px " + fontFamily;
      c.fillText(label, 88, y);
      c.textAlign = "right"; c.fillStyle = color; c.font = "bold 28px " + fontFamily;
      c.fillText(value, w - 88, y); c.textAlign = "left"; y += 47;
    }
    for (const [label, value] of rows) detail(label, value);
    if (mode === "complete") {
      detail("MINTED", "—");
      detail("TRANSFER IN", "—");
      const convert = (n: number | null) => n === null ? "—" : (exchange(n) || 0).toFixed(coin === "USD" ? 2 : 4);
      detail("AVG BUY", convert(metrics.avgBuy));
      detail("AVG SALE", convert(metrics.avgSale));
      detail("TOTAL INVESTED", convert(metrics.invested));
      detail("TOTAL SALES", convert(metrics.sales));
      detail("MATCHED ROI", metrics.roi === null ? "—" : (metrics.roi > 0 ? "+" : "") + metrics.roi.toFixed(2) + "%",
        metrics.roi !== null && metrics.roi < 0 ? "#ff8192" : "#3bdda5");
    }
    c.font = "19px Arial"; c.fillStyle = "#aaa0ba";
    c.fillText(walletLabel + "  ·  Indicative PnL, not tax-grade or complete trade history.", 85, h - 78, w - 160);
    if (id !== renderSerial.current) return false;
    target.width = w; target.height = h;
    const output = target.getContext("2d");
    if (!output) throw new Error("Preview canvas unavailable");
    output.drawImage(buffer, 0, 0);
    return true;
  }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) void render(canvas).catch(() => setNotice("Cannot draw card preview."));
    // Render depends on every visible card setting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, mode, unit, quote, quoteAt, quoteError, background, canvasHeight, font, aliasSize, alias, partial]);

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
    const text = row.name + " · Estimated realized NFT PnL " + (profit === null ? "unavailable" : fmt(profit, coin) + " " + coin) +
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
        <button type="button" aria-pressed={unit === "USD"} disabled={!quote} onClick={() => setUnit(unit === "ETH" ? "USD" : "ETH")}>
          ETH ↔ USD {quoteError && <span title="Quote unavailable">(offline)</span>}
        </button>
        <button type="button" disabled={!metrics.knownGas} title={metrics.knownGas ? "Gas fees already reflected in PnL" : "Gas receipt data is unavailable"}>Gas {metrics.knownGas ? "included" : "unavailable"}</button>
        <button type="button" className="studio-x" onClick={openX}>Share on X</button>
      </div>
    </div>
    <button type="button" className="studio-download" disabled={busy} onClick={() => void save(false)}><Download size={18}/> {busy ? "Preparing…" : "Download PNG"}</button>
    <div className="studio-rendered"><canvas ref={canvasRef} aria-label="Sentinel PnL card preview"/></div>
    <div className="studio-rate"><span>ETH ↔ USD · {quote ? "$" + quote.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Quote unavailable"}</span><span>{quoteAt ? "Updated " + new Date(quoteAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "No live FX"}</span></div>
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
    <p className="studio-caveat">Gas, mint/transfer basis and some payment currencies are not indexed. USD shows a current exchange-rate approximation, not the historical value at each trade. Card metrics are estimates.</p>
    {notice && <p className="studio-notice" role="status">{notice}</p>}
  </div>;
}
