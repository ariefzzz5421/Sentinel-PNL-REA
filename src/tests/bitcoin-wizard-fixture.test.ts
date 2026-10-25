import { describe, expect, it, vi } from "vitest";
import { discoverNfts } from "../lib/nft-discovery";

// Public fixture: ORD.NET lists this address for Taproot Wizards #0581.
// https://ord.net/inscription/149814 (ownership may change after snapshot).
const wizardOwner = "bc1p4r4jq6l5n22sw34x5fjnknsc4fsz7pe62dj26vyntfdal5a20ffswdt2cz";
const wizardInscription = "471ed29d65d3d12e5c76fa34ed650f9507491142a4423f050d24ed7e3646c8cfi0";

describe("public Taproot Wizards Ordinals scanner fixture", () => {
  it("accepts a publicly listed holder and maps Ordiscan results without inventing BTC PnL", async () => {
    vi.stubEnv("ORDISCAN_API_KEY", "unit-only-not-a-real-key");
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain(encodeURIComponent(wizardOwner));
      return new Response(JSON.stringify({ data: [{
        inscription_id: wizardInscription, owner_address: wizardOwner,
        inscription_number: 149814, content_type: "image/webp",
        content_url: "https://ordiscan.com/content/" + wizardInscription,
      }] }), { status: 200 });
    });
    try {
      const result = await discoverNfts({ chain: "bitcoin", address: wizardOwner }, fetcher as typeof fetch);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].id).toBe(wizardInscription);
      expect(result.pnlAvailable).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
});
