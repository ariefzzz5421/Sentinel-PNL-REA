# Architecture

Next.js App Router with strict TypeScript. The scanner homepage is a server-rendered page wrapping a small client component for form state and navigation; methodology is server-rendered. The interactive dashboard is a client component because it owns the local ledger, filters, chart, CSV, and PNG export. The optional `/api/scan` route keeps provider keys on the server.

```text
UI (scanner homepage, dashboard, methodology)
  ├── local CSV/manual ledger → Zod validation → decimal-safe PnL → chart/table/card
  └── POST /api/scan → request validation → Reservoir or legacy provider adapter → response validation → ledger
```

`src/lib/schema.ts` defines the normalized event contract, including `feeKnown` for provider fee uncertainty. `src/lib/pnl/calculate.ts` is pure accounting logic. `src/lib/import-export.ts` handles CSV. `src/lib/providers/reservoir.ts` maps official NFT user activity; `src/lib/providers/normalized.ts` selects Reservoir when keyed and retains the legacy normalized fallback. The UI never receives provider credentials.

The Reservoir adapter uses fixed official HTTPS hosts, a 12-second timeout per page, a 2 MB page cap, no redirects, no-store fetch, Zod validation, a 25-page limit, and local wallet/chain/contract filtering. Complete public scan results have a bounded 30-second in-memory cache by address, chain, mode, and contract. `/api/scan` applies a small process-local repeat-request throttle. This cache and throttle are **not distributed**; Vercel deployments should add an external limit before enabling expensive provider traffic at scale.

The local ledger uses browser local storage. It has no cloud synchronization. Users can export CSV for backup. Imported data never leaves the browser unless the user runs a live scan; the scan submits only the entered public address, chain, optional contract, and mode to the configured server route. ENS names go to `/api/resolve-ens`, which resolves them against Ethereum mainnet and returns canonical public addresses before scanning.

Privy is an optional client-side authentication layer, enabled only with `NEXT_PUBLIC_PRIVY_APP_ID`. The `/profile` page selects among linked EVM wallets, filters the existing local ledger by address, and can scan that public address through the existing API. It is not a cloud account database or a server authorization boundary. No transaction signing, private key handling, or trading execution is implemented. The scanner and ledger remain usable without connecting.

`src/lib/scan-chains.ts` keeps wallet network metadata separate from the ETH-denominated trade schema. Robinhood Chain and Arc can be shown and configured as wallet networks but are not accepted by the NFT scan adapter. Arc's native gas asset is USDC; it cannot share the current ETH PnL schema without a new currency-aware adapter and accounting model.
