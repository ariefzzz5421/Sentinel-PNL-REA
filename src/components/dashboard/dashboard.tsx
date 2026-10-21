"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  FileInput,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { parseTradeCsv, toTradeCsv } from "@/lib/import-export";
import { calculatePnl, type CalculatedTrade } from "@/lib/pnl/calculate";
import {
  addressSchema,
  chainSchema,
  eventSchema,
  eventsSchema,
  parseWallets,
  type Chain,
  type TradeEvent,
} from "@/lib/schema";

type Range = "24H" | "7D" | "30D" | "ALL";
type View = "overview" | "trades" | "collections";
const STORE = "sentinel-pnl-events-v1";
const formatEth = (value: string, digits = 4) =>
  `${new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP).toFixed(digits)} ETH`;
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function makeChartData(trades: CalculatedTrade[]) {
  return [...trades]
    .reverse()
    .filter((t) => t.type === "sell" && t.realizedEth !== null)
    .reduce<{ running: Decimal; points: { date: string; pnl: number }[] }>(
      (state, trade) => {
        const running = state.running.plus(trade.realizedEth!);
        return {
          running,
          points: [
            ...state.points,
            {
              date: new Date(trade.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }),
              pnl: Number(running.toFixed(6)),
            },
          ],
        };
      },
      { running: new Decimal(0), points: [] },
    ).points;
}

function exportCard(
  realized: string,
  wallet: string,
  sales: number,
  wins: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) return;
  const gradient = context.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, "#111721");
  gradient.addColorStop(1, "#172422");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 630);
  context.strokeStyle = "rgba(171,241,93,.12)";
  for (let x = 0; x < 1200; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 630);
    context.stroke();
  }
  for (let y = 0; y < 630; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(1200, y);
    context.stroke();
  }
  context.fillStyle = "#b7ec6d";
  context.fillRect(64, 66, 33, 33);
  context.fillStyle = "#f5f8ee";
  context.font = "bold 34px Arial";
  context.fillText("SENTINEL PNL", 115, 94);
  context.fillStyle = "#a6b2ad";
  context.font = "22px Arial";
  context.fillText("TRACK EVERY MOVE. KNOW YOUR EDGE.", 65, 155);
  context.fillStyle = "#a6b2ad";
  context.font = "26px Arial";
  context.fillText("REALIZED PNL · ETH", 65, 264);
  context.fillStyle = new Decimal(realized).gte(0) ? "#b7ec6d" : "#ff8f83";
  context.font = "bold 88px Arial";
  context.fillText(
    `${new Decimal(realized).gte(0) ? "+" : ""}${new Decimal(realized).toDecimalPlaces(4).toString()}`,
    65,
    370,
  );
  context.fillStyle = "#f5f8ee";
  context.font = "28px Arial";
  context.fillText(
    `${sales} MATCHED/RECORDED SALES   ·   ${wins} WINS`,
    65,
    455,
  );
  context.fillStyle = "#a6b2ad";
  context.font = "20px Arial";
  context.fillText(
    wallet ? `WALLET ${short(wallet)}` : "LOCAL TRADE LEDGER",
    65,
    557,
  );
  context.fillText("ESTIMATE · SOURCE: USER LEDGER", 775, 557);
  canvas.toBlob((blob) => {
    if (blob) download("sentinel-pnl-card.png", blob);
  }, "image/png");
}

