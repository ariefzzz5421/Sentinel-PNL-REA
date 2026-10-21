import { addressSchema } from "@/lib/schema";
import type { ScanChain } from "@/lib/scan-chains";

/** Resolve ENS on the server before passing canonical addresses to the scan API. */
export async function resolveWalletInput(text: string, chain: ScanChain): Promise<{ addresses: string[]; description: string }> {
  const items = [...new Set(text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean))];
  if (!items.length) throw new Error("Enter a wallet address or ENS name.");
  if (items.length > 100) throw new Error("Use at most 100 wallets per scan.");
  const names = items.filter((item) => !addressSchema.safeParse(item).success);
  if (names.some((name) => !name.includes("."))) throw new Error("Enter valid 0x addresses or ENS names.");
  if (names.length > 20) throw new Error("Resolve at most 20 ENS names per scan.");
  let resolved: { name: string; address: string; record: "chain" | "ethereum" }[] = [];
  if (names.length) {
    const response = await fetch("/api/resolve-ens", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ names, chain }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "ENS lookup failed.");
    resolved = result.resolved;
  }
  const map = new Map(resolved.map((item) => [item.name.toLowerCase(), item.address]));
  const addresses = [...new Set(items.map((item) => {
    const address = addressSchema.safeParse(item).success ? item : map.get(item.toLowerCase());
    if (!address || !addressSchema.safeParse(address).success) throw new Error(`Could not resolve ${item}.`);
    return address.toLowerCase();
  }))];
  const fallback = resolved.filter((item) => item.record === "ethereum").length;
  return { addresses, description: resolved.length ? `Resolved ${resolved.length} ENS name(s) on Ethereum${fallback && chain !== "ethereum" ? `; ${fallback} used Ethereum address records` : ""}.` : "" };
}
