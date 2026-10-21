# Sentinel PNL

**Track Every Move. Know Your Edge.**

An independent NFT trade PnL workspace. It matches one-token ETH-denominated NFT purchases and sales, includes fees, and keeps missing cost basis unknown. The site has original branding, components, architecture, and code.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:3000`. The workspace works without credentials through manual trade entry and CSV import. Data is saved in browser local storage. Use **Export CSV** to retain a portable copy.

For optional live scanning, copy `.env.example` to `.env.local`, set a trusted HTTPS provider URL and its server-side API key, then restart the dev server. The provider must implement the normalized contract in [docs/API_PROVIDERS.md](docs/API_PROVIDERS.md). Live scanning is unavailable until configured and verified against a real provider.

## CSV format

Headers: `id,date,chain,wallet,collection,contract,tokenId,type,amountEth,feeEth,txHash`. `id`, `contract`, and `txHash` are optional; `feeEth` defaults to `0`. Date must be ISO 8601 with timezone. Chain is `ethereum`, `base`, or `arbitrum`; type is `buy`, `mint`, or `sell`. Amounts are nonnegative ETH strings with at most 18 decimal places.

Example (fictional entries):

```csv
id,date,chain,wallet,collection,contract,tokenId,type,amountEth,feeEth,txHash
example-buy,2026-01-01T00:00:00Z,ethereum,0x000000000000000000000000000000000000dEaD,Example Collection,0x0000000000000000000000000000000000000001,7,buy,1.00,0.01,
example-sell,2026-02-01T00:00:00Z,ethereum,0x000000000000000000000000000000000000dEaD,Example Collection,0x0000000000000000000000000000000000000001,7,sell,1.50,0.01,
```

## Commands

`npm.cmd test` · `npm.cmd run lint` · `npm.cmd run typecheck` · `npm.cmd run build`

## Research and limitations

- [Reference investigation](docs/REVERSE_ENGINEERING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [PnL methodology](docs/PNL_METHODOLOGY.md)
- [Data provider contract](docs/API_PROVIDERS.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)

No wallet connection, signing, private key, or transaction execution exists in this application. All displayed PnL is an estimate and is not financial or tax advice.
