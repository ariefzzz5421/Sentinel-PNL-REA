import { NextResponse } from "next/server";
import { z } from "zod";
import { addressSchema } from "@/lib/schema";
export const runtime = "nodejs";

const sourceSchema = z.object({
  address: addressSchema,
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  ens_name: z.string().nullable().optional(),
  profile_image_url: z.string().nullable().optional(),
  banner_image_url: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  is_verified: z.boolean().optional(),
});
function safeImage(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !addressSchema.safeParse(address).success) {
    return NextResponse.json({ error: "Enter a valid EVM wallet address." }, { status: 400 });
  }
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return NextResponse.json({ error: "OpenSea profile unavailable: OPENSEA_API_KEY is missing." }, { status: 503 });
  try {
    const response = await fetch(`https://api.opensea.io/api/v2/accounts/${address}`, {
      headers: { accept: "application/json", "x-api-key": key },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) {
      return NextResponse.json({ profile: null, reason: "No public OpenSea profile found." }, { status: 200 });
    }
    if (response.status === 429) return NextResponse.json({ error: "OpenSea profile rate limit reached." }, { status: 429 });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "OpenSea API key rejected." }, { status: 503 });
    if (!response.ok) return NextResponse.json({ error: "OpenSea account API unavailable." }, { status: 502 });
    const content = await response.text();
    if (content.length > 100_000) return NextResponse.json({ error: "Profile response too large." }, { status: 502 });
    const parsed = sourceSchema.safeParse(JSON.parse(content));
    if (!parsed.success || parsed.data.address.toLowerCase() !== address.toLowerCase())
      return NextResponse.json({ error: "OpenSea account profile was not valid." }, { status: 502 });
    const info = parsed.data;
    return NextResponse.json({
      profile: {
        address: info.address,
        displayName: info.display_name || info.username || info.ens_name || null,
        username: info.username || null,
        ensName: info.ens_name || null,
        avatar: safeImage(info.profile_image_url),
        banner: safeImage(info.banner_image_url),
        bio: info.bio?.slice(0, 500) || null,
        verified: Boolean(info.is_verified),
      },
    }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=300" } });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve public OpenSea profile." }, { status: 502 });
  }
}
