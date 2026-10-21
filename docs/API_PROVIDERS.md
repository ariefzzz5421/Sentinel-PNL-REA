# Provider contract

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
