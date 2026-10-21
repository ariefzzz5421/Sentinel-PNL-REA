import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeEnsInput, resolveEnsName } from "@/lib/ens";

describe("ENS resolution", () => {
  it("normalizes a name and uses its Ethereum address record", async () => {
    const lookup = vi.fn(async () => "0x000000000000000000000000000000000000dEaD" as const);
    const result = await resolveEnsName("ALICE.ETH", 1, lookup);
    expect(result).toEqual({ name: "alice.eth", address: "0x000000000000000000000000000000000000dead", record: "ethereum" });
    expect(lookup).toHaveBeenCalledWith("alice.eth");
  });
  it("prefers a chain record and falls back to the Ethereum record", async () => {
    const lookup = vi.fn(async (_name: string, coinType?: bigint) => coinType ? null : "0x000000000000000000000000000000000000dEaD" as const);
    const result = await resolveEnsName("alice.eth", 8453, lookup);
    expect(result.record).toBe("ethereum");
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid names and unresolved addresses", async () => {
    expect(() => normalizeEnsInput("alice")).toThrow();
    await expect(resolveEnsName("alice.eth", 1, async () => null)).rejects.toThrow("no EVM address record");
  });
});
