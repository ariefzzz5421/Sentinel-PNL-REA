# ORD.NET admin wallet authentication (read-only)

This implementation is intentionally separate from the **Ordiscan** Bitcoin inscription discovery route and all existing EVM, Solana, and NFT PnL UI. No scanner/PNL method is modified by this PR.

## API contract and wallet flow

Reference: https://developers.ord.net/reference/authentication/ and https://developers.ord.net/openapi.json

1. Visit `/admin/ordnet` on the deployed Sentinel host.
2. Unlock with a strong admin password set in the Vercel server environment.
3. Install and unlock the **UniSat** browser extension; select **Bitcoin mainnet**.
4. Click **Connect UniSat**. Both address fields initially use the selected UniSat account. If Ordinals and payment addresses differ, edit the fields to their exact values.
5. Request a challenge from `POST /auth/challenge`.
6. Click **Sign next BIP-322 message** to sign each exact ORD.NET challenge. For separate addresses, select the requested address in UniSat before clicking the next button.
7. The app converts UniSat's Base64 BIP-322 simple witness to hex, and submits all signatures to `POST /auth/verify`.
8. ORD.NET checks the payment address has at least **100,000 confirmed sats**. This is an eligibility check, not an API fee.
9. The returned token is sealed using AES-256-GCM in an HttpOnly, Secure-on-HTTPS, SameSite=Strict cookie. Client JavaScript never receives a bearer token. The cookie is specific to this browser; no shared central database is provided.
10. Test a read-only `GET /me` or `GET /collection-stats/floors` under **Read-only API diagnostics**. A token lasts approximately 1 hour; sign a new challenge to reconnect.

The admin password and signing flow must never be exposed via public homepage UI. The admin page is marked noindex but noindex **is not** a security control: the password-protected API is the real protection.

## Required environment variables

```dotenv
ORDISCAN_API_KEY=...        # existing Ordiscan integration, untouched
ORDNET_ADMIN_PASSWORD=...   # unique high-entropy secret, >=20 characters
ORDNET_COOKIE_SECRET=...    # random >=32 characters; openssl rand -hex 32
```

Set both new values in Vercel **server-side** Production environment variables and redeploy. Never prefix them with `NEXT_PUBLIC_`; never commit actual values. `ORDNET_API_TOKEN` is **not** required and is not read by this implementation.

To generate a random cookie key locally:

```sh
openssl rand -hex 32
```

The encrypted session expires with ORD.NET. It does *not* refresh automatically because wallet signing requires an explicit admin action. A deployment that changes `ORDNET_COOKIE_SECRET` invalidates existing encrypted sessions and admin login tickets.

## Security boundaries

- The endpoint only calls the *fixed official* `https://ord.net/api/v1` host, preventing user-supplied SSRF URLs.
- The only outbound POST methods are `/auth/challenge` and `/auth/verify`. No listing, buying, spending, signing PSBTs, or transfer submission routes exist.
- All mutation routes require the browser's same origin; admin sessions are HMAC signed, and sensitive challenge and bearer session data is AES-256-GCM encrypted at rest in HttpOnly cookies.
- The login endpoint has an **instance-local** failure throttle (5 attempts/15 minutes). This is not a distributed rate limit on Vercel; use Vercel Deployment Protection, an upstream WAF/rate limiter, and a high-entropy admin password for production.
- Challenge expiration is 5 minutes. Tokens remain browser-specific even across stateless Vercel functions; no shared server-side token persistence exists.
- Tokens are intentionally not returned by any API response, log or diagnostic.
- If ORD.NET responds 401/403/410/429/503, the UI reports a controlled error without exposing raw upstream response bodies.
- The shared browser environment is a security boundary: any browser extension with access to your device can potentially initiate wallet signing. Always verify the exact ORD.NET sign-in message inside the wallet before approving.

## Existing scanner

- Ordiscan stays the source for public Bitcoin holdings by address.
- ORD.NET provides **supplementary marketplace information**. This PR adds a restricted admin diagnostic floor-price call, but **does not** feed ORD.NET data into public scanning/PNL calculations. That would require a separate provider mapper with rigorous cost-basis matching and independent tests.
- ORD.NET sessions are tied to the admin browser; they are intentionally not globally shared with anonymous visitors. Do not describe this integration as a 24/7 automated public-market-data backend.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Admin setup required | Missing/short server environment secrets, or redeploy not complete |
| No UniSat wallet | Wallet extension not installed or current browser doesn't expose `window.unisat` |
| Next address cannot sign | Switch the selected UniSat account to the exact challenge address |
| Invalid signature (401) | Wrong message/signing account or wallet does not support BIP-322 simple |
| Ineligible payment address (403) | Less than 100,000 confirmed sats, or ORD.NET rejects wallet |
| Challenge expired (410) | Request a fresh challenge and sign promptly |
| Session expired (401) | Reconnect and sign again; no background renewal |
| Invalid request origin (403) | Access the deployed page and API from the same host/protocol |
| Rate limited (429) | Wait before requesting another challenge |
