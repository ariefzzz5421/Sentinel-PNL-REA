import type { AutoEvmChain } from "./automatic-scan";

/**
 * Filter a completed scan for display only. Never removes items from the
 * scan ledger or provider responses; null restores the full multi-chain view.
 */
export function filterNetworkItems<T extends { chain: string }>(
  items: readonly T[],
  selectedChain: AutoEvmChain | null,
): T[] {
  return selectedChain === null
    ? [...items]
    : items.filter(item => item.chain === selectedChain);
}
