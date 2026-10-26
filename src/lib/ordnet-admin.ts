import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const ORDNET_BASE = "https://ord.net/api/v1";
export const ADMIN_COOKIE = "sentinel_ord_admin";
export const CHALLENGE_COOKIE = "sentinel_ord_challenge";
export const SESSION_COOKIE = "sentinel_ord_session";
const COOKIE_PATH = "/api/admin/ordnet";
const ADMIN_MAX_AGE = 4 * 60 * 60;

type Envelope<T> = { value: T; exp: number };
export type OrdnetChallenge = {
  authRequestId: string;
  challenges: { challengeId: string; address: string; message: string; role: string }[];
};
export type OrdnetSession = {
  sessionToken: string;
  expiresAt: string;
  ordinalsAddress: string;
  paymentAddress: string;
};

export function configured() {
  return Boolean(
    process.env.ORDNET_ADMIN_PASSWORD && process.env.ORDNET_ADMIN_PASSWORD.length >= 20 &&
    process.env.ORDNET_COOKIE_SECRET && process.env.ORDNET_COOKIE_SECRET.length >= 32
  );
}

function secret() {
  if (!configured()) throw new Error("ORD.NET admin credentials are not configured");
  return process.env.ORDNET_COOKIE_SECRET as string;
}

function key(scope: string): Buffer {
  return createHash("sha256").update("sentinel-ordnet-v1:" + scope + ":" + secret()).digest();
}

export function constantTimePasswordMatches(candidate: string): boolean {
  if (!configured() || typeof candidate !== "string") return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(process.env.ORDNET_ADMIN_PASSWORD as string).digest();
  return timingSafeEqual(a, b);
}

/** A signed admin session; never use the password as a cookie value. */
export function createAdminTicket(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ADMIN_MAX_AGE;
  const signature = createHmac("sha256", key("admin")).update(String(exp)).digest("base64url");
  return exp + "." + signature;
}

export function validAdminTicket(ticket?: string, now = Date.now()): boolean {
  if (!ticket || !configured()) return false;
  const [expRaw, signature, extra] = ticket.split(".");
  if (extra || !/^\d{10}$/.test(expRaw ?? "") || !signature) return false;
  const exp = Number(expRaw);
  const current = Math.floor(now / 1000);
  if (exp <= current || exp > current + ADMIN_MAX_AGE) return false;
  const expected = createHmac("sha256", key("admin")).update(expRaw).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** AES-256-GCM sealed payload. No plaintext bearer tokens are exposed to JavaScript. */
export function seal<T>(scope: string, value: T, expiresAt: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(scope), iv);
  const encoded = Buffer.from(JSON.stringify({ value, exp: expiresAt } satisfies Envelope<T>));
  const body = Buffer.concat([cipher.update(encoded), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal<T>(scope: string, payload?: string, now = Date.now()): T | null {
  if (!payload || !configured() || payload.length > 16000) return null;
  try {
    const [ivText, tagText, bodyText, extra] = payload.split(".");
    if (extra || !ivText || !tagText || !bodyText) return null;
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(scope), iv);
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]);
    const envelope = JSON.parse(raw.toString("utf8")) as Envelope<T>;
    if (!Number.isFinite(envelope.exp) || envelope.exp <= now || envelope.exp > now + 4 * 60 * 60 * 1000) return null;
    return envelope.value;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const found = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  if (!found) return undefined;
  try { return decodeURIComponent(found.slice(name.length + 1)); } catch { return undefined; }
}

export function isAdmin(request: Request) {
  return validAdminTicket(readCookie(request, ADMIN_COOKIE));
}

export function getSession(request: Request): OrdnetSession | null {
  const session = unseal<OrdnetSession>("session", readCookie(request, SESSION_COOKIE));
  if (!session || !session.sessionToken || Date.parse(session.expiresAt) <= Date.now()) return null;
  return session;
}

export function getChallenge(request: Request): OrdnetChallenge | null {
  return unseal<OrdnetChallenge>("challenge", readCookie(request, CHALLENGE_COOKIE));
}

export function setPrivateCookie(response: NextResponse, request: Request, name: string, value: string, seconds: number) {
  response.cookies.set(name, value, {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict",
    path: COOKIE_PATH, maxAge: seconds,
  });
}

export function clearPrivateCookie(response: NextResponse, request: Request, name: string) {
  setPrivateCookie(response, request, name, "", 0);
}

export function rejectCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Mutating routes are only invoked by first-party browser interactions.
  return !origin || origin !== new URL(request.url).origin;
}

export async function readLimitedJSON(request: Request, maximum = 20000): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > maximum) throw new Error("Too much input");
  const raw = await request.text();
  if (raw.length > maximum) throw new Error("Too much input");
  return JSON.parse(raw);
}

export async function ordnetFetch(path: string, options: { body?: unknown; token?: string } = {}) {
  const response = await fetch(ORDNET_BASE + path, {
    method: options.body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: "Bearer " + options.token } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error("ORD.NET returned an oversized response");
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* no untrusted response body in errors */ }
  if (!response.ok) {
    const error = new Error("ORD.NET returned HTTP " + response.status);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data;
}

export function upstreamError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status: unknown }).status) : 502;
  const code = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
  return NextResponse.json(
    { error: code === 403 ? "ORD.NET rejected authentication. Check the confirmed 0.001 BTC payment-address requirement." :
      code === 401 ? "ORD.NET rejected the signature or the session expired." :
      code === 410 ? "ORD.NET challenge expired. Request a fresh challenge." :
      code === 429 ? "ORD.NET rate limit reached. Try again later." :
      "ORD.NET request failed (HTTP " + code + ")." },
    { status: code, headers: { "Cache-Control": "no-store" } },
  );
}
