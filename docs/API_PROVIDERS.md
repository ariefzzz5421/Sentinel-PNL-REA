# Provider contract

## Official Reservoir adapter

Set `RESERVOIR_API_KEY` in the server environment. The key is read only by `src/lib/providers/normalized.ts` and sent in the server-side `x-api-key` header. Do not use `NEXT_PUBLIC_` or place the key in the browser.

The adapter calls Reservoir's documented [Users activity v6](https://nft.reservoir.tools/reference/getusersactivityv6) endpoint, `GET /users/activity/v6`, for `sale` and `mint` activities. It requests 20 items per page, follows `continuation`, deduplicates stable activity IDs, and stops after 25 pages. Official [supported chain URLs](https://nft.reservoir.tools/reference/supported-chains) identify:

| Chain | API host |
| --- | --- |
| Ethereum | `https://api.reservoir.tools` |
| Base | `https://api-base.reservoir.tools` |
| Arbitrum | `https://api-arbitrum.reservoir.tools` |

The mapping requires a sale direction relative to the scanned wallet, a valid contract and token ID, a unique event identity, a valid timestamp, and a native ETH or chain WETH payment price. A sale to the wallet becomes `buy`; a sale from it becomes `sell`; a mint received by it becomes `mint`. Unsupported ERC-20 currencies, unpriced records, ambiguous directions, and quantities other than one are excluded; these mark coverage partial. The adapter does not convert currencies or infer a free mint from a missing price. It filters contract mode locally after validating the contract address. Bot mode aggregates supplied wallets in the same ledger; it does not infer wallet ownership or specialized bot trading strategy.

Reservoir user activity does not establish the wallet's actual gas and all other transaction fees. For mapped events, `feeEth: "0"` is an accounting placeholder paired with `feeKnown: false`; the dashboard labels matched PnL and cost basis as estimates. The schema preserves this marker in CSV export/import. Manual CSV rows remain supported. The older normalized provider below remains a fallback when `RESERVOIR_API_KEY` is unset.

**Verification boundary:** Endpoint parameters and chain hosts were checked against Reservoir's public documentation on 2026-10-21. This environment could not resolve the API host, and no API key was available, so live response shape and live chain coverage have not yet been verified. Tests currently use a clearly marked synthetic contract fixture, not a recorded API response. Replace/add sanitized recordings and run a credentialed live scan before claiming production data accuracy.

Robinhood Chain and Arc are **not** Reservoir scan targets in this app. Their official RPC endpoints provide blockchain calls but do not by themselves supply a validated history of NFT purchases, sales, mints, fees, or currency conversions. Scan requests for either return an explicit 503 until a chain-specific indexed activity adapter is implemented and tested.

## Legacy normalized provider

Live scanning is **unconfigured by default**. Set `SENTINEL_PROVIDER_URL` to a trusted HTTPS endpoint under your control and `SENTINEL_PROVIDER_API_KEY` to its server-side key. Do not place either in a `NEXT_PUBLIC_` variable. This app does not call the reference website's private APIs.

The app POSTs:

```json
{
  "address": "0x000000000000000000000000000000000000dEaD",
  "chain": "ethereum",
  "mode": "wallet"
}
```

`chain`: `ethereum | base | arbitrum`. `mode`: `wallet | contract | bot`. Contract and bot modes also send a validated `contract` EVM address. The UI accepts up to 100 wallet addresses and sends one bounded request per address, four at a time. The provider authenticates with `x-api-key`. It must respond with:

```json
{
  "events": [
    {
      "id": "unique-event-id",
      "date": "2026-01-01T00:00:00Z",
      "chain": "ethereum",
      "wallet": "0x000000000000000000000000000000000000dEaD",
      "collection": "Example Collection",
      "contract": "0x0000000000000000000000000000000000000001",
      "tokenId": "7",
      "type": "buy",
      "amountEth": "1.00",
      "feeEth": "0.01"
    }
  ],
  "partial": false,
  "nextCursor": null
}
```

`txHash` and `warning` are optional. Amounts are decimal strings, max 18 fractional digits. Maximum 10,000 events and 2 MB. If `nextCursor` is non-null or `partial` true, Sentinel labels coverage partial; automatic multi-page fetching is not implemented. The adapter filters mismatched wallet/chain/contract events after validation.

For a future provider integration, verify that its source truly covers NFT purchases, mints, sales, paid fees, and all required chains. [Moralis's documented wallet PnL endpoint](https://docs.moralis.com/web3-data-api/evm/reference/wallet-api/get-wallet-profitability) describes fungible-token swaps, so it cannot be substituted for NFT PnL. A provider mapper should be implemented and tested separately before enabling it, particularly for currency conversion and marketplace-specific events.
