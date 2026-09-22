/**
 * Outgoing email content.
 *
 * Pure string building, so every message can be checked in a unit test for
 * what matters most: that nothing interpolated into the HTML can become markup.
 */

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Safe for both element text and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Headers are single-line by definition; a line break would start a new one. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export interface PasswordResetEmailInput {
  readonly appName: string;
  readonly link: string;
  readonly expiresInMinutes: number;
}

/**
 * The reset email.
 *
 * It carries nothing the account holder typed — not even their display name.
 * Sign-up does not verify addresses, so anyone can register a stranger's
 * address under a "name" such as "Your account is suspended, verify at
 * evil.example" and then ask for a reset. Escaping keeps that out of the
 * markup, but mail clients still turn a bare URL in the text into a link, and
 * the message would arrive from this server's genuine sender. Greeting nobody
 * by name leaves an attacker nothing to put in it.
 */
export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const appName = singleLine(input.appName);
  const greeting = "Hi,";
  const minutes = String(input.expiresInMinutes);

  const subject = `Reset your ${appName} password`;

  const text = [
    greeting,
    "",
    `Someone asked to reset the password for your ${appName} account. To choose a new one, open this link:`,
    "",
    input.link,
    "",
    `The link expires in ${minutes} minutes and can only be used once.`,
    "",
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ].join("\n");

  const e = {
    appName: escapeHtml(appName),
    greeting: escapeHtml(greeting),
    link: escapeHtml(input.link),
    minutes: escapeHtml(minutes),
  };

  // Table layout and inline styles: the lowest common denominator every mail
  // client renders. No images or remote resources, so the message looks the
  // same with them blocked and nothing phones home when it is opened.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2330;">
<tr><td style="font-size:15px;font-weight:600;padding-bottom:24px;">${e.appName}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:12px;">${e.greeting}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px;">Someone asked to reset the password for your ${e.appName} account. Choose a new one with the button below.</td></tr>
<tr><td style="padding-bottom:24px;"><a href="${e.link}" style="display:inline-block;background:#6d5dfc;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:8px;">Reset password</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#5b6170;padding-bottom:12px;">The link expires in ${e.minutes} minutes and can only be used once. If the button does not work, paste this address into your browser:</td></tr>
<tr><td style="font-size:13px;line-height:1.6;word-break:break-all;padding-bottom:24px;"><a href="${e.link}" style="color:#6d5dfc;">${e.link}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#5b6170;">If you didn&#39;t ask for this, you can ignore this email. Your password won&#39;t change.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
