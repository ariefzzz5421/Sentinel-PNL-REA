import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Public readiness indicators only. Never return tokens or secret values. */
export async function GET() {
  return NextResponse.json({
    walletConnection: { configured: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID), provider: "Privy" },
    nftScanning: { configured: Boolean(process.env.OPENSEA_API_KEY), provider: "OpenSea", needs: process.env.OPENSEA_API_KEY ? [] : ["OPENSEA_API_KEY"] },
    ens: { dedicatedRpcConfigured: Boolean(process.env.ENS_RPC_URL), fallback: "Public Ethereum RPC; OpenSea resolution when configured" },
    limitations: ["ETH/WETH ERC-721 sales plus partially indexed mint and incoming transfer events", "Historical gas and unsupported token payment prices are excluded", "No complete-history guarantee"],
  }, { headers: { "Cache-Control": "no-store" } });
}
