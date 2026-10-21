# Implementation status

## Implemented and locally testable

- Reference-structured wallet scanner homepage, responsive dashboard, methodology page.
- Manual one-token NFT trade entry, local persistence, CSV import/export.
- Decimal-safe realized PnL including acquisition/sale fees and unknown-basis handling.
- Date windows (24H, 7D, 30D, ALL), collection and trade tables, text search, realized PnL chart.
- Downloadable PNG performance card created from ledger data.
- Official Reservoir user activity v6 adapter for Ethereum, Base, and Arbitrum hosts, plus the existing normalized-provider fallback; server-side key, bounded pagination, deduplication, unsupported-currency and missing-price exclusion, and partial coverage warnings.
- Validated server-side scan API with explicit loading/error states; up to 100 pasted or `.txt` wallet addresses are accepted for a bounded batch scan.

## Conditional / not claimed live

- Wallet, contract, and bot scan modes require a user-supplied Reservoir key or legacy normalized provider key. No key is present locally. The adapter is implemented but a live scan and real payload mapping have not been verified.
- Ethereum, Base, and Arbitrum endpoint hosts were verified against Reservoir documentation; live response behavior on each chain remains unverified. Solana is deferred because its address and NFT trade models need a separate validated adapter.
- Unrealized PnL is unavailable because no verified current valuation source is configured.
- Authenticated accounts and multi-wallet server persistence are not implemented. Reservoir continuation pagination is implemented, bounded to 25 pages.

## 2026-10-21 verification of approved change set

- REA MCP tools were absent in the active session. A REA CLI doctor call failed with `ERR_MODULE_NOT_FOUND` in the local npm cache. Reference inspection used ordinary public browser observation and screenshots, accurately labeled in the investigation document.
- KoalaTools and local Sentinel screenshots were captured at 1440, 1024, 768, and 390 px. The homepage was rebuilt around the observed scanner hierarchy; successful reference results were unavailable.
- Synthetic adapter contract fixtures test pagination, deduplication, mint/buy/sell classification, missing price, unsupported currency, route response and PnL. They are **not recorded Reservoir fixtures**. The user offered a sanitized live response and successful reference scan screenshot; these remain needed before claiming complete schema or result-layout verification.
- Local browser check: empty wallet validation and valid-wallet unconfigured-provider error displayed correctly on the new homepage. No live Reservoir key was used.
- Synthetic browser flow with a mocked `/api/scan` response reached the dashboard and displayed a 0.5000 ETH **estimate** with an explicit fee warning. Separately, Vitest exercised the real API route through the adapter and PnL engine using synthetic pages. These do not substitute for a credentialed live scan.
- Final local checks: `npm.cmd test` 14/14 passed; `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build` passed. The production browser was checked at 1440, 1024, 768, and 390 px with no horizontal document overflow.
- This change set is approved for GitHub. Deployment remains pending a separate request.

## Prior baseline verification (before this local change set)

- `npm.cmd test`: 7 tests passed across accounting, wallet parsing, and CSV validation.
- `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`: passed.
- `npm.cmd audit --omit=dev --audit-level=high`: 0 vulnerabilities reported.
- Production server at `127.0.0.1:3001`: `/`, `/dashboard`, and `/methodology` opened. Browser console on the production dashboard had 0 errors and 0 warnings.
- Browser flow: entered a 1.00 ETH buy with 0.01 fee and a 1.50 ETH sale with 0.01 fee; dashboard displayed +0.4800 ETH. PNG and CSV downloads succeeded; reimporting the exported CSV and loading a two-address `.txt` list succeeded. An unconfigured scan displayed the intended 503 message.
- Dashboard page width equaled viewport width at 360, 390, 768, 1024, 1280, and 1440 px; production landing and methodology pages also had no overflow at 360 px.

## Release boundary

GitHub and Vercel release state should be verified separately from these local checks. Update this file after live provider tests.
