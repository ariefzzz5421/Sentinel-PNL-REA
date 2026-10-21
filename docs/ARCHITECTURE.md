# Architecture

Next.js App Router with strict TypeScript. The public landing page and methodology are server-rendered. The interactive workspace is a client component because it owns form state, local ledger, filters, chart, CSV, and PNG export. The optional `/api/scan` route keeps the provider key on the server.

```text
UI (landing, dashboard, methodology)
  ├── local CSV/manual ledger → Zod validation → decimal-safe PnL → chart/table/card
  └── POST /api/scan → request validation → server provider adapter → response validation → ledger
```

`src/lib/schema.ts` defines the normalized event contract. `src/lib/pnl/calculate.ts` is pure accounting logic. `src/lib/import-export.ts` handles CSV. `src/lib/providers/normalized.ts` is the configurable server-only provider boundary. The UI never receives provider credentials.

The server adapter uses a fixed HTTPS URL from environment configuration, a 12-second timeout, a 2 MB response cap, no redirects, no-store fetch, Zod validation, and wallet/chain/contract filtering. Validated public scan results have a bounded 30-second in-memory cache by address, chain, mode, and contract. `/api/scan` applies a small process-local repeat-request throttle. This cache and throttle are **not distributed**; Vercel deployments should add an external limit before enabling expensive provider traffic at scale.

The local ledger uses browser local storage. It has no cloud synchronization or account authentication. Users can export CSV for backup. Imported data never leaves the browser unless the user runs a live scan; the scan submits only the entered public address, chain, optional contract, and mode to the configured server route.

There is no wallet connection, transaction signing, private key handling, or trading execution. The app remains useful offline from imported or manually entered records.
