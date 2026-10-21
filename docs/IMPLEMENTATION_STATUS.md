# Implementation status

## Implemented and locally testable

- Original Sentinel PNL landing page, responsive dashboard, methodology page.
- Manual one-token NFT trade entry, local persistence, CSV import/export.
- Decimal-safe realized PnL including acquisition/sale fees and unknown-basis handling.
- Date windows (24H, 7D, 30D, ALL), collection and trade tables, text search, realized PnL chart.
- Downloadable PNG performance card created from ledger data.
- Validated, configurable server-side provider boundary with explicit loading/error states; up to 100 pasted or `.txt` wallet addresses are accepted for a bounded batch scan.

## Conditional / not claimed live

- Wallet, contract, and bot scan modes require a compatible external provider and API key. No provider is bundled or credentialed, so live on-chain scan behavior is not claimed working.
- Ethereum, Base, and Arbitrum are accepted only as schema identifiers until provider coverage is proven. Solana is deferred because its address and NFT trade models need a separate validated adapter.
- Unrealized PnL is unavailable because no verified current valuation source is configured.
- Authenticated accounts, multi-wallet server persistence, and automated historical pagination are not implemented.

## Verification on 2026-10-21

- `npm.cmd test`: 7 tests passed across accounting, wallet parsing, and CSV validation.
- `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`: passed.
- `npm.cmd audit --omit=dev --audit-level=high`: 0 vulnerabilities reported.
- Production server at `127.0.0.1:3001`: `/`, `/dashboard`, and `/methodology` opened. Browser console on the production dashboard had 0 errors and 0 warnings.
- Browser flow: entered a 1.00 ETH buy with 0.01 fee and a 1.50 ETH sale with 0.01 fee; dashboard displayed +0.4800 ETH. PNG and CSV downloads succeeded; reimporting the exported CSV and loading a two-address `.txt` list succeeded. An unconfigured scan displayed the intended 503 message.
- Dashboard page width equaled viewport width at 360, 390, 768, 1024, 1280, and 1440 px; production landing and methodology pages also had no overflow at 360 px.

## Release boundary

GitHub and Vercel release state should be verified separately from these local checks. Update this file after live provider tests.
