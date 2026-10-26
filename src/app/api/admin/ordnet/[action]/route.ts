import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE, CHALLENGE_COOKIE, SESSION_COOKIE, clearPrivateCookie, configured,
  constantTimePasswordMatches, createAdminTicket, getChallenge, getSession, isAdmin,
  ordnetFetch, readLimitedJSON, rejectCrossOrigin, seal, setPrivateCookie, upstreamError,
} from "@/lib/ordnet-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const walletPattern = /^(bc1[a-z0-9]{20,85}|[13][a-km-zA-HJ-NP-Z1-9]{25,40})$/;
const attempts = new Map<string, { count: number; resetAt: number }>();
type RouteContext = { params: Promise<{ action: string }> };
type Challenge = { authRequestId: string; challenges: { challengeId: string; address: string; message: string; role: string }[] };

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });
const ok = (data: unknown) => NextResponse.json(data, { headers });

function validChallenge(input: unknown): input is Challenge {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<Challenge>;
  return typeof value.authRequestId === "string" &&
    /^[0-9a-f-]{36}$/i.test(value.authRequestId) &&
    Array.isArray(value.challenges) && value.challenges.length >= 1 &&
    value.challenges.length <= 2 && value.challenges.every((item) =>
      typeof item.challengeId === "string" && /^[0-9a-f-]{36}$/i.test(item.challengeId) &&
      typeof item.address === "string" && walletPattern.test(item.address) &&
      typeof item.message === "string" && item.message.length > 0 && item.message.length <= 2048 &&
      (item.role === "ordinals" || item.role === "payment")
    );
}

