/** Wallet-family detection is purely syntactic; providers verify real ownership. */
export type DiscoveryChain = "solana" | "bitcoin" | "ink";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const bitcoinBech32 = /^(bc1)[023456789acdefghjklmnpqrstuvwxyz]{11,87}$/i;
const bitcoinLegacy = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

export function isSolanaAddress(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  let decoded = 0n;
  for (const char of address) {
    const place = BASE58.indexOf(char);
    if (place < 0) return false;
    decoded = decoded * 58n + BigInt(place);
  }
  let bytes = 0;
  while (decoded > 0n) { bytes++; decoded >>= 8n; }
  const leadingZeros = (address.match(/^1*/) || [""])[0].length;
  return leadingZeros + bytes === 32;
}
export function isBitcoinAddress(address: string): boolean {
  // Syntax only, NOT full network checksum validation; Ordiscan checks ownership.
  return (address.length >= 14 && address.length <= 90 &&
    bitcoinBech32.test(address) && (address === address.toLowerCase() || address === address.toUpperCase())) ||
    bitcoinLegacy.test(address);
}
export function detectNonEvmWallet(input: string): "solana" | "bitcoin" | null {
  const address = input.trim();
  // Bech32 cannot be Solana; legacy Bitcoin and Solana can both begin with '1'.
  // Decode exact 32-byte Solana keys before accepting looser legacy BTC syntax.
  if (/^bc1/i.test(address) && isBitcoinAddress(address)) return "bitcoin";
  if (isSolanaAddress(address)) return "solana";
  if (isBitcoinAddress(address)) return "bitcoin";
  return null;
}
