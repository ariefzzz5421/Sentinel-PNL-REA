# Public reference investigation

Observed on **2026-10-21** at <https://koalatools.app/> using public browser UI and a read-only request for the homepage HTML. No account was used. No proprietary source, asset, or private endpoint was copied.

## REA connection and evidence boundary

The `reverse-engineer-anything` skill v42 was available. Its MCP tools were **not exposed in this active Codex session**, so no REA browser capture or REA Evidence ID exists. A read-only `rea-agents@6.7.0 doctor --client codex --json` check reported the Codex registration at `C:\Users\ariefzzz.eth\.codex\config.toml` as aligned; that check explicitly reports the live server state as unknown. The initial doctor invocation hit a corrupt/full D: npm cache; repeating with a cache on F: succeeded. Reconnecting Codex is required before claiming REA MCP observation. Missing native disassemblers are irrelevant to public website observation.

## Page inventory and observed features

| Public page/state    | Observation                                                                                                                                                                                                                                               | Evidence                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Header brand, Scans button, theme toggle, Sign in link; chain chips for Ethereum, Base, Arbitrum, Abstract, ApeChain, Robinhood, Ink, Hyperliquid. Hero describes real-time NFT PnL from wallet addresses.                                                | Public homepage accessibility tree and screenshot, 2026-10-21.                                                            |
| `/` scanner          | Wallet text area, `.txt` wallet upload affordance, collection contract field, Scan / Scan Contract / Bot PNL actions. Initial state says “Nothing here yet.”                                                                                              | Public homepage accessibility tree.                                                                                       |
| `/` help copy        | Scan says up to 100 wallets and latest projects; Scan Contract says any number of wallets for one contract; Bot PNL instructs wallets used to sell plus collection contract. A free-account prompt advertises saved wallets, cache, and default PnL card. | Public homepage accessibility tree after fresh load. Claims are reference-site copy, not independently verified behavior. |
| `/login`             | Sign in / Create account toggle, email and password fields, forgot-password action, back-to-scanner link.                                                                                                                                                 | Public `/login` accessibility tree. No submission or account creation attempted.                                          |
| `/privacy`, `/terms` | Footer links exist.                                                                                                                                                                                                                                       | Public homepage and login accessibility trees. Page contents not inspected.                                               |

### Component map

`Header → chain selector → hero → wallet scanner (wallet input, TXT upload, contract input, three actions) → status/results area → usage help → footer`. A separate public authentication form exists at `/login`. No authenticated dashboard was observed.

### User journeys and states observed

1. Open `/` → Ethereum selected by default → empty scanner with “Nothing here yet.”
2. Click **Scan** with no wallet → “Invalid address” and “Got it.”
3. Enter publicly known `0x000000000000000000000000000000000000dEaD` and click **Scan** → buttons disable, “Scanning…” state appears → response ends in “Error: Mint receipt unavailable; retry scan” with “Got it.” No successful results were observed, so no result layout or numerical formula is established.
4. Click **Scan Contract** without contract → “Wallet and contract required.”
5. Click **Bot PNL** without contract → “Enter a valid contract address in the contract field.”
6. Open **Sign in** → public auth form; choose **Create account** → same email/password fields and a Create account action. No credentials were entered.

### Observable frontend and network evidence

- Read-only `GET /` returned HTTP 200, a Cloudflare server header, `Cache-Control: s-maxage=31536000`, and HTML containing `/_next/static/chunks/...js` scripts, including a `turbopack-...js` path. This supports a **Next.js frontend hypothesis**; it does not reveal the original backend architecture.
- The homepage HTML also referenced a Cloudflare Insights script. Script reference alone does not prove actual analytics collection or behavior.
- Public script URLs reveal chunk names, not a reliable map of original source modules. No source map or authored module hierarchy was established.
- Network request/response bodies for the scan were **not captured**. The observed UI error does not identify the server endpoint, payload, provider, cache policy, or exact business calculation.
- The visible chain list is an advertised UI list, not proof of equal data coverage on each chain.
- No pagination, filtering, successful caching, mobile breakpoints, animation timing, or response data formats were established from this observation.

