# Sentinel PNL

**Track Every Move. Know Your Edge.**

An independent NFT trade PnL workspace. The homepage is a wallet scanner; the dashboard contains the local trade ledger, CSV tools, charts, and NFT PnL. It matches one-token ETH-denominated purchases and sales and keeps missing cost basis unknown. The site has original branding, components, architecture, and code.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:3000`. Manual trade entry and CSV import work without credentials through **My ledger**. Data is saved in browser local storage. Use **Export CSV** to retain a portable copy.

You can paste a `0x` address or ENS name without connecting a wallet. ENS names resolve on Ethereum mainnet through the server; set `ENS_RPC_URL` for a dedicated resolver RPC. Optional Privy wallet login and the connected-wallet profile activate when `NEXT_PUBLIC_PRIVY_APP_ID` is set to your own Privy app ID. Configure your allowed domains in Privy. The profile filters the existing browser ledger by a linked wallet; it does not sync data to an account. See [chain and wallet setup](docs/CHAIN_CONFIGURATION.md).

For optional Reservoir scanning, copy `.env.example` to `.env.local`, set `RESERVOIR_API_KEY` to your own key, then restart the server. The adapter uses Reservoir's official user activity endpoint for Ethereum, Base, and Arbitrum. A legacy normalized provider remains available as a fallback. See [docs/API_PROVIDERS.md](docs/API_PROVIDERS.md). Live response mapping is pending verification with a sanitized recorded API response and a credentialed scan.

## CSV format

Headers: `id,date,chain,wallet,collection,contract,tokenId,type,amountEth,feeEth,feeKnown,txHash`. Old CSVs without `feeKnown` still import. `id`, `contract`, and `txHash` are optional; manual `feeEth` defaults to `0`. Provider rows have `feeKnown=false` when transaction fees are unavailable. Date must be ISO 8601 with timezone. Chain is `ethereum`, `base`, or `arbitrum`; type is `buy`, `mint`, or `sell`. Amounts are nonnegative ETH strings with at most 18 decimal places.

Example (fictional entries):

```csv
id,date,chain,wallet,collection,contract,tokenId,type,amountEth,feeEth,feeKnown,txHash
example-buy,2026-01-01T00:00:00Z,ethereum,0x000000000000000000000000000000000000dEaD,Example Collection,0x0000000000000000000000000000000000000001,7,buy,1.00,0.01,true,
example-sell,2026-02-01T00:00:00Z,ethereum,0x000000000000000000000000000000000000dEaD,Example Collection,0x0000000000000000000000000000000000000001,7,sell,1.50,0.01,true,
```

## Commands

`npm.cmd test` · `npm.cmd run lint` · `npm.cmd run typecheck` · `npm.cmd run build`

## Research and limitations

- [Reference investigation](docs/REVERSE_ENGINEERING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [PnL methodology](docs/PNL_METHODOLOGY.md)
- [Data provider contract](docs/API_PROVIDERS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Chain and wallet setup](docs/CHAIN_CONFIGURATION.md)

Wallet connection is optional. No transaction signing, private key export, or transaction execution is implemented. All displayed PnL is an estimate and is not financial or tax advice.


## Connected wallet: personal PnL dashboard

When `NEXT_PUBLIC_PRIVY_APP_ID` is configured and the production origin is allowed in Privy, the homepage **Connect Wallet** button opens wallet login. A new successful login routes to `/profile`, a read-only one-page dashboard for the selected connected EVM address. Supported activity is scanned once per wallet/chain per browser session and can be refreshed manually. The dashboard filters local events to the selected address, shows realized PnL only for matched cost-basis sales, and marks unverified gas fees and incomplete coverage. It does not combine unrelated wallets, execute trades or persist an authenticated server account.

The advanced manual/CSV workspace is still available at `/dashboard`; it is no longer the homepage header CTA. This preserves existing exports and import functionality.

**Configure Privy:** set `NEXT_PUBLIC_PRIVY_APP_ID` in Vercel Production environment, allow the production origin and localhost in the Privy console, then redeploy (the `NEXT_PUBLIC_` variable is bundled at build time). **Never** add Privy app secrets to public variables or GitHub. An NFT activity provider is still required separately for a real scan; logging in via Privy alone does not provide NFT price history.


## Live OpenSea wallet NFT history and profile

Set `OPENSEA_API_KEY` in Vercel > Project > Settings > Environment Variables for **Production**, then redeploy. This is the server-side key for both `GET /api/opensea/profile?address=0x…` and `POST /api/scan`. `NEXT_PUBLIC_PRIVY_APP_ID` remains a separate **public** key for wallet authentication. Never put the OpenSea secret in a public environment variable, browser, repository, or screenshot. Old `RESERVOIR_API_KEY` does not enable new live scans and should be removed.

Upon wallet connection, `/profile` fetches public OpenSea name, avatar, banner and bio, then attempts Ethereum, Base and Arbitrum activity scans. It shows the latest priced buy/sell events and ranks positive realized PnL only for matched NFT purchases and sales. Historic gas, marketplace fees, unsupported ERC-20 payments and some mints/transfers cannot be reconstructed and are not invented. The first 1,200 sale events **per chain** are scanned at most; pagination truncation and unsupported records are surfaced to the user. A wallet not having an OpenSea profile does not stop public address scanning. Scans require an actual API key and live endpoint verification; passing synthetic tests does not certify live accuracy.

OpenSea references:
- https://docs.opensea.io/reference/get_account
- https://docs.opensea.io/reference/list_events_by_account
- https://docs.opensea.io/reference/api-keys


## Collection-first scan results (reference-based reconstruction)

The public scanner at `/` now retains successful results **inline** rather than redirecting to `/dashboard`. The UI provides Recent / Best PNL / Holding filters, per-collection Bought / Sold / Hold, estimated realized ETH PnL, collection images when public metadata is available, and CSV export. No claims of exact KoalaTools backend equivalence are made.

Sources of truth are different:
- Buy/sell counts and matched realized PnL: priced single-quantity ETH/WETH OpenSea account sale events, capped at four pages per selected chain.
- Hold (current quantity) and collection thumbnail: OpenSea wallet owned-collections endpoint. Multi-contract collection quantities remain unknown instead of double-counted.
- Mints, ERC-1155 batch purchases, non-ETH currency payments, gas/fees, and history before the scan window can be missing; unknown cost basis is never shown as a zero-cost profit.

A configured `OPENSEA_API_KEY` is still necessary for live data. Verify it safely via `/api/status`, which exposes **configuration booleans only, never secrets**. For developer diagnostics, inspect the response/status of `POST /api/scan` in the browser network panel.

The personal profile route `/profile` stays internal. The previously misleading external 'OpenSea profile' header CTA has been replaced with an internal scanner link.

 
## Mobile PnL cards & collection interactions

The public scan page shows compact per-collection cards. Tap any collection to view its own recorded trades and a preview of a shareable **estimated** PnL image. `Share PNG` uses the mobile Web Share API when supported; otherwise it downloads a PNG. `Download` always exports the image. The card is generated locally from already retrieved wallet data, so no secret or signed transaction is required. The card labels partial history and estimates explicitly.

NFT scans now request up to 6 cursor pages of 200 sale events per chain. This increases coverage but does **not** recover unknown mints, gas, unsupported ERC-20 payments, or events beyond the limit. Buying 15 vs 16 NFTs at a reference site can reflect different event coverage, not just a frontend issue. Holdings with uncertain counts stay unverified, not hardcoded as zero. Chain icons are small self-contained vector symbols based on public network branding; logos do not imply affiliation.

Mobile changes: compact wallet / ENS placeholder, smaller contract actions, scrollable chain selector, simplified scan status, and collection results immediately below the form (no intervening workspace card).
