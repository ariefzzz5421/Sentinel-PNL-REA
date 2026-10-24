import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveEnsName } from "@/lib/ens";
import { scanChains } from "@/lib/scan-chains";

export const runtime = "nodejs";
const inputSchema = z.object({
  names: z.array(z.string().min(3).max(255)).min(1).max(20),
  chain: z.enum(scanChains.map((chain) => chain.id) as [string, ...string[]]),
});

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 6000)
      return NextResponse.json({ error: "Request too large." }, { status: 413 });
    const input = inputSchema.parse(await request.json());
    const selected = scanChains.find((chain) => chain.id === input.chain);
    // ENS resolution in this endpoint is EVM-only. Never route non-EVM SOL requests
    // or unsupported chain selections to an Ethereum chain ID.
    if (!selected || !selected.scanReady || selected.chainId === null)
      return NextResponse.json({ error: "ENS lookup is not available for this network." }, { status: 400 });
    const chainId = selected.chainId;
    const unique = [...new Set(input.names.map((name) => name.trim().toLowerCase()))];
    const resolved = [];
    for (let index = 0; index < unique.length; index += 4) {
      resolved.push(...await Promise.all(unique.slice(index, index + 4).map((name) => resolveEnsName(name, chainId))));
    }
    return NextResponse.json({ resolved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid ENS lookup request." : error instanceof Error ? error.message : "ENS lookup failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