## Confirmed facts, hypotheses, and unknowns

**Confirmed from UI:** NFT PnL is the primary public workflow; three scan actions and their basic validation/loading/error states exist; public login form exists; wallet and contract text inputs exist.

**Hypotheses:** `_next/static` paths suggest Next.js; public copy suggests scans are backed by an indexed on-chain data service and that accounts store wallets/card defaults. Neither claim establishes data storage architecture or implementation.

**Cannot observe yet:** successful wallet/contract/bot result; exact PnL equations; wallet import parsing; authenticated features; internal APIs; provider response schemas; pagination and cache semantics; complete responsive behavior. Further observation requires a working public scan, user-provided screenshots, or REA MCP reconnection in a future session.

## Product translation

Sentinel PNL adopts the useful public pattern: address-first NFT PnL, wallet/contract/bot modes, explicit scan states, and shareable card output. Its calculations, design, code, and provider boundary are original. With no successful reference result, no numeric or visual result detail is claimed to match the reference.

## 2026-10-21 UI reconstruction audit

### REA availability and actual call

The active Codex tool inventory contained **no REA MCP tools**, so no REA MCP browser observation was performed. A read-only diagnostic call, `npx -y rea-agents@6.7.0 doctor --client codex --json`, failed before reporting registration: the local npm cache lacked `@jridgewell/resolve-uri/dist/resolve-uri.mjs` and Node returned `ERR_MODULE_NOT_FOUND`. This is a CLI diagnostic failure, not an REA observation. No MCP configuration was changed. All screenshots and interactions below used ordinary browser inspection with Playwright CLI.

### Viewport evidence and component comparison

| Width | KoalaTools observation | Prior Sentinel | Reconstructed Sentinel |
| --- | --- | --- | --- |
| 1440 | Header, left account card, center chain strip/title/scanner, right help card, then empty results | Marketing hero and illustrative PnL card preceded scanner on a separate route | Scanner is the homepage; side cards flank the center form; local-ledger card substitutes for unavailable account features |
| 1024 | Side cards hidden; center form maxes near 880px | Separate marketing-first homepage | Centered chain strip, title, form, empty state |
| 768 | Same center sequence, large form with wallet field beside Scan | Scanner only on dashboard | Same center sequence with wallet field beside Scan |
| 390 | Compact header, horizontally clipped/scrollable chain strip, two-line title, Scan stacked under wallet field, contract/actions, then account card | Marketing content before scanner | Compact header, scrollable supported-chain strip, stacked Scan, contract/actions, local workspace card |

Screenshots: [reference 1440](screenshots/reference-1440.png), [reference 1024](screenshots/reference-1024.png), [reference 768](screenshots/reference-768.png), [reference 390](screenshots/reference-390.png); [Sentinel 1440](screenshots/sentinel-1440.png), [Sentinel 1024](screenshots/sentinel-1024.png), [Sentinel 768](screenshots/sentinel-768.png), [Sentinel 390](screenshots/sentinel-390.png). The final Sentinel captures came from the local production build.

The public reference at 1440 used a roughly 60px header, a centered horizontal chain list, a compact centered heading, and a cyan-outlined form with wallet entry plus Scan in one row. The contract input and Scan Contract / Bot PNL buttons sit below. At 390, Scan moves below the wallet input. Sentinel follows these relationships with original colors, typography, icons and component code. The original reference's account creation, login, cached scan history, and default PnL card are not available in Sentinel; the side card links to the existing local ledger instead.

### Observed interaction evidence and limits

After declining the optional consent dialog, clicking Scan with an empty wallet showed `Invalid address` and a `Got it` button. The earlier public scan with a burn address ended with `Mint receipt unavailable; retry scan`. No successful reference result was accessible, so its result layout, PnL formulas, export controls, and exact backend request/response remain unobserved. Sentinel's results continue on its own dashboard after a supported scan; no result screen is claimed to match the reference. Only three chain hosts are verified for the Reservoir implementation; the additional visible KoalaTools chain options are intentionally omitted from active Sentinel controls.