export async function GET(request: Request, { params }: RouteContext) {
  const { action } = await params;
  if (action === "status") {
    const authenticated = isAdmin(request);
    const session = authenticated ? getSession(request) : null;
    return ok({
      configured: configured(), authenticated, connected: Boolean(session),
      expiresAt: session?.expiresAt ?? null,
      ordinalsAddress: session?.ordinalsAddress ?? null,
      paymentAddress: session?.paymentAddress ?? null,
    });
  }
  if (!isAdmin(request)) return fail("Admin login required.", 401);
  const session = getSession(request);
  if (!session) return fail("Connect ORD.NET wallet first.", 401);
  try {
    if (action === "me") {
      const profile = await ordnetFetch("/me", { token: session.sessionToken });
      return ok(profile);
    }
    if (action === "floors") {
      const slugs = new URL(request.url).searchParams.get("slugs") ?? "";
      if (!/^[a-z0-9-]+(,[a-z0-9-]+){0,9}$/.test(slugs) || slugs.length > 300)
        return fail("Provide 1–10 collection slugs (letters, numbers and hyphens).");
      return ok(await ordnetFetch("/collection-stats/floors?slugs=" + encodeURIComponent(slugs), { token: session.sessionToken }));
    }
    return fail("Unknown endpoint.", 404);
  } catch (error) { return upstreamError(error); }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { action } = await params;
  if (rejectCrossOrigin(request)) return fail("Invalid request origin.", 403);
  if (!configured()) return fail("Set ORDNET_ADMIN_PASSWORD (20+ chars) and ORDNET_COOKIE_SECRET (32+ chars) first.", 503);

  if (action === "login") {
    const peer = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = Date.now();
    if (attempts.size > 2000) attempts.clear();
    const existing = attempts.get(peer);
    if (existing && existing.resetAt > now && existing.count >= 5) return fail("Too many login attempts. Try later.", 429);
    try {
      const data = await readLimitedJSON(request, 1024) as { password?: unknown };
      if (typeof data?.password !== "string" || !constantTimePasswordMatches(data.password)) {
        attempts.set(peer, { count: existing && existing.resetAt > now ? existing.count + 1 : 1, resetAt: now + 15 * 60_000 });
        return fail("Invalid admin password.", 401);
      }
    } catch { return fail("Invalid request."); }
    attempts.delete(peer);
    const response = ok({ authenticated: true });
    setPrivateCookie(response, request, ADMIN_COOKIE, createAdminTicket(), 4 * 60 * 60);
    return response;
  }

  if (!isAdmin(request)) return fail("Admin login required.", 401);
  if (action === "logout" || action === "disconnect") {
    const response = ok({ connected: false, authenticated: action === "disconnect" });
    clearPrivateCookie(response, request, SESSION_COOKIE);
    clearPrivateCookie(response, request, CHALLENGE_COOKIE);
    if (action === "logout") clearPrivateCookie(response, request, ADMIN_COOKIE);
    return response;
  }

  if (action === "challenge") {
    try {
      const data = await readLimitedJSON(request, 2048) as { ordinalsAddress?: unknown; paymentAddress?: unknown };
      if (typeof data?.ordinalsAddress !== "string" || !walletPattern.test(data.ordinalsAddress) ||
          typeof data?.paymentAddress !== "string" || !walletPattern.test(data.paymentAddress))
        return fail("Use valid Bitcoin mainnet addresses.");
      const result = await ordnetFetch("/auth/challenge", { body: {
        ordinalsAddress: data.ordinalsAddress, paymentAddress: data.paymentAddress,
      } });
      if (!validChallenge(result)) return fail("Unexpected ORD.NET challenge format.", 502);
      const response = ok(result);
      setPrivateCookie(response, request, CHALLENGE_COOKIE, seal("challenge", result, Date.now() + 5 * 60_000), 300);
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return fail("Invalid request JSON.");
      return upstreamError(error);
    }
  }

  if (action === "verify") {
    try {
      const challenge = getChallenge(request);
      if (!challenge) return fail("Challenge expired. Start again.", 410);
      const data = await readLimitedJSON(request) as { authRequestId?: unknown; verifications?: unknown };
      if (data?.authRequestId !== challenge.authRequestId || !Array.isArray(data.verifications) ||
          data.verifications.length !== challenge.challenges.length) return fail("Challenge mismatch.");
      const verifications: unknown[] = Array.isArray(data.verifications) ? data.verifications : [];
      const matches = challenge.challenges.every((item) => verifications.some((verification: unknown) => {
        if (!verification || typeof verification !== "object") return false;
        const signed = verification as { challengeId?: unknown; address?: unknown; signature?: unknown };
        return signed.challengeId === item.challengeId && signed.address === item.address &&
          typeof signed.signature === "string" && /^[0-9a-f]{2,8192}$/i.test(signed.signature) &&
          signed.signature.length % 2 === 0;
      }));
      const identities = verifications.map((v) => (v as { challengeId?: unknown } | null)?.challengeId);
      if (!matches || new Set(identities).size !== identities.length) return fail("Signature list does not match the issued challenges.");
      const verified = await ordnetFetch("/auth/verify", { body: {
        authRequestId: challenge.authRequestId, verifications: data.verifications,
      } }) as { sessionToken?: unknown; expiresAt?: unknown };
      if (typeof verified?.sessionToken !== "string" || verified.sessionToken.length < 10 ||
          verified.sessionToken.length > 3000 || typeof verified.expiresAt !== "string")
        return fail("ORD.NET did not return a valid bearer session.", 502);
      const expiry = Date.parse(verified.expiresAt);
      if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 65 * 60_000)
        return fail("ORD.NET returned an invalid session expiry.", 502);
      const session = {
        sessionToken: verified.sessionToken, expiresAt: verified.expiresAt,
        ordinalsAddress: challenge.challenges.find((c) => c.role === "ordinals")?.address ?? challenge.challenges[0].address,
        paymentAddress: challenge.challenges.find((c) => c.role === "payment")?.address ?? challenge.challenges[0].address,
      };
      const response = ok({ connected: true, expiresAt: session.expiresAt,
        ordinalsAddress: session.ordinalsAddress, paymentAddress: session.paymentAddress });
      setPrivateCookie(response, request, SESSION_COOKIE, seal("session", session, expiry), Math.max(1, Math.floor((expiry - Date.now()) / 1000)));
      clearPrivateCookie(response, request, CHALLENGE_COOKIE);
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return fail("Invalid request JSON.");
      return upstreamError(error);
    }
  }
  return fail("Unknown endpoint.", 404);
}
