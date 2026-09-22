import { describe, expect, it } from "vitest";
import { shouldUseSecureCookie } from "@/lib/auth/cookie-policy";

const production = { NODE_ENV: "production" };
const development = { NODE_ENV: "development" };

describe("the session cookie's Secure attribute", () => {
  it("is set for a request that arrived over HTTPS", () => {
    expect(shouldUseSecureCookie("https", production)).toBe(true);
    expect(shouldUseSecureCookie("https", development)).toBe(true);
  });

  it("is not set for plain HTTP, where a browser would just discard it", () => {
    // The case this exists for: `npm start` on a PC, opened from a phone.
    expect(shouldUseSecureCookie("http", production)).toBe(false);
  });

  it("reads the client-facing hop of a proxy chain", () => {
    expect(shouldUseSecureCookie("https, http", production)).toBe(true);
    expect(shouldUseSecureCookie("http, https", production)).toBe(false);
    expect(shouldUseSecureCookie(" HTTPS ", production)).toBe(true);
  });

  it("falls back to the environment when the header is missing", () => {
    expect(shouldUseSecureCookie(null, production)).toBe(true);
    expect(shouldUseSecureCookie(undefined, development)).toBe(false);
    expect(shouldUseSecureCookie("", production)).toBe(true);
  });

  it("can be forced either way", () => {
    expect(shouldUseSecureCookie("http", { ...production, AUTH_COOKIE_SECURE: "true" })).toBe(true);
    expect(shouldUseSecureCookie("https", { ...production, AUTH_COOKIE_SECURE: "false" })).toBe(false);
    expect(shouldUseSecureCookie("https", { ...production, AUTH_COOKIE_SECURE: " FALSE " })).toBe(false);
  });

  it("ignores an override it does not understand", () => {
    expect(shouldUseSecureCookie("http", { ...production, AUTH_COOKIE_SECURE: "yes" })).toBe(false);
    expect(shouldUseSecureCookie(null, { ...production, AUTH_COOKIE_SECURE: "1" })).toBe(true);
  });
});
