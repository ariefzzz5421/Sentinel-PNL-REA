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
