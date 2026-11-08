import { scanChains } from "./scan-chains";
import { addressSchema, chains, eventsSchema, type Chain, type TradeEvent } from "./schema";
import type { DiscoveryAsset, DiscoveryResult } from "./nft-discovery";
import { detectNonEvmWallet } from "./discovery-wallet";

/** The app has native priced adapters on four EVMs; Arc and Ink are unpriced indexers. */
export type AutoEvmChain = Chain | "arc" | "ink";
export const autoPricedChains: Chain[] = scanChains
  .filter(chain => chain.scanReady && (chains as readonly string[]).includes(chain.id))
  .map(chain => chain.id as Chain);
export const autoEvmChains: AutoEvmChain[] = scanChains
  .filter(chain => autoPricedChains.includes(chain.id as Chain) ||
    chain.id === "arc" || chain.id === "ink")
  .map(chain => chain.id as AutoEvmChain);

export type AutoScanNetworkStatus = {
  chain: AutoEvmChain;
  checked: number;
  failed: number;
  eventCount: number;
  holdingCount: number;
  coverage: "priced-sales" | "unpriced-transfers";
};
export type AutoEvmScanResult = {
  events: TradeEvent[];
  discoveries: DiscoveryResult[];
  partial: boolean;
  warnings: string[];
  statuses: AutoScanNetworkStatus[];
  requestsSucceeded: number;
  requestsFailed: number;
};

export function detectAutomaticWalletFamily(text: string):
  | { kind: "evm" }
  | { kind: "discovery"; chain: "bitcoin" | "solana"; address: string } {
  const inputs = text.trim().split(/[\s,;]+/).filter(Boolean);
  if (!inputs.length) throw new Error("Paste a wallet address before scanning.");
  const nonEvm = inputs.map(detectNonEvmWallet);
  if (nonEvm.some(Boolean)) {
    if (inputs.length !== 1)
      throw new Error("Scan one Bitcoin or Solana address at a time; EVM wallets can be scanned together.");
    return { kind: "discovery", chain: nonEvm[0]!, address: inputs[0] };
  }
  return { kind: "evm" };
}

type ScanMode = "wallet" | "contract" | "bot";
type ScanTask = { address: string; chain: AutoEvmChain };
type Outcome =
  | { task: ScanTask; events: TradeEvent[]; discovery: DiscoveryResult | null; partial: boolean; warning?: string }
  | { task: ScanTask; error: string };

function parseUnpricedDiscovery(raw: unknown, task: ScanTask): DiscoveryResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("NFT indexer returned an invalid response.");
  const item = raw as Record<string, unknown>;
  if (item.chain !== task.chain || typeof item.address !== "string" ||
      item.address.toLowerCase() !== task.address.toLowerCase() ||
      item.mode !== "recent-transfers" || item.pnlAvailable !== false ||
      !Array.isArray(item.assets) || item.assets.length > 300 ||
      typeof item.note !== "string" || item.note.length > 1500)
    throw new Error("NFT indexer returned a mismatched wallet/network result.");
  const assets = item.assets as unknown[];
  if (!assets.every(a => {
    if (!a || typeof a !== "object" || Array.isArray(a)) return false;
    const data = a as Record<string, unknown>;
    return typeof data.id === "string" && data.id.length < 280 &&
      typeof data.name === "string" && data.name.length <= 180 &&
      typeof data.url === "string" && data.url.startsWith("https://") &&
      (data.imageUrl === null || typeof data.imageUrl === "string") &&
      (data.collection === null || typeof data.collection === "string") &&
      (data.kind === "holding" || data.kind === "received" || data.kind === "sent");
  })) throw new Error("NFT indexer returned malformed NFT activity.");
  return {
    chain: task.chain as "arc" | "ink",
    address: task.address.toLowerCase(),
    assets: assets as DiscoveryAsset[],
    mode: "recent-transfers",
    pnlAvailable: false, partial: true,
    note: item.note,
  };
}

