/** Scan availability is separate from wallet network availability and accounting units. */
export const scanChains = [
  { id: "ethereum", label: "ETH", chainId: 1, currency: "ETH", scanReady: true, icon: "/chains/ethereum.svg" },
  { id: "base", label: "Base", chainId: 8453, currency: "ETH", scanReady: true, icon: "/chains/base-user.svg" },
  { id: "arbitrum", label: "ARB", chainId: 42161, currency: "ETH", scanReady: true, icon: "/chains/arbitrum.svg" },
  { id: "robinhood", label: "RH", chainId: 4663, currency: "ETH", scanReady: true, icon: "/chains/robinhood.png" },
  { id: "arc", label: "ARC", chainId: 5042, currency: "USDC", scanReady: false, icon: "/chains/arc.png" },
] as const;

export type ScanChain = (typeof scanChains)[number]["id"];
export const scanChainById = (id: ScanChain) => scanChains.find((chain) => chain.id === id)!;
