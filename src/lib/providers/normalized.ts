import { z } from "zod";
import {
  addressSchema,
  chainSchema,
  eventsSchema,
  type TradeEvent,
} from "@/lib/schema";
import { getOpenSeaEvents } from "./opensea";

const requestSchema = z.object({
  address: addressSchema,
  chain: chainSchema,
  contract: addressSchema.optional(),
  mode: z.enum(["wallet", "contract", "bot"]).default("wallet"),
});
const responseSchema = z.object({
  events: eventsSchema,
  nextCursor: z.string().max(500).nullable().optional(),
  partial: z.boolean().optional(),
  warning: z.string().max(300).optional(),
});
export type ScanRequest = z.infer<typeof requestSchema>;
export const parseScanRequest = (input: unknown) => requestSchema.parse(input);

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const publicScanCache = new Map<
  string,
  {
    expires: number;
    data: { events: TradeEvent[]; partial: boolean; warning?: string };
  }
>();

export async function getProviderEvents(
  input: ScanRequest,
): Promise<{ events: TradeEvent[]; partial: boolean; warning?: string }> {
  const endpoint = process.env.SENTINEL_PROVIDER_URL;
  const apiKey = process.env.SENTINEL_PROVIDER_API_KEY;
  const openSeaKey = process.env.OPENSEA_API_KEY;
  if (openSeaKey) return getOpenSeaEvents(input, openSeaKey);
  // The former Reservoir NFT API should not be selected implicitly.
  if (process.env.RESERVOIR_API_KEY && (!endpoint || !apiKey))
    throw new ProviderError("Reservoir NFT API is no longer the supported live provider. Set OPENSEA_API_KEY in Vercel Production and redeploy.", 503);
  if (!endpoint || !apiKey)
    throw new ProviderError(
      "NFT scanning is not configured. Add OPENSEA_API_KEY to the Vercel Production environment and redeploy.",
      503,
    );
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ProviderError("Provider URL is invalid.", 503);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ProviderError(
      "Provider URL must be a clean HTTPS endpoint.",
      503,
    );
  const cacheKey = `${input.address.toLowerCase()}:${input.chain}:${input.mode}:${input.contract?.toLowerCase() || ""}`;
  const cached = publicScanCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (res.status === 429)
      throw new ProviderError(
        "Data provider rate limit reached. Try again shortly.",
        429,
      );
    if (!res.ok)
      throw new ProviderError(
        "Data provider could not complete the scan.",
        502,
      );
    const length = Number(res.headers.get("content-length") || 0);
    if (length > 2_000_000)
      throw new ProviderError("Provider response is too large.", 502);
    const raw = await res.text();
    if (raw.length > 2_000_000)
      throw new ProviderError("Provider response is too large.", 502);
    const parsed = responseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new ProviderError("Provider returned an invalid response.", 502);
    const wallet = input.address.toLowerCase();
    const filtered = parsed.data.events.filter(
      (event) =>
        event.wallet.toLowerCase() === wallet &&
        event.chain === input.chain &&
        (!input.contract ||
          event.contract?.toLowerCase() === input.contract.toLowerCase()),
    );
    const data = {
      events: filtered,
      partial: Boolean(parsed.data.partial || parsed.data.nextCursor),
      warning: parsed.data.warning,
    };
    if (publicScanCache.size >= 100)
      publicScanCache.delete(publicScanCache.keys().next().value!);
    publicScanCache.set(cacheKey, { expires: Date.now() + 30_000, data });
    return data;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new ProviderError("Provider timed out. Try again.", 504);
    throw new ProviderError("Provider request failed. Try again.", 502);
  } finally {
    clearTimeout(timer);
  }
}