export function Dashboard() {
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [range, setRange] = useState<Range>("ALL");
  const [rangeStart, setRangeStart] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [chain, setChain] = useState<Chain>("ethereum");
  const [walletInput, setWalletInput] = useState("");
  const [contractInput, setContractInput] = useState("");
  const [scanMode, setScanMode] = useState<"wallet" | "contract" | "bot">(
    "wallet",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error" | "info">(
    "info",
  );
  const [showAdd, setShowAdd] = useState(false);
  const [partial, setPartial] = useState(false);
  const [form, setForm] = useState({
    wallet: "",
    collection: "",
    contract: "",
    tokenId: "",
    type: "buy",
    amountEth: "",
    feeEth: "0",
    date: new Date().toISOString().slice(0, 16),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const walletFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(STORE);
        if (stored) {
          const parsed = eventsSchema.safeParse(JSON.parse(stored));
          if (parsed.success) setEvents(parsed.data);
        }
      } catch {
        /* corrupted local storage stays isolated */
      }
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(STORE, JSON.stringify(events));
      } catch {
        queueMicrotask(() => {
          setMessage(
            "Browser storage is full. Export a CSV to keep your records.",
          );
          setMessageKind("error");
        });
      }
    }
  }, [events, hydrated]);

  const summary = useMemo(
    () => calculatePnl(events, rangeStart),
    [events, rangeStart],
  );
  const visibleTrades = useMemo(
    () =>
      summary.trades.filter((t) =>
        `${t.collection} ${t.tokenId} ${t.wallet}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [summary.trades, search],
  );
  const chartData = useMemo(
    () => makeChartData(summary.trades),
    [summary.trades],
  );
  const walletsInLedger = new Set(
    events.map((event) => event.wallet.toLowerCase()),
  );
  const wallet = walletsInLedger.size === 1 ? events[0]?.wallet || "" : "";

  function notice(text: string, kind: "success" | "error" | "info" = "info") {
    setMessage(text);
    setMessageKind(kind);
  }
  function chooseRange(value: Range, now: Date) {
    setRange(value);
    const hours =
      value === "24H"
        ? 24
        : value === "7D"
          ? 168
          : value === "30D"
            ? 720
            : null;
    setRangeStart(
      hours ? new Date(now.getTime() - hours * 3600_000) : undefined,
    );
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("CSV exceeds the 2 MB limit.");
      const imported = parseTradeCsv(await file.text());
      const merged = new Map(events.map((t) => [t.id, t]));
      for (const trade of imported) merged.set(trade.id, trade);
      if (merged.size > 10000)
        throw new Error("Ledger exceeds the 10,000-event limit.");
      setEvents([...merged.values()]);
      notice(
        `Imported ${imported.length} event${imported.length === 1 ? "" : "s"}. Matching IDs were updated.`,
        "success",
      );
    } catch (error) {
      notice(
        error instanceof Error ? error.message : "Could not import CSV.",
        "error",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function addTrade(e: React.FormEvent) {
    e.preventDefault();
    const result = eventSchema.safeParse({
      id: crypto.randomUUID(),
      date: new Date(form.date).toISOString(),
      chain,
      wallet: form.wallet,
      collection: form.collection,
      contract: form.contract || undefined,
      tokenId: form.tokenId,
      type: form.type,
      amountEth: form.amountEth,
      feeEth: form.feeEth || "0",
    });
    if (!result.success) {
      notice(
        `${String(result.error.issues[0].path[0])}: ${result.error.issues[0].message}`,
        "error",
      );
      return;
    }
    setEvents((previous) => [...previous, result.data]);
    setShowAdd(false);
    notice("Trade saved in this browser.", "success");
  }
  async function scan() {
    let wallets: string[];
    try {
      wallets = parseWallets(walletInput);
    } catch (error) {
      notice(
        error instanceof Error ? error.message : "Invalid wallet list.",
        "error",
      );
      return;
    }
    const contract = contractInput.trim()
      ? addressSchema.safeParse(contractInput.trim())
      : null;
    if (scanMode !== "wallet" && (!contract || !contract.success)) {
      notice("Enter a valid collection contract address.", "error");
      return;
    }
    setBusy(true);
    notice(
      `Scanning ${wallets.length} public wallet${wallets.length === 1 ? "" : "s"}…`,
    );
    try {
      const gathered: TradeEvent[] = [];
      const errors: string[] = [];
      let incomplete = false;
      for (let offset = 0; offset < wallets.length; offset += 4) {
        const batch = wallets.slice(offset, offset + 4);
        const responses = await Promise.all(
          batch
            .map(async (address) => {
              const response = await fetch("/api/scan", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  address,
                  chain: chainSchema.parse(chain),
                  contract: contract?.success ? contract.data : undefined,
                  mode: scanMode,
                }),
              });
              const payload: unknown = await response.json();
              if (!response.ok)
                throw new Error(
                  typeof payload === "object" &&
                  payload !== null &&
                  "error" in payload
                    ? String(payload.error)
                    : "Scan failed.",
                );
              const decoded = payload as { events: unknown; partial: boolean };
              return {
                events: eventsSchema.parse(decoded.events),
                partial: decoded.partial,
              };
            })
            .map((promise) =>
              promise.catch((error) => ({
                error: error instanceof Error ? error.message : "Scan failed.",
              })),
            ),
        );
        for (const response of responses) {
          if ("error" in response) errors.push(response.error);
          else {
            gathered.push(...response.events);
            incomplete ||= response.partial;
          }
        }
      }
      if (errors.length === wallets.length) throw new Error(errors[0]);
      const merged = new Map(events.map((t) => [t.id, t]));
      for (const trade of gathered) merged.set(trade.id, trade);
      if (merged.size > 10000)
        throw new Error(
          "Ledger exceeds the 10,000-event limit. Export a CSV before adding more.",
        );
      setEvents([...merged.values()]);
      setPartial(incomplete || errors.length > 0);
      notice(
        `Added ${gathered.length} provider event${gathered.length === 1 ? "" : "s"} from ${wallets.length - errors.length}/${wallets.length} wallets.${incomplete || errors.length ? " Coverage is partial." : ""}`,
        errors.length || incomplete ? "info" : "success",
      );
    } catch (error) {
      notice(error instanceof Error ? error.message : "Scan failed.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function loadWalletFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25_000) throw new Error("Wallet list exceeds 25 KB.");
      const contents = await file.text();
      const wallets = parseWallets(contents);
      setWalletInput(wallets.join("\n"));
      notice(
        `Loaded ${wallets.length} wallet address${wallets.length === 1 ? "" : "es"} from .txt.`,
        "success",
      );
    } catch (error) {
      notice(
        error instanceof Error ? error.message : "Could not read wallet list.",
        "error",
      );
    } finally {
      if (walletFileRef.current) walletFileRef.current.value = "";
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand app-brand">
          <span className="brand-mark">
            <Activity size={19} strokeWidth={2.8} />
          </span>
          <span>
            SENTINEL<span className="brand-light">PNL</span>
          </span>
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace sections">
          <button
            className={view === "overview" ? "selected" : ""}
            onClick={() => setView("overview")}
          >
            <Activity size={18} /> Overview
          </button>
          <button
            className={view === "trades" ? "selected" : ""}
            onClick={() => setView("trades")}
          >
            <ArrowUpRight size={18} /> Trades
          </button>
          <button
            className={view === "collections" ? "selected" : ""}
            onClick={() => setView("collections")}
          >
            <Layers3 size={18} /> Collections
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-box">
            <ShieldCheck size={18} />
            <strong>Private by default</strong>
            <p>
              Imported trades are saved only in this browser. Live scans require
              a configured provider.
            </p>
          </div>
          <Link href="/methodology">
            <CircleHelp size={17} /> Methodology
          </Link>
          <Link href="/">
            <ArrowLeft size={17} /> Back to site
          </Link>
        </div>
      </aside>
      <main className="workspace">
        <div className="mobile-bar">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Activity size={17} />
            </span>
            <span>
              SENTINEL<span className="brand-light">PNL</span>
            </span>
          </Link>
          <Link href="/methodology" aria-label="Methodology">
            <CircleHelp size={20} />
          </Link>
        </div>
        <div className="workspace-inner">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="signal-dot" /> PERFORMANCE WORKSPACE
              </div>
              <h1>
                {view === "overview"
                  ? "Your signal, decoded."
                  : view === "trades"
                    ? "Trade ledger."
                    : "Collection lens."}
              </h1>
              <p>
                {view === "overview"
                  ? "A clear view of what your NFT trades actually returned."
                  : view === "trades"
                    ? "Every supported buy, mint, and sale in one place."
                    : "Compare realized outcomes across collections."}
              </p>
            </div>
            <div className="heading-actions">
              <input
                ref={fileRef}
                className="visually-hidden"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
              <button
                className="outline-btn"
                onClick={() => fileRef.current?.click()}
              >
                <FileInput size={17} /> Import CSV
              </button>
              <button
                className="primary-btn small"
                onClick={() => {
                  setForm((previous) => ({
                    ...previous,
                    wallet:
                      walletInput.split(/[\s,;]+/).find(Boolean) || wallet,
                  }));
                  setShowAdd(true);
                }}
              >
                <Plus size={18} /> Add trade
              </button>
            </div>
          </div>
          <section className="scan-panel" aria-label="Live wallet scanner">
            <div className="scan-intro">
              <div className="scan-icon">
                <Wallet size={21} />
              </div>
              <div>
                <h2>Scan wallets</h2>
                <p>
                  Up to 100 public EVM addresses. Provider credentials stay on
                  the server.
                </p>
              </div>
              <span className="optional-label">OPTIONAL LIVE DATA</span>
            </div>
            <div className="scan-controls">
              <select
                aria-label="Blockchain"
                value={chain}
                onChange={(e) => setChain(e.target.value as Chain)}
              >
                <option value="ethereum">Ethereum</option>
                <option value="base">Base</option>
                <option value="arbitrum">Arbitrum</option>
              </select>
              <textarea
                aria-label="Wallet addresses"
                rows={2}
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="0x… one wallet address per line"
              />
              <button
                className="scan-button"
                disabled={busy}
                onClick={() => void scan()}
              >
                {busy ? "Scanning…" : "Run scan"} <ArrowRight size={17} />
              </button>
            </div>
            <div className="scan-foot">
              <div className="mode-control" role="group" aria-label="Scan mode">
                <button
                  className={scanMode === "wallet" ? "active" : ""}
                  onClick={() => setScanMode("wallet")}
                >
                  Wallet
                </button>
                <button
                  className={scanMode === "contract" ? "active" : ""}
                  onClick={() => setScanMode("contract")}
                >
                  Contract
                </button>
                <button
                  className={scanMode === "bot" ? "active" : ""}
                  onClick={() => setScanMode("bot")}
                >
                  Bot PnL
                </button>
              </div>
              {scanMode !== "wallet" && (
                <input
                  className="contract-input"
                  aria-label="Collection contract address"
                  value={contractInput}
                  onChange={(e) => setContractInput(e.target.value)}
                  placeholder="0x… collection contract"
                />
              )}
              <input
                ref={walletFileRef}
                className="visually-hidden"
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => void loadWalletFile(e.target.files?.[0])}
              />
              <button
                className="wallet-file-btn"
                onClick={() => walletFileRef.current?.click()}
              >
                <FileInput size={15} /> Load .txt
              </button>
            </div>
          </section>
          {message && (
            <div
              className={`notice ${messageKind}`}
              role={messageKind === "error" ? "alert" : "status"}
            >
              <span>{message}</span>
              <button
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {partial && (
            <div className="notice info">
              Provider returned partial coverage. Summary uses only received
              events.
            </div>
          )}
          <div className="section-toolbar">
            <div className="toolbar-title">
              <span className="section-kicker">01 / PERFORMANCE</span>
              <h2>
                {view === "overview"
                  ? "At a glance"
                  : view === "trades"
                    ? "Activity"
                    : "By collection"}
              </h2>
            </div>
            <div className="range-control" role="group" aria-label="Time range">
              {(["24H", "7D", "30D", "ALL"] as Range[]).map((item) => (
                <button
                  key={item}
                  className={range === item ? "active" : ""}
                  onClick={() => chooseRange(item, new Date())}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="stat-grid">
            <Stat
              label="REALIZED PNL"
              value={formatEth(summary.realizedEth)}
              positive={new Decimal(summary.realizedEth).gte(0)}
              detail={`${summary.sells - summary.unknownBasisSales} matched sales`}
            />
            <Stat
              label="TOTAL VOLUME"
              value={formatEth(summary.volumeEth)}
              detail="Acquisitions + net sales"
            />
            <Stat
              label="WIN RATE"
              value={
                summary.wins + summary.losses
                  ? `${Math.round((100 * summary.wins) / (summary.wins + summary.losses))}%`
                  : "—"
              }
              detail={`${summary.wins} wins · ${summary.losses} losses`}
            />
            <Stat
              label="OPEN POSITIONS"
              value={String(summary.openPositions)}
              detail="Unrealized value unavailable"
            />
          </div>
          {view === "overview" && (
            <div className="overview-grid">
              <section className="panel chart-panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">REALIZED TRAJECTORY</span>
                    <h3>Performance over time</h3>
                  </div>
                  <span className="unit-pill">ETH</span>
                </div>
                {chartData.length ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 16, right: 12, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="pnlFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#b6ee78"
                              stopOpacity={0.23}
                            />
                            <stop
                              offset="100%"
                              stopColor="#b6ee78"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="#29332e"
                          strokeDasharray="4 6"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="#84938c"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#84938c"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#1b2423",
                            border: "1px solid #35413d",
                            borderRadius: 10,
                            color: "#fff",
                          }}
                          formatter={(value) => [
                            `${value} ETH`,
                            "Realized PnL",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="pnl"
                          stroke="#b6ee78"
                          strokeWidth={2.5}
                          fill="url(#pnlFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="chart-empty">
                    <div className="empty-visual">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <strong>Your chart begins with a matched sale.</strong>
                    <p>
                      Import trades or add them manually to see realized PnL
                      over time.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel insight-panel">
                <div className="panel-head">
                  <div>
                    <span className="section-kicker">YOUR SCORECARD</span>
                    <h3>Share your result</h3>
                  </div>
                  <ArrowUpRight size={18} />
                </div>
                <div className="score-preview">
                  <div className="score-brand">
                    SENTINEL <span>PNL</span>
                  </div>
                  <div className="score-label">REALIZED PROFIT / LOSS</div>
                  <div
                    className={
                      new Decimal(summary.realizedEth).gte(0)
                        ? "score-value"
                        : "score-value negative"
                    }
                  >
                    {new Decimal(summary.realizedEth).gte(0) ? "+" : ""}
                    {new Decimal(summary.realizedEth)
                      .toDecimalPlaces(4)
                      .toString()}{" "}
                    <small>ETH</small>
                  </div>
                  <div className="score-base">
                    {wallet
                      ? short(wallet)
                      : walletsInLedger.size > 1
                        ? `${walletsInLedger.size} WALLET LEDGER`
                        : "YOUR TRADE LEDGER"}{" "}
                    · {range}
                  </div>
                </div>
                <button
                  className="wide-action"
                  onClick={() =>
                    exportCard(
                      summary.realizedEth,
                      wallet,
                      summary.sells,
                      summary.wins,
                    )
                  }
                >
                  <ArrowDownToLine size={17} /> Download PNG card
                </button>
                <p className="small-note">
                  Card uses only ledger values. No invented wallet balance or
                  floor price.
                </p>
              </section>
            </div>
          )}
          {(view === "trades" || view === "overview") && (
            <section className="panel table-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">02 / ACTIVITY</span>
                  <h3>Recent trades</h3>
                </div>
                <div className="table-actions">
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search collection or token"
                    />
                  </label>
                  <button
                    className="icon-action"
                    title="Export CSV"
                    aria-label="Export CSV"
                    disabled={!events.length}
                    onClick={() =>
                      download(
                        "sentinel-pnl-trades.csv",
                        new Blob([toTradeCsv(events)], {
                          type: "text/csv;charset=utf-8",
                        }),
                      )
                    }
                  >
                    <ArrowDownToLine size={18} />
                  </button>
                </div>
              </div>
              {visibleTrades.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>ASSET</th>
                        <th>TYPE</th>
                        <th>DATE</th>
                        <th>AMOUNT</th>
                        <th>REALIZED PNL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTrades
                        .slice(0, view === "overview" ? 8 : 100)
                        .map((trade) => (
                          <tr key={trade.id}>
                            <td>
                              <span className="asset-icon">
                                {trade.collection.slice(0, 1).toUpperCase()}
                              </span>
                              <span>
                                <strong>{trade.collection}</strong>
                                <small>
                                  #{trade.tokenId} · {trade.chain}
                                </small>
                              </span>
                            </td>
                            <td>
                              <span className={`trade-type ${trade.type}`}>
                                {trade.type}
                              </span>
                            </td>
                            <td>{new Date(trade.date).toLocaleDateString()}</td>
                            <td>{formatEth(trade.amountEth)}</td>
                            <td
                              className={
                                trade.realizedEth === null
                                  ? "muted"
                                  : new Decimal(trade.realizedEth).gte(0)
                                    ? "positive"
                                    : "negative"
                              }
                            >
                              {trade.type !== "sell"
                                ? "—"
                                : trade.realizedEth === null
                                  ? "Unknown basis"
                                  : `${new Decimal(trade.realizedEth).gte(0) ? "+" : ""}${formatEth(trade.realizedEth)}`}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {visibleTrades.length > (view === "overview" ? 8 : 100) && (
                    <p className="table-limit">
                      Showing the first {view === "overview" ? 8 : 100} of{" "}
                      {visibleTrades.length} events. Export CSV for the full
                      ledger.
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState
                  title={
                    events.length
                      ? "No trades match this view."
                      : "Your ledger is waiting."
                  }
                  detail={
                    events.length
                      ? "Change the search or time filter."
                      : "Import a CSV or add a trade to get started."
                  }
                  onImport={() => fileRef.current?.click()}
                />
              )}
            </section>
          )}
          {view === "collections" && (
            <section className="panel table-panel">
              <div className="panel-head">
                <div>
                  <span className="section-kicker">02 / COLLECTIONS</span>
                  <h3>Collection performance</h3>
                </div>
                <SlidersHorizontal size={18} />
              </div>
              {summary.collections.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>COLLECTION</th>
                        <th>BUYS</th>
                        <th>SALES</th>
                        <th>OPEN</th>
                        <th>REALIZED PNL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.collections.map((item, i) => (
                        <tr key={`${item.name}-${i}`}>
                          <td>
                            <span className="asset-icon">
                              {item.name.slice(0, 1).toUpperCase()}
                            </span>
                            <strong>{item.name}</strong>
                          </td>
                          <td>{item.buys}</td>
                          <td>
                            {item.sells}
                            {item.unknownBasisSales ? (
                              <small className="inline-note">
                                {" "}
                                · {item.unknownBasisSales} unknown basis
                              </small>
                            ) : null}
                          </td>
                          <td>{item.openPositions}</td>
                          <td
                            className={
                              new Decimal(item.realizedEth).gte(0)
                                ? "positive"
                                : "negative"
                            }
                          >
                            {formatEth(item.realizedEth)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No collection data yet."
                  detail="Add an NFT trade to see collection performance."
                  onImport={() => fileRef.current?.click()}
                />
              )}
            </section>
          )}
          <div className="workspace-footer">
            <span>
              ETH-denominated NFT trades · Estimates, not financial advice
            </span>
            <Link href="/methodology">
              Read methodology <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile workspace navigation">
        <button
          className={view === "overview" ? "selected" : ""}
          onClick={() => setView("overview")}
        >
          <Activity size={19} />
          Overview
        </button>
        <button
          className={view === "trades" ? "selected" : ""}
          onClick={() => setView("trades")}
        >
          <ArrowUpRight size={19} />
          Trades
        </button>
        <button
          className={view === "collections" ? "selected" : ""}
          onClick={() => setView("collections")}
        >
          <Layers3 size={19} />
          Collections
        </button>
      </nav>
      {showAdd && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAdd(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">LEDGER / NEW EVENT</span>
                <h2 id="add-title">Add an NFT trade</h2>
              </div>
              <button aria-label="Close" onClick={() => setShowAdd(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={addTrade} className="trade-form">
              <label>
                Wallet address
                <input
                  required
                  value={form.wallet}
                  onChange={(e) => setForm({ ...form, wallet: e.target.value })}
                  placeholder="0x…"
                />
              </label>
              <div className="form-row">
                <label>
                  Collection
                  <input
                    required
                    value={form.collection}
                    onChange={(e) =>
                      setForm({ ...form, collection: e.target.value })
                    }
                    placeholder="Collection name"
                  />
                </label>
                <label>
                  Token ID
                  <input
                    required
                    value={form.tokenId}
                    onChange={(e) =>
                      setForm({ ...form, tokenId: e.target.value })
                    }
                    placeholder="1234"
                  />
                </label>
              </div>
              <label>
                Contract address{" "}
                <span>(recommended for accurate matching)</span>
                <input
                  value={form.contract}
                  onChange={(e) =>
                    setForm({ ...form, contract: e.target.value })
                  }
                  placeholder="0x…"
                />
              </label>
              <div className="form-row">
                <label>
                  Event type
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="buy">Buy</option>
                    <option value="mint">Mint</option>
                    <option value="sell">Sell</option>
                  </select>
                </label>
                <label>
                  Date & time
                  <input
                    type="datetime-local"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Amount (ETH)
                  <input
                    required
                    inputMode="decimal"
                    value={form.amountEth}
                    onChange={(e) =>
                      setForm({ ...form, amountEth: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Fee (ETH)
                  <input
                    required
                    inputMode="decimal"
                    value={form.feeEth}
                    onChange={(e) =>
                      setForm({ ...form, feeEth: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </button>
                <button className="primary-btn small" type="submit">
                  Save trade <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {events.length > 0 && (
        <button
          className="clear-ledger"
          onClick={() => {
            if (
              window.confirm(
                "Clear all locally stored trade events? Export a CSV first if you need a copy.",
              )
            ) {
              setEvents([]);
              notice("Local ledger cleared.", "success");
            }
          }}
          aria-label="Clear local ledger"
        >
          <Trash2 size={15} /> Clear ledger
        </button>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <ArrowUpRight size={16} />
      </div>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
function EmptyState({
  title,
  detail,
  onImport,
}: {
  title: string;
  detail: string;
  onImport: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Layers3 size={24} />
      </div>
      <strong>{title}</strong>
      <p>{detail}</p>
      <button onClick={onImport}>
        Import CSV <ArrowRight size={16} />
      </button>
    </div>
  );
}
