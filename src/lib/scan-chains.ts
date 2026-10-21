/** Scan availability is separate from wallet network availability and accounting units. */
export const scanChains = [
  { id: "ethereum", label: "Ethereum", chainId: 1, currency: "ETH", scanReady: true },
  { id: "base", label: "Base", chainId: 8453, currency: "ETH", scanReady: true },
  { id: "arbitrum", label: "Arbitrum", chainId: 42161, currency: "ETH", scanReady: true },
  { id: "robinhood", label: "Robinhood Chain", chainId: 4663, currency: "ETH", scanReady: false, icon: "/chains/robinhood.png" },
  { id: "arc", label: "Arc", chainId: 5042, currency: "USDC", scanReady: false, icon: "/chains/arc.png" },
] as const;

export type ScanChain = (typeof scanChains)[number]["id"];
export const scanChainById = (id: ScanChain) => scanChains.find((chain) => chain.id === id)!;
