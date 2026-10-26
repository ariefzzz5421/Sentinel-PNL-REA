import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public readiness indicators only. Never return tokens or secret values. */
export async function GET() {
  return NextResponse.json({
    walletConnection: { configured: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID), provider: "Privy" },
    nftScanning: { configured: Boolean(process.env.OPENSEA_API_KEY), provider: "OpenSea", needs: process.env.OPENSEA_API_KEY ? [] : ["OPENSEA_API_KEY"] },
    discovery: {
      solana: { configured: Boolean(process.env.HELIUS_API_KEY), scope: "current NFT holdings only", pnlReady: false },
      bitcoin: { configured: Boolean(process.env.ORDISCAN_API_KEY), scope: "read-only owned inscriptions and confirmed transfer history for one Bitcoin address", pnlReady: false, verifiedSaleFeedConfigured: Boolean(process.env.ORD_NET_SESSION_TOKEN), pnlScope: "verified, matched subset only; a configured token does not guarantee current authenticated access" },
      ink: { configured: Boolean(process.env.INK_RPC_URL), scope: "recent ERC-721 transfers for a specified contract", pnlReady: false },
    },
    ens: { dedicatedRpcConfigured: Boolean(process.env.ENS_RPC_URL), fallback: "Public Ethereum RPC; OpenSea resolution when configured" },
    limitations: ["ETH/WETH ERC-721 sales plus partially indexed mint and incoming transfer events", "Historical gas and unsupported token payment prices are excluded", "No complete-history guarantee"],
  }, { headers: { "Cache-Control": "no-store" } });
}
