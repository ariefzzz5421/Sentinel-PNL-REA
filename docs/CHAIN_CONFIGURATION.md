# Chain, ENS, and optional wallet setup

## Current network scope

| Network | ID | Native gas | Wallet network | NFT PnL scan |
| --- | ---: | --- | --- | --- |
| Ethereum | 1 | ETH | Privy when configured | OpenSea key required |
| Base | 8453 | ETH | Privy when configured | Reservoir key required |
| Arbitrum | 42161 | ETH | Privy when configured | Reservoir key required |
| Robinhood Chain | 4663 | ETH | Privy when configured | Not integrated; explicit 503 |
| Arc | 5042 | USDC (18 decimals) | Privy when configured | Not integrated; explicit 503 |

The [Robinhood network settings](https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/) and [Arc network settings](https://docs.arc.io/arc/references/connect-to-arc) were verified against their operators' public documentation on 2026-10-21. The wallet SDK uses their published public RPCs as network metadata. A user-supplied `ROBINHOOD_RPC_URL` or `ARC_RPC_URL` may later be used by a server-side data adapter, but those variables are currently reserved and do not enable scanning. An NFT indexer/API key plus verified event, price, fee, pagination, and currency mappings are required. Arc needs a currency-aware replacement for the current `amountEth` schema before PnL can be enabled.

The Arc icon was downloaded from Arc's own `arc.io` favicon asset. The Robinhood Chain icon is the Robinhood feather network mark distributed by Binance's chain icon CDN, visually consistent with Robinhood's published Chain branding. These marks are used only to identify their networks; Sentinel PNL branding uses the icon from the user's Sentinel Bot site checkout.

## ENS names

The scanner accepts 0x addresses and ENS names such as `name.eth` in the same field. It resolves names on Ethereum mainnet through the server-side `/api/resolve-ens` route using viem's ENS Universal Resolver. For a selected L2, it tries the chain-specific record first and falls back to the Ethereum address record; the UI reports that fallback. The server uses `ENS_RPC_URL` when set, otherwise the public `https://ethereum-rpc.publicnode.com` endpoint. A dedicated RPC is recommended for reliability. ENS is a naming lookup, not proof that the resolved address is controlled by the person entering it. See [ENS address lookup](https://docs.ens.domains/web/resolution/) and [viem getEnsAddress](https://viem.sh/docs/ens/actions/getEnsAddress).

## Privy connection

1. Create your own Privy app and allow `http://localhost:3000` plus your deployed domain in its dashboard.
2. Put its **public** app ID in `NEXT_PUBLIC_PRIVY_APP_ID` in `.env.local` or your host environment, then restart/redeploy. Do not put a Privy app secret in a `NEXT_PUBLIC_` variable. No app secret is needed for this local-only profile.
3. The **Connect wallet** action opens Privy's wallet login. The linked wallet's `/profile` view filters this browser's ledger and can request a public scan. The existing scanner accepts pasted addresses with no login.

The profile is not cloud storage and does not isolate the local ledger from another person using the same browser profile. Adding server-side account storage later requires Privy access-token verification and per-user authorization before protected API access. No server-side protected account endpoints exist now. See [Privy React setup](https://docs.privy.io/basics/react/setup).
