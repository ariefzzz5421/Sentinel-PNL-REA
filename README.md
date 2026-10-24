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


## PnL Card Studio (October 2026)

Tap any NFT collection and choose `Complete` or `Simple`. The preview and downloaded PNG are rendered from the exact same Canvas; customize alias, image background (local PNG/JPG/WebP up to 5MB), crop size (Fixed/Fit image), font family, and alias font size. `Share image` uses the system share sheet when supported, otherwise downloads the PNG. `Share on X` opens an X post composer containing text but **cannot attach an image automatically**; download and attach manually. No wallet signing is required.

`ETH ↔ USD` uses a current CoinGecko display quote fetched server-side from `/api/market/eth-usd` and does **not** imply historical execution-rate conversion. If pricing is unavailable, USD is disabled. Gas cannot be toggled when provider receipt costs are unknown; the UI explains this rather than fabricating zero fees. ROI is computed only over buys matched to sales; mint/transfer counts remain unknown until actual history is indexed. Both preview and exported image label estimated / partial data.

Network selector uses compact `ETH, Base, ARB, RH, ARC` labels. RH allows ETH-based OpenSea sales with the official wrapped ETH contract; ARC is selectable but the existing ETH-ledger is **not** used for Arc's USDC-native PnL, which would otherwise produce incorrect ETH metrics. An Arc scan returns an informative unsupported-calculation message until a USDC-native accounting engine is implemented.

Supporting evidence: https://docs.opensea.io/reference/get_chains, https://docs.opensea.io/reference/list_events_by_account, https://opensea.io/blog/articles/robinhood-chain-is-live-on-opensea, https://opensea.io/blog/articles/arc-is-live-on-opensea.


## Typography, live market tape, and USD beside NFT PnL

Typography defaults: Space Grotesk for headings, Satoshi for interactive interface text (loaded from Fontshare with Inter fallback), IBM Plex Mono for all data and PnL metrics. Optional card headline fonts include Oswald and Orbitron. Font files are loaded by the app, not committed as redistributed files.

The home scanner now includes a compact, animated market tape: BTC, ETH, BNB, HYPE with **USD spot price, 24h percent change and provider logo image**. Data comes from the CoinGecko `/coins/markets` endpoint through `/api/market/ticker`, cached 90 seconds server-side and polled every 90 seconds by active browser clients. API key is **optional** for best-effort public use: `COINGECKO_DEMO_API_KEY`, configured only as a server-side Vercel env var, can improve free-tier quota. When quotes are unavailable, the UI explicitly says so; it never inserts fake or persisted market prices. Logos are returned directly by CoinGecko metadata, with unbranded letter placeholders if absent. CoinGecko credit appears on the tape.

The NFT card studio shares the exact same ETH quote from `/api/market/eth-usd`, renders the estimated ETH PnL alongside approximate current USD conversion (e.g. `+0.0040 ETH ≈ $8.00` when ETH is $2,000), and shows a provider timestamp. This **is not historical trade USD PnL**. USD is omitted if the live quote is offline or stale (>10 min). Fonts, alias, background, size and Complete/Simple controls redraw the preview; PNG export renders again from those same selected settings. Share on X only supplies text; images must be attached manually.

Useful data references: https://docs.coingecko.com/reference/coins-markets, https://support.coingecko.com/articles/4315804955-can-i-use-coingecko-data-and-screenshots-for-my-website-book-etc.

## NFT mint history and compact share-card layout

The OpenSea adapter now queries `sale`, `mint`, and `transfer` event history separately on the selected chain. Sale history remains capped at 1,200 entries, mint history at 600, and inbound transfers at 400. The two supplementary requests run alongside sales; if supplementary data is unavailable, sales can still load and the result remains partial. One purchase and the associated NFT transfer with the same tx/contract/token is deduplicated.

**Mint accounting:** minted NFTs and transferred-in NFTs contribute to independent event counts, **not purchases**. Mint transfer-like events may not contain exact mint payment or gas; imported `mint`/`transfer_in` events set `basisKnown:false`. The PnL engine retains the lot with unknown cost basis so a later sale is never assigned free acquisition cost. Not all third-party mints are indexed on OpenSea; for missing history, transaction receipt/blockchain indexer support remains future work. ERC-1155 batch mints remain intentionally unsupported.

The share-card PNG now uses only the Sentinel icon in the upper left, keeps ETH and spot-USD on one line (or reversed in USD mode), and shows spot USD beside AVG BUY, AVG SALE, TOTAL INVESTED, and TOTAL SALES. The card footer displays the optional user alias above the full wallet address. Caveats about estimated profits, incomplete history, and spot conversion remain **outside** the image in the studio's methodology text and scan details. Do not treat current USD conversion as historical cost basis.

Performance improvements include: memoized image decoding (with bounded size), 75ms debounce for edit-triggered Canvas redraw, server-cached CoinGecko market data, and independent paginated event-type fetches so supplementary feed errors don't wipe out supported sales.

### Card and ticker UI refinements

Share-card preview and downloaded PNG use a single tabular-monospace PnL baseline with ETH followed by a spot USD annotation separated by one space; all quoted dollar values in the table are compact, right-aligned beside the corresponding ETH metric. The divider has more room before the metric rows. A small per-chain logo is placed next to the top-right chain label. The ETH/USD display toggle and the disabled gas toggle were removed because their presence implied unsupported accounting controls. ETH is always the native accounting unit; USD is a display-only current-rate equivalent. Fees remain omitted when unknown.

The top market tape no longer renders the visible CoinGecko/time pill; provider attribution and timestamps remain internal to the market-data response. The Base tab uses the user-provided blue square reference (recreated as a tiny SVG and normalized to the other chain logos). All existing chain availability / scan logic remains unchanged.
