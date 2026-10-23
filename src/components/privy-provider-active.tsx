"use client";
import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { defineChain } from "viem";
import { mainnet, base, arbitrum, arc } from "viem/chains";

const robinhood = defineChain({
  id: 4663, name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export default function ActivePrivyProvider({ children, appId }: { children: ReactNode; appId: string }) {
  return <PrivyProvider appId={appId} config={{
    loginMethods: ["wallet"],
    appearance: { theme: "dark", accentColor: "#a987f5", logo: "/sentinel-logo.svg" },
    supportedChains: [mainnet, base, arbitrum, robinhood, arc],
    embeddedWallets: { ethereum: { createOnLogin: "off" } },
  }}>{children}</PrivyProvider>;
}
