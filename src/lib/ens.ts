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
    if (error instanceof Error && error.message === "This ENS name has no EVM address record.") throw error;
    throw new Error("ENS lookup is unavailable. Check the name or try a 0x address.");
  }
}
