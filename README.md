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


## Mobile compact design (Oct 2026)

The public NFT scanner now uses a slim mobile-first layout for approximately 320–430 px screens: 56px header, 38px chain chips, 35px market tape, tighter hero copy, 48px primary Scan button, compact collection result cards, and trimmed studio controls. No wallet scanning, provider, or PnL accounting routes were changed.

The animated ticker deliberately has **no visible "MARKET" label** and uses the entire horizontal bar for BTC/ETH/BNB/HYPE assets. The feed's accessible loading/error status remains available. Reduced-motion users can horizontally scroll the stopped ticker.

The PnL share card defaults to a **portrait composition** better suited to phone viewing, while preserving Complete/Simple modes and working Canvas-based custom alias, font, background, Fit image, PNG export and native share. The layout follows a compact NFT avatar + title + chain heading, grouped minted/bought/sold/hold/transfer, trading values, realized profit, and wallet footer. ETH spot-USD figures remain approximate, not historical execution prices, and unknown mint basis remains unknown.

Validate at 320, 375, 390, 430, 768, 1024 and 1440px. Mobile browser visual test and real native share sheet on iOS should be checked after deployment; CI unit tests alone do not prove device rendering.


### Wallet dashboard redesign: compact artwork-first activity (October 2026)

- The connected wallet profile at `/profile` keeps OpenSea identity and wallet selection, then renders a full-width, live BTC/ETH/BNB/HYPE market tape above its scan controls.
- Informational "Latest scan completed" text and repeated full-screen success notices are gone. Refresh/scan errors stay visible, and partial-history limitations remain accessible in a collapsed disclosure. **Do not interpret partial NFT history as audited complete PnL.**
- The three panels are stacked in reading order at **all** breakpoints: Top Performers, Collection PnL, Latest NFT Trades.
- Row thumbnails use real `imageUrl` values from indexed NFT events and (where available) OpenSea public collection holdings. Images are mapped by **chain + contract**, lazily loaded, and safely fall back to a neutral icon when the public provider has no image. No artwork is fabricated.
- The BUY/SELL/MINT/TRANSFER badge is located directly beside the NFT name in the Activity row, never detached at the left edge.
- ETH amounts throughout the overview, top performers, breakdown, and activity show approximate current USD equivalents from the same validated `/api/market/eth-usd` endpoint as the share card. If the feed is stale or unavailable, the USD amount is omitted rather than invented.
- Per-trade fee/cost-basis caveats are removed from compact rows; the methodology and expandable coverage notes remain available. The PnL engine and financial calculations are unchanged.


### Solana / Ink network selectors and SOL market ticker

