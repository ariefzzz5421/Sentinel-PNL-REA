import { NextResponse } from "next/server";
import { z } from "zod";
import { addressSchema } from "@/lib/schema";

export const runtime = "nodejs";

const page = z.object({
  collections: z.array(z.object({
    collection: z.string(),
    name: z.string().trim().min(1),
    image_url: z.string().nullable().optional(),
    total_quantity: z.number().int().nonnegative(),
    contracts: z.array(z.object({ address: z.string(), chain: z.string() })).default([]),
  }).passthrough()).max(100),
  next: z.string().nullable().optional(),
});

function imageUrl(url: string | null | undefined) {
  if (!url || url.length > 1800) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : null; }
  catch { return null; }
}

/** Public, read-only OpenSea wallet collection holdings with bounded pagination. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!addressSchema.safeParse(address).success)
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });

  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENSEA_API_KEY is not configured." }, { status: 503 });

  const entries: Array<{ name: string; slug: string; imageUrl: string | null; held: number | null; chain: string; contract: string }> = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let partial = false;

  for (let i = 0; i < 6; i++) {
    const url = new URL(`https://api.opensea.io/api/v2/account/${address}/collections`);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("after", cursor);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json", "x-api-key": apiKey },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8500),
      });
    } catch {
      return NextResponse.json({ error: "OpenSea holdings API timed out." }, { status: 502 });
    }
    if (response.status === 429) return NextResponse.json({ error: "OpenSea holdings rate limit reached." }, { status: 429 });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "OpenSea API key rejected." }, { status: 503 });
    if (response.status === 404) return NextResponse.json({ holdings: [], partial: false }, { status: 200 });
    if (!response.ok) return NextResponse.json({ error: "OpenSea holdings API returned HTTP " + response.status }, { status: 502 });
    const raw = await response.text();
    if (raw.length > 1_000_000) return NextResponse.json({ error: "Holdings response too large." }, { status: 502 });
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid OpenSea holdings response." }, { status: 502 }); }
    const parsed = page.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Unexpected OpenSea holdings schema." }, { status: 502 });
    for (const collection of parsed.data.collections) {
      // Multi-contract collections are reported once per contract, not double-counted.
      for (const contract of collection.contracts) {
        if (!addressSchema.safeParse(contract.address).success) continue;
        const key = contract.chain + ":" + contract.address.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          slug: collection.collection, name: collection.name, imageUrl: imageUrl(collection.image_url),
          held: collection.contracts.length === 1 ? collection.total_quantity : null,
          chain: contract.chain, contract: contract.address.toLowerCase(),
        });
      }
    }
    if (!parsed.data.next) break;
    if (cursor === parsed.data.next) return NextResponse.json({ error: "Repeated OpenSea holdings cursor." }, { status: 502 });
    cursor = parsed.data.next;
    if (i === 5) partial = true;
  }
  return NextResponse.json({ holdings: entries, partial, warning: partial ? "Holdings list is paginated and may be incomplete." : undefined },
    { headers: { "Cache-Control": "private, no-store" } });
}
