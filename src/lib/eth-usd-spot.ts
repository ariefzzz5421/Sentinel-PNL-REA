/** Current ETH/USD spot conversion; NEVER a historical execution price. */
export type EthUsdSpot = { usd: number; updatedAt: string; source: "CoinGecko" | "Coinbase" };
export function parseEthUsdSpot(input: unknown, now = Date.now()): EthUsdSpot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if ((raw.source !== "CoinGecko" && raw.source !== "Coinbase") || typeof raw.usd !== "number" ||
      !Number.isFinite(raw.usd) || raw.usd <= 0 || raw.usd > 1_000_000 ||
      typeof raw.updatedAt !== "string") return null;
  const timestamp = Date.parse(raw.updatedAt);
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000 ||
      now - timestamp > 10 * 60_000) return null;
  return { usd: raw.usd, updatedAt: raw.updatedAt, source: raw.source };
}
export function formatEthPnlUsd(
  ethPnl: string | null, spot: EthUsdSpot | null,
): string | null {
  if (!spot || ethPnl === null || !/^-?\d+(?:\.\d+)?$/.test(ethPnl)) return null;
  const converted = Number(ethPnl) * spot.usd;
  if (!Number.isFinite(converted)) return null;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(converted));
  return (converted < 0 ? "-" : "") + formatted;
}
