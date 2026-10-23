import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize, toCoinType } from "viem/ens";
import { addressSchema } from "@/lib/schema";

export function normalizeEnsInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 255 || !trimmed.includes(".")) throw new Error("Enter an ENS name or EVM address.");
  return normalize(trimmed);
}

export async function resolveEnsName(
  input: string,
  chainId: number,
  lookup?: (name: string, coinType?: bigint) => Promise<Address | null>,
): Promise<{ name: string; address: string; record: "chain" | "ethereum" }> {
  const name = normalizeEnsInput(input);
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ENS_RPC_URL || "https://ethereum-rpc.publicnode.com", { timeout: 8_000, retryCount: 0 }),
  });
  const get = lookup || ((value: string, coinType?: bigint) => client.getEnsAddress({ name: value, coinType }));
  try {
    const specific = chainId === 1 ? null : await get(name, toCoinType(chainId));
    const address = specific || await get(name);
    if (!address || !addressSchema.safeParse(address).success) throw new Error("This ENS name has no EVM address record.");
    return { name, address: address.toLowerCase(), record: specific ? "chain" : "ethereum" };
  } catch (error) {
    // Independent fallback: OpenSea's documented public ENS/account resolver.
    // Never treat a profile name as proof of wallet ownership.
    const key = process.env.OPENSEA_API_KEY;
    if (key) {
      try {
        const response = await fetch("https://api.opensea.io/api/v2/accounts/resolve/" + encodeURIComponent(name), {
          headers: { accept: "application/json", "x-api-key": key },
          signal: AbortSignal.timeout(8_000), redirect: "error", cache: "no-store",
        });
        if (response.ok) {
          const data: unknown = await response.json();
          if (data && typeof data === "object" && "address" in data && typeof data.address === "string"
              && addressSchema.safeParse(data.address).success) {
            return { name, address: data.address.toLowerCase(), record: "ethereum" };
          }
        }
      } catch { /* Fall back to the ENS provider's actionable error. */ }
    }
    if (error instanceof Error && error.message === "This ENS name has no EVM address record.") throw error;
    throw new Error("ENS lookup unavailable through Ethereum RPC and OpenSea. Check ENS_RPC_URL or use a 0x address.");
  }
}