async function requestNetwork(
  task: ScanTask, mode: ScanMode, contract: string | undefined, fetcher: typeof fetch,
): Promise<Outcome> {
  try {
    const activityOnly = task.chain === "arc" || task.chain === "ink";
    const response = await fetcher(activityOnly ? "/api/nft-discovery" : "/api/scan", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: task.address, chain: task.chain,
        ...(activityOnly ? { contract: mode === "wallet" ? undefined : contract } :
          { mode, contract: mode === "wallet" ? undefined : contract }),
      }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body &&
        typeof body.error === "string" ? body.error : "Provider request failed.";
      throw new Error(message.slice(0, 220));
    }
    if (activityOnly) {
      const discovery = parseUnpricedDiscovery(body, task);
      return { task, events: [], discovery, partial: true, warning: discovery.note };
    }
    if (!body || typeof body !== "object" || !("events" in body))
      throw new Error("The network provider returned an invalid scan response.");
    const parsed = eventsSchema.parse(body.events);
    const events = parsed.filter(event =>
      event.chain === task.chain &&
      event.wallet.toLowerCase() === task.address.toLowerCase() &&
      (!contract || mode === "wallet" || event.contract?.toLowerCase() === contract.toLowerCase()));
    const incomplete = events.length !== parsed.length;
    const partial = ("partial" in body && body.partial === true) || incomplete;
    const warning = "warning" in body && typeof body.warning === "string"
      ? body.warning.slice(0, 500) : undefined;
    return {
      task, events, discovery: null, partial,
      warning: incomplete
        ? "Mismatched network, wallet, or contract events were excluded." + (warning ? " " + warning : "")
        : warning,
    };
  } catch (cause) {
    return { task, error: cause instanceof Error ? cause.message : "Network scan failed." };
  }
}

/**
 * Read-only, one-click scans over the EVM networks represented in Sentinel.
 * BTC and Solana cannot be inferred from a 0x address.
 * Two concurrent requests bound load on indexers and marketplace providers.
 */
export async function scanAllEvmNetworks(
  addresses: string[], mode: ScanMode, contract?: string, fetcher: typeof fetch = fetch,
  onProgress?: (complete: number, total: number) => void,
): Promise<AutoEvmScanResult> {
  const wallets = [...new Set(addresses.map(address => address.toLowerCase()))];
  if (!wallets.length || wallets.length > 100 || wallets.some(address => !addressSchema.safeParse(address).success))
    throw new Error("Enter 1–100 valid EVM wallet addresses.");
  if (mode !== "wallet" && !addressSchema.safeParse(contract).success)
    throw new Error("Enter a valid EVM collection contract address.");

  const tasks: ScanTask[] = wallets.flatMap(address =>
    autoEvmChains.map(chain => ({ address, chain })));
  const outcomes: Outcome[] = [];
  for (let index = 0; index < tasks.length; index += 2) {
    const batch = await Promise.all(tasks.slice(index, index + 2)
      .map(task => requestNetwork(task, mode, contract, fetcher)));
    outcomes.push(...batch);
    onProgress?.(Math.min(index + 2, tasks.length), tasks.length);
  }

  const statuses: AutoScanNetworkStatus[] = autoEvmChains.map(chain => {
    const entries = outcomes.filter(outcome => outcome.task.chain === chain);
    const activity = chain === "arc" || chain === "ink";
    return {
      chain,
      checked: entries.filter(outcome => !("error" in outcome)).length,
      failed: entries.filter(outcome => "error" in outcome).length,
      eventCount: entries.reduce((count, outcome) =>
        count + ("error" in outcome ? 0 : activity
          ? (outcome.discovery?.assets.filter(asset => asset.kind !== "holding").length || 0)
          : outcome.events.length), 0),
      holdingCount: activity ? entries.reduce((count, outcome) =>
        count + ("error" in outcome ? 0
          : (outcome.discovery?.assets.filter(asset => asset.kind === "holding").length || 0)), 0) : 0,
      coverage: activity ? "unpriced-transfers" : "priced-sales",
    };
  });
  const succeeded = outcomes.filter((outcome):
    outcome is Extract<Outcome, { events: TradeEvent[] }> => "events" in outcome);
  const failed = outcomes.filter((outcome):
    outcome is Extract<Outcome, { error: string }> => "error" in outcome);
  if (!succeeded.length)
    throw new Error("All supported EVM network scans failed. " +
      failed.slice(0, 2).map(outcome => outcome.task.chain.toUpperCase() +
        ": " + outcome.error).join(" · "));
  const warnings = [
    ...failed.map(outcome => outcome.task.chain.toUpperCase() + ": " + outcome.error),
    ...succeeded.filter(outcome => outcome.warning)
      .map(outcome => outcome.task.chain.toUpperCase() + ": " + outcome.warning),
  ];
  const events = new Map<string, TradeEvent>();
  for (const outcome of succeeded) for (const event of outcome.events)
    events.set(event.chain + ":" + event.wallet.toLowerCase() + ":" + event.id, event);
  const discoveries = succeeded.flatMap(outcome =>
    outcome.discovery ? [outcome.discovery] : []);
  return {
    events: [...events.values()], discoveries,
    partial: failed.length > 0 || succeeded.some(outcome => outcome.partial),
    warnings, statuses, requestsSucceeded: succeeded.length, requestsFailed: failed.length,
  };
}
