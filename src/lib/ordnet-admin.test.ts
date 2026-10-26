import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configured, constantTimePasswordMatches, createAdminTicket, validAdminTicket,
  seal, unseal,
} from "./ordnet-admin";

describe("ORD.NET admin credentials and cookies", () => {
  beforeEach(() => {
    vi.stubEnv("ORDNET_ADMIN_PASSWORD", "secure-test-password-must-be-long-123");
    vi.stubEnv("ORDNET_COOKIE_SECRET", "development-test-only-32-byte-cookie-secret-123456");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when security environment variables are missing", () => {
    vi.stubEnv("ORDNET_COOKIE_SECRET", "");
    expect(configured()).toBe(false);
    expect(constantTimePasswordMatches("secure-test-password-must-be-long-123")).toBe(false);
  });

  it("only accepts the exact configured admin password", () => {
    expect(constantTimePasswordMatches("secure-test-password-must-be-long-123")).toBe(true);
    expect(constantTimePasswordMatches("secure-test-password-must-be-long-124")).toBe(false);
  });

  it("signs admin tickets and rejects expired or modified tickets", () => {
    const now = Date.parse("2026-10-27T00:00:00.000Z");
    const ticket = createAdminTicket(now);
    expect(validAdminTicket(ticket, now)).toBe(true);
    expect(validAdminTicket(ticket + "x", now)).toBe(false);
    expect(validAdminTicket(ticket, now + 4 * 60 * 60 * 1000 + 1)).toBe(false);
  });

  it("decrypts intact short-lived data, never tampered or expired data", () => {
    const now = Date.now();
    const encoded = seal("session", { sessionToken: "dummy-token" }, now + 20_000);
    expect(unseal<{ sessionToken: string }>("session", encoded)?.sessionToken).toBe("dummy-token");
    expect(unseal("challenge", encoded)).toBe(null);
    expect(unseal("session", encoded + "x")).toBe(null);
    expect(unseal("session", encoded, now + 21_000)).toBe(null);
  });
});
