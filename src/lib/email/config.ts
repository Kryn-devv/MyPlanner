/**
 * How outgoing email leaves this server, and where the links in it point.
 *
 * Both are decided from the environment alone, as pure functions, so the rules
 * that keep reset links safe can be tested without a request or a mail server.
 *
 * Three ways out, in order of preference:
 *
 * - `RESEND_API_KEY` — Resend's HTTP API.
 * - `SMTP_URL` — any SMTP server, Gmail with an app password included.
 * - neither — nothing is sent. The message is printed to the server's own
 *   terminal instead, which is how a self-hosted install with no mail set up
 *   can still recover a forgotten password.
 */

export interface EmailEnv {
  readonly RESEND_API_KEY?: string | undefined;
  readonly SMTP_URL?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
  readonly APP_URL?: string | undefined;
  /** The port this server listens on. Next sets it when it starts. */
  readonly PORT?: string | undefined;
}

export type EmailProvider =
  | { readonly kind: "resend"; readonly apiKey: string; readonly from: string }
  | { readonly kind: "smtp"; readonly url: string; readonly from: string }
  | { readonly kind: "console" };

/**
 * A misconfiguration is returned rather than thrown: the caller logs it for the
 * operator and shows the visitor a generic message, and neither of those is
 * the place for a stack trace.
 */
export type Resolved<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function resolveEmailProvider(env: EmailEnv): Resolved<EmailProvider> {
  const apiKey = clean(env.RESEND_API_KEY);
  const smtpUrl = clean(env.SMTP_URL);

  if (!apiKey && !smtpUrl) return { ok: true, value: { kind: "console" } };

  const from = clean(env.EMAIL_FROM);
  if (!from) {
    return {
      ok: false,
      problem: "EMAIL_FROM must be set when RESEND_API_KEY or SMTP_URL is, e.g. EMAIL_FROM=\"Planner <you@gmail.com>\".",
    };
  }
  // The sender becomes a mail header. A line break in it would let the value
  // smuggle in headers of its own.
  if (/[\r\n]/.test(from) || !from.includes("@")) {
    return { ok: false, problem: "EMAIL_FROM must be a single address, e.g. \"Planner <you@gmail.com>\"." };
  }

  if (apiKey) return { ok: true, value: { kind: "resend", apiKey, from } };

  let protocol: string;
  try {
    protocol = new URL(smtpUrl).protocol;
  } catch {
    // Never echo the value: an SMTP URL carries the account's password.
    return { ok: false, problem: "SMTP_URL is not a valid URL. Expected smtps://user:password@host:465." };
  }
  if (protocol !== "smtp:" && protocol !== "smtps:") {
    return { ok: false, problem: "SMTP_URL must start with smtp:// or smtps://." };
  }

  return { ok: true, value: { kind: "smtp", url: smtpUrl, from } };
}

/** Next's default, for when nothing says which port this server listens on. */
const DEFAULT_PORT = 3000;

/** A TCP port as `PORT` would carry it: digits only, 1–65535. */
function listeningPort(value: string | undefined): number {
  const digits = clean(value);
  const port = Number(digits);
  return /^\d{1,5}$/.test(digits) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}

/**
 * The origin that links in outgoing email are built on, without a trailing
 * slash.
 *
 * `APP_URL` wins whenever it is set. Otherwise the link is never built from
 * the request: its `Host` and `X-Forwarded-Host` headers are whatever the
 * sender typed. With real email configured that would be password-reset
 * poisoning — an attacker asks for a reset of someone else's account with
 * `Host: evil.example`, and the victim receives a genuine email whose link
 * hands the token to the attacker — so `APP_URL` is required there.
 *
 * With no email provider the link is printed to the operator's terminal, and
 * the same attack still works: the attacker picks the host of the printed
 * link, then keeps the account's hourly allowance used up so that the
 * operator's own request prints nothing and the attacker's banner is the
 * newest one on screen. So the printed link points at this machine instead —
 * `localhost` on the port Next reports it is listening on — which only the
 * server's own configuration decides. The banner explains how to open the
 * same path from another device.
 */
export function resolveLinkBase(env: EmailEnv, provider: EmailProvider): Resolved<string> {
  const appUrl = clean(env.APP_URL);

  if (appUrl) {
    let url: URL;
    try {
      url = new URL(appUrl);
    } catch {
      return { ok: false, problem: `APP_URL is not a valid URL: "${appUrl}". Expected e.g. https://planner.example.com.` };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, problem: "APP_URL must start with http:// or https://." };
    }
    if (url.username || url.password || url.search || url.hash) {
      return { ok: false, problem: "APP_URL must be a plain origin such as https://planner.example.com." };
    }
    return { ok: true, value: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
  }

  if (provider.kind !== "console") {
    return {
      ok: false,
      problem:
        "APP_URL must be set when email delivery is configured (RESEND_API_KEY or SMTP_URL). " +
        "Reset links are built from it; building them from the request's Host header would let " +
        "anyone choose where a genuine reset email points. Set APP_URL to this app's public address.",
    };
  }

  return { ok: true, value: `http://localhost:${listeningPort(env.PORT)}` };
}

export function buildResetLink(base: string, token: string): string {
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
