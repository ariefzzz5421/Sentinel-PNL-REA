"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { MarketAsset, MarketSnapshot, MarketSymbol } from "@/lib/market";
import { marketSymbols } from "@/lib/market";

const coinLinks: Record<MarketSymbol, string> = {
  BTC: "https://www.coingecko.com/en/coins/bitcoin",
  ETH: "https://www.coingecko.com/en/coins/ethereum",
  BNB: "https://www.coingecko.com/en/coins/bnb",
  HYPE: "https://www.coingecko.com/en/coins/hyperliquid",
};
function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}
export function MarketTape() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        const r = await fetch("/api/market/ticker", { cache: "no-store" });
        if (!r.ok) throw new Error("market API unavailable");
        const data: MarketSnapshot = await r.json();
        if (!Array.isArray(data.assets) || !data.assets.length) throw new Error("Empty market response");
        if (active) { setSnapshot(data); setUnavailable(false); }
      } catch {
        if (active) { setSnapshot(null); setUnavailable(true); }
      }
    };
    void update();
    const clock = window.setInterval(() => void update(), 90_000);
    return () => { active = false; window.clearInterval(clock); };
  }, []);
  const known = new Map(snapshot?.assets.map((asset) => [asset.symbol, asset]) || []);
  const assets = marketSymbols.map((symbol) => known.get(symbol) || null);

  function Cell({ asset, symbol }: { asset: MarketAsset | null; symbol: MarketSymbol }) {
    const change = asset?.change24h;
    return <a href={coinLinks[symbol]} target="_blank" rel="noopener noreferrer"
      className="tape-asset" aria-label={symbol + " market data from CoinGecko"}>
      {asset?.image
        ? <Image unoptimized src={asset.image} width={22} height={22} alt="" className="tape-icon"/>
        : <span className={"tape-icon tape-fallback coin-" + symbol.toLowerCase()}>{symbol.slice(0, 1)}</span>}
      <strong>{symbol}</strong>
      <span className="tape-price">{asset ? money(asset.usd) : "—"}</span>
      <span className={change === null || change === undefined ? "tape-change" : change >= 0 ? "tape-change is-up" : "tape-change is-down"}>
        {change === null || change === undefined ? "—" : (change > 0 ? "+" : "") + change.toFixed(2) + "%"}
      </span>
    </a>;
  }

  return <div className="market-tape" aria-label="Cryptocurrency market prices">
    <div className="tape-label"><span className="tape-live-dot"/> MARKET <span>24H</span></div>
    <div className="tape-window">
      <div className="tape-track">
        <div className="tape-set">{assets.map((asset, i) => <Cell key={marketSymbols[i]} asset={asset} symbol={marketSymbols[i]}/>)}</div>
        <div className="tape-set" aria-hidden="true">{assets.map((asset, i) => <Cell key={"duplicate-" + marketSymbols[i]} asset={asset} symbol={marketSymbols[i]}/>)}</div>
      </div>
    </div>
    <span className="visually-hidden" role="status">
      {unavailable ? "Price feed unavailable." : snapshot ? "Prices updated." : "Loading market prices."}
    </span>
  </div>;
}
