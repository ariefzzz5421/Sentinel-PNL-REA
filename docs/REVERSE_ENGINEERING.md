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
