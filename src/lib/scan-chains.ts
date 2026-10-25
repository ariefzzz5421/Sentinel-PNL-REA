/** Scan availability is separate from wallet network availability and accounting units. */
export const scanChains = [
  { id: "ethereum", label: "ETH", chainId: 1, currency: "ETH", scanReady: true, icon: "/chains/ethereum.svg" },
  { id: "base", label: "Base", chainId: 8453, currency: "ETH", scanReady: true, icon: "/chains/base-user.svg" },
  { id: "arbitrum", label: "ARB", chainId: 42161, currency: "ETH", scanReady: true, icon: "/chains/arbitrum.svg" },
  { id: "robinhood", label: "RH", chainId: 4663, currency: "ETH", scanReady: true, icon: "/chains/robinhood.png" },
  { id: "arc", label: "ARC", chainId: 5042, currency: "USDC", scanReady: false, icon: "/chains/arc.png", unavailableReason: "Arc requires USDC-native NFT PnL accounting; scanning is not supported yet." },
  // Solana uses base58 addresses and a different transaction/indexing model, not EVM chain IDs.
  { id: "solana", label: "SOL", chainId: null, currency: "SOL", scanReady: false, discoveryReady: true, icon: "/chains/solana.svg", unavailableReason: "Solana holdings discovery is available. Historical NFT sale PnL is not indexed yet." },
  { id: "ink", label: "INK", chainId: 57073, currency: "ETH", scanReady: false, discoveryReady: true, icon: "/chains/ink.svg", unavailableReason: "Ink: recent NFT transfer discovery is available with a collection contract. Historical sale PnL requires an indexer." },
  { id: "bitcoin", label: "BTC", chainId: null, currency: "BTC", scanReady: false, discoveryReady: true, icon: "/chains/bitcoin.svg", unavailableReason: "Bitcoin Ordinals holdings discovery is available. Historical BTC sale PnL is not indexed yet." },
] as const;

export type ScanChain = (typeof scanChains)[number]["id"];
export const scanChainById = (id: ScanChain) => scanChains.find((chain) => chain.id === id)!;
