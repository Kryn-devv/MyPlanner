import "server-only";

import { createTransport } from "nodemailer";
import type { EmailProvider } from "./config";

/**
 * The three ways a message can leave this server.
 *
 * Callers depend on `EmailTransport` rather than on a provider, so tests hand
 * in a transport that records messages instead of sending them — no test ever
 * talks to a real mail server.
 */

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface EmailTransport {
  readonly kind: EmailProvider["kind"];
  send(message: EmailMessage): Promise<void>;
}

/** Long enough for a slow provider, short enough not to pile up retries. */
const SEND_TIMEOUT_MS = 15_000;

export class EmailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

export function createEmailTransport(provider: EmailProvider): EmailTransport {
  switch (provider.kind) {
    case "resend":
      return resendTransport(provider.apiKey, provider.from);
    case "smtp":
      return smtpTransport(provider.url, provider.from);
    case "console":
      return consoleTransport();
  }
}

/**
 * Resend over its plain HTTP API.
 *
 * `fetch` is built in, so this needs no SDK: one POST is the entire
 * integration, and an SDK would be a dependency to audit for a single call.
 */
function resendTransport(apiKey: string, from: string): EmailTransport {
  return {
    kind: "resend",
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Resend's error body names the problem ("domain is not verified"),
        // which is exactly what the operator reading the log needs. It only
        // ever reaches the server log, never a visitor.
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        throw new EmailDeliveryError(`Resend refused the message (HTTP ${response.status}): ${detail}`);
      }
    },
  };
}

/**
 * Any SMTP server, configured by one URL.
 *
 * A URL rather than host/port/user/password variables because it is the form
 * providers document and the form nodemailer parses natively — including
 * `smtps://` for implicit TLS on port 465.
 */
function smtpTransport(url: string, from: string): EmailTransport {
  const transporter = createTransport({
    url,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  return {
    kind: "smtp",
    async send(message) {
      try {
        await transporter.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (error) {
        throw new EmailDeliveryError("The SMTP server refused the message.", { cause: error });
      }
    },
  };
}

const RULE = "=".repeat(76);
const THIN_RULE = "-".repeat(76);

/**
 * No provider configured: print the message where the operator will see it.
 *
 * This is not a fallback for a failed send — nothing is ever sent in this mode.
 * It is the only way a self-hosted install without email can recover a
 * forgotten password, so the output is built to be impossible to miss in a
 * busy server log, and it is written in one call so concurrent log lines
 * cannot land in the middle of it.
 */
function consoleTransport(): EmailTransport {
  return {
    kind: "console",
    async send(message) {
      console.log(formatConsoleEmail(message));
    },
  };
}

/**
 * Drops control characters, line breaks aside.
 *
 * The banner carries an address its owner typed at sign-up, and address
 * validation only rules out whitespace. Printed raw, an ANSI escape sequence
 * in it could recolour, erase or rewrite what the operator's terminal shows —
 * including the link this banner exists to display.
 */
function printable(value: string): string {
  return value.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "");
}

export function formatConsoleEmail(message: EmailMessage): string {
  return [
    "",
    RULE,
    "  EMAIL NOT SENT — no email provider is configured on this server.",
    "  The message below was printed here instead. To send it by email, set",
    "  RESEND_API_KEY or SMTP_URL (plus EMAIL_FROM and APP_URL) — see the README.",
    "",
    "  Its link points at APP_URL or, if that is unset, at localhost on this",
    "  machine. On another device, open the same path at the address you use",
    "  for the app there.",
    RULE,
    `  To:      ${printable(message.to)}`,
    `  Subject: ${printable(message.subject)}`,
    THIN_RULE,
    ...printable(message.text)
      .split("\n")
      .map((line) => (line ? `  ${line}` : "")),
    RULE,
    "",
  ].join("\n");
}

/**
 * Something the operator should know that is not an email.
 *
 * The forgot-password page tells every visitor the same thing whatever
 * happened, so when a request is quietly refused the terminal is the only
 * place that can say so. Framed like the email banner, so the two read as one
 * story in a busy log.
 */
export function formatConsoleNotice(heading: string, lines: readonly string[]): string {
  return [
    "",
    RULE,
    `  ${printable(heading)}`,
    RULE,
    ...lines.map((line) => (line ? `  ${printable(line)}` : "")),
    RULE,
    "",
  ].join("\n");
}