The chain selector displays `ETH · Base · ARB · RH · ARC · SOL · INK`. Official Solana Foundation logomark and Ink chain mark SVGs are checked in at `public/chains/solana.svg` and `public/chains/ink.svg`, respectively, preserving the upstream artwork (see [Solana branding](https://solana.com/branding) and [Ink brand kit](https://docs.inkonchain.com/work-with-ink/brand-kit)).

**Network UI does not imply scan coverage.** Solana uses a non-EVM address model and is not supported by the current EVM NFT scanner. Ink is an EVM L2 (mainnet chain ID 57073, gas ETH) but has no verified indexed NFT sale/mint adapter in this app. SOL and INK tabs provide accurate explanatory status upon selection/scan; neither fabricates PnL or submits malformed data to the existing EVM API. Arc remains visible with its existing USDC accounting limitation.

The market tape now includes SOL alongside BTC, ETH, BNB, and HYPE from one CoinGecko `/coins/markets` query. It shows real provider USD spot quotes and 24h changes, cached server-side for 90 seconds. The SOL ticker uses the official local Solana Foundation logo. When a quote is absent, the UI displays a dash—not a made-up price. All existing assets continue to use CoinGecko-provided images when available.


### Card artwork polish

The PnL PNG renderer now places the Sentinel brand icon in the **upper-right** corner (54×54 pixels on the native 900px Canvas), and increases the collection art cover-cropped thumbnail to **126×126** with rounded corners while retaining room for the title and the first divider. The mobile result list also receives slightly larger 56px collection previews (50px at ≤360px). Generated PNG and in-app preview are drawn with the same renderer.

**Note on SOL / INK:** The chain selector and SOL ticker were introduced previously in PR #13. No duplicate fetches or unsupported NFT scanner adapters are added in this styling PR. The GitHub `main` branch already contains `/chains/solana.svg` and `/chains/ink.svg`, the chain labels, and SOL CoinGecko prices. If they do not appear in the live site, check whether Vercel production has deployed the current `main` commit.


## Non-EVM NFT Discovery (Helius · Ink · Ordiscan)

The existing ETH/WETH EVM realized PnL scanner remains unchanged. NFT Discovery is a **separate read-only feature** that never combines SOL, BTC or unpriced Ink transfers into ETH accounting. Verified Ordinals BTC PnL and the existing matched gross SOL PnL are reported only in their native currency; absent cost basis is **Unknown**.

Required **server-only** Vercel environment variables, for the relevant Production / Preview targets:

| Key | Usage | Limits |
|---|---|---|
| HELIUS_API_KEY | Solana DAS getAssetsByOwner | Current NFT holdings; maximum 2 × 100 per scan |
| ORDISCAN_API_KEY | Ordiscan owned inscriptions, confirmed address activity and optional collection floors | Bitcoin holdings max 3 × 100; history max 2 × 1,000; sent-inscription metadata max 12 |\n| ORD_NET_SESSION_TOKEN (optional) | ORD.NET confirmed sales + collection floors | Read-only GET; sales max 2 × 100 per collection, max 4 collections per scan; session expires after ~1 hour |
| INK_RPC_URL | Ink Mainnet eth_chainId, eth_blockNumber, eth_getLogs | Specific ERC-721 contract only; latest 1,000 blocks |

The keys stay on server. The public /api/status endpoint reveals booleans, never secrets. Redeploy Vercel after adding env variables.

Usage:
1. Paste EVM wallet, select INK and enter a collection contract, then Scan. This shows recent inbound/outbound ERC-721 Transfer logs, not complete holdings or sales.
2. Paste 32-byte base58 Solana address and hit Scan; it auto-selects SOL, queries Helius DAS, and shows owned NFTs.
3. Paste bc1… / 1… / 3… Bitcoin mainnet address and hit Scan; it auto-selects BTC and queries Ordiscan inscriptions. Address syntax is checked, but the provider confirms actual ownership.
4. SOL / BTC have no contract-filtered scan or Bot PnL. BTC shows owned inscription cards, history, collection floors and verified-subset realized/unrealized PnL where prices are verified. Scans are bounded and explain incomplete coverage.

**Not supported:** complete cross-address Bitcoin wallet accounting, attribution of unverified transfers, incomplete marketplace sale histories, precise BTC mining/marketplace fees, all historical Solana sales, Ink historical backfills, complex/ERC-1155 mint costs, or combined cross-currency PnL. An address by itself never establishes historical cost basis.

API docs: https://www.helius.dev/docs/das-api · https://ordiscan.com/docs/api · https://developers.ord.net/reference/sales/ · https://developers.ord.net/reference/authentication/ · https://docs.inkonchain.com/tools/rpc .


### Public discovery UI & matched Solana gross PnL

- Collection discovery no longer displays a large warning panel. Empty scans render **No NFT Trades Found** (the discovery backend actually queries current holdings, so an empty result does not prove absence of historical trades).
- The home kicker is **SENTINEL ANALYSIS**.
- Solana holdings explicitly exclude compressed NFT assets (both the CompressedNFT interface and compression flag). This does not verify legitimacy; a standard NFT can still be spam.
- For supported non-compressed NFT marketplace `NFT_SALE` transactions, the Helius Enhanced Transactions API may return a seller, buyer, **lamports** price and a single NFT mint. The backend conservatively matches a purchase and a later sale of the *same mint* by one wallet within the latest 200 indexed transactions. It reports **matched gross SOL PnL before fees** only if one or more pairs have verifiable prices. Otherwise the UI shows **— SOL**, never a false zero. Unsupported sources, fee attribution, SOL-token swaps, bundles, mints, unpaired sales and complete historical coverage are excluded. Helius Enhanced API is a legacy service and access may be restricted by plan; the existing Helius holdings scanner remains functional when PnL history is inaccessible.
- Taproot Wizards #0581 owner address listed publicly at https://ord.net/inscription/149814 is used as a **mocked unit-test fixture**, not a claim that its ownership or live API response is verified at deploy time. Bitcoin results use an isolated BTC-denominated calculator, never the ETH event ledger.

To validate an address with real data, use the production site, a public wallet, and browser Network tab; do not paste private API keys or seed phrases.

### Bitcoin Ordinals: reliability, read-only operations & setup

- Configure `ORDISCAN_API_KEY` on the Vercel server for public holdings and confirmed transfer history. Use **no** `NEXT_PUBLIC_` prefix. A client only pastes a public mainnet Bitcoin address; it does not connect a wallet, sign messages or provide private keys.
- If available, provision `ORD_NET_SESSION_TOKEN` **server-side** for `GET /sales` and `GET /collection-stats/floors`. **ORD.NET does not offer a normal API key**. Its bearer token is obtained via a separate wallet challenge/signature by the site operator, and expires in approximately one hour. Sentinel never calls any ORD.NET trade endpoint, signs on behalf of users, or refreshes sessions with private keys. Without a valid session, known prices and realized PnL remain **Unknown**; Ordiscan-only market floors, if available, are indicative quotes, not acquisition costs.
- Per-scan limits to protect rate quotas: three owned-inscription pages (300), two transfer-activity pages (2,000), twelve missing-item metadata lookups, and up to four collection slugs (200 confirmed sales each from ORD.NET). Those are **recent bounded windows**, never a complete historic wallet ledger. Provider-response caching is 1–5 minutes in each server instance, and results are privately returned without storing addresses in browser persistence for this non-EVM scan.
- A BTC `buy` or `sell` requires **matching inscription ID, settlement txid, confirmed Ordiscan transfer direction and wallet/counterpart, plus an ORD.NET confirmed sale price**. Transfers without matching sales remain `RECEIVED` or `SENT`. Matching a sell with an unknown buy basis still shows realized PnL as **Unknown**. A positive acquisition price and sale price form a gross, pre-fee realized PnL and ROI; holdings with verified price history and available collection floor may show a separate **partial estimated unrealized** value.
- BTC funds held at **other addresses**, unindexed inscription activity, unclassified collections, OTC transactions absent from the indexed confirmed sales, inscriptions minted without known mint cost, and marketplace fees cannot be inferred. Avoid treating a collection floor or BTC output-value transfer as a historic transaction price. Public fixture tests mock provider responses and are **not live financial verification**.

### BTC Ordinals NFT Cards (Ordiscan-first, read-only)

- Scan a **single BTC address** through the existing Scan form. No connection, signing, private key, database migration, or new frontend API key is needed. The backend uses ORDISCAN_API_KEY.
- Bitcoin results now offer **Create PnL Card**, with **Wallet overview** and **Collection** modes based on scan-derived collections. Download PNG (1080 × 1350) or Share image using the device share sheet. Share on X opens text-only intent; attach the PNG manually.
- The card canvas consumes the same BTC report as the existing BTC table and transfer history; ETH, SOL and Ink accounting remain unchanged. If cross-origin artwork cannot be embedded in canvas, a placeholder is drawn rather than failing PNG export.
- **ORD.NET is optional, not needed to render cards.** Ordiscan holdings, transfers and collection floor quotes do not establish purchase or sale prices. Unverified realized/unrealized PnL and ROI must be **Unknown**. Collection floor is a market quote, not cost basis.
- With confirmed sale pricing available from a separately configured provider, realized PnL/ROI show only verified matched transactions, before fees. Unrealized PnL is a floor-based partial estimate on holdings with verified cost. One-address scans and historical windows are incomplete.
- Existing CI typecheck, lint, tests and production build protect other chains. All automated price fixture tests use mock provider responses, not live market prices.
