import { scanChains } from "./scan-chains";
import { addressSchema, chains, eventsSchema, type Chain, type TradeEvent } from "./schema";
import { detectNonEvmWallet } from "./discovery-wallet";

export const autoEvmChains: Chain[] = scanChains
  .filter((chain) => chain.scanReady && (chains as readonly string[]).includes(chain.id))
  .map((chain) => chain.id as Chain);

export type AutoScanNetworkStatus = {
  chain: Chain;
  checked: number;
  failed: number;
  eventCount: number;
};

export type AutoEvmScanResult = {
  events: TradeEvent[];
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
  if (inputs.length === 0) throw new Error("Paste a wallet address before scanning.");
  const nonEvm = inputs.map(detectNonEvmWallet);
  if (nonEvm.some(Boolean)) {
    if (inputs.length !== 1)
      throw new Error("Scan one Bitcoin or Solana address at a time; EVM wallets can be scanned together.");
    return { kind: "discovery", chain: nonEvm[0]!, address: inputs[0] };
  }
  return { kind: "evm" };
}

type ScanMode = "wallet" | "contract" | "bot";
type Fetcher = typeof fetch;
type ScanTask = { address: string; chain: Chain };
type Outcome = { task: ScanTask; events: TradeEvent[]; partial: boolean; warning?: string } |
  { task: ScanTask; error: string };

async function requestNetwork(task: ScanTask, mode: ScanMode, contract: string | undefined,
  fetcher: Fetcher): Promise<Outcome> {
  try {
    const response = await fetcher("/api/scan", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: task.address, chain: task.chain, mode,
        contract: mode === "wallet" ? undefined : contract }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body &&
        typeof body.error === "string" ? body.error : "Provider request failed.";
      throw new Error(message.slice(0, 220));
    }
    if (!body || typeof body !== "object" || !("events" in body))
      throw new Error("The network provider returned an invalid scan response.");
    const parsed = eventsSchema.parse(body.events);
    // Refuse to attribute the wrong wallet/chain/contract to a multi-network result.
    const events = parsed.filter(event =>
      event.chain === task.chain &&
      event.wallet.toLowerCase() === task.address.toLowerCase() &&
      (!contract || mode === "wallet" || event.contract?.toLowerCase() === contract.toLowerCase()));
    const incomplete = events.length !== parsed.length;
    const partial = ("partial" in body && body.partial === true) || incomplete;
    const warning = "warning" in body && typeof body.warning === "string"
      ? body.warning.slice(0, 500) : undefined;
    return { task, events, partial,
      warning: incomplete
        ? "Mismatched network, wallet, or contract events were excluded." + (warning ? " " + warning : "")
        : warning };
  } catch (cause) {
    return { task, error: cause instanceof Error ? cause.message : "Network scan failed." };
  }
}

/**
 * A single public 0x wallet maps to multiple EVM networks. Avoid faking
 * SOL/BTC addresses, or silently treating unavailable Arc/Ink PnL as indexed.
 * Scan at most two wallet/network tasks concurrently to limit provider bursts.
 */
export async function scanAllEvmNetworks(
  addresses: string[], mode: ScanMode, contract?: string, fetcher: Fetcher = fetch,
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

  const statuses = autoEvmChains.map(chain => {
    const entries = outcomes.filter(outcome => outcome.task.chain === chain);
    return {
      chain,
      checked: entries.filter(outcome => !("error" in outcome)).length,
      failed: entries.filter(outcome => "error" in outcome).length,
      eventCount: entries.reduce((count, outcome) =>
        count + ("error" in outcome ? 0 : outcome.events.length), 0),
    };
  });
  const succeeded = outcomes.filter((outcome): outcome is Extract<Outcome, {events: TradeEvent[]}> =>
    "events" in outcome);
  const failed = outcomes.filter((outcome): outcome is Extract<Outcome, {error: string}> =>
    "error" in outcome);
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
  return {
    events: [...events.values()],
    partial: failed.length > 0 || succeeded.some(outcome => outcome.partial),
    warnings, statuses, requestsSucceeded: succeeded.length, requestsFailed: failed.length,
  };
}
