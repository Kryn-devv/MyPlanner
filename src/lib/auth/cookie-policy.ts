/**
 * Whether the session cookie should carry the `Secure` attribute.
 *
 * `Secure` used to follow `NODE_ENV` alone, which is right for a deployment
 * behind HTTPS and silently wrong for the other way this app is run: served
 * from a PC over plain `http://192.168.x.x` to a phone on the same Wi-Fi. A
 * browser refuses to store a `Secure` cookie from an `http:` page, so signing
 * in "worked" and then bounced straight back to the login form.
 *
 * So the decision follows the connection the request actually arrived on.
 * Next's own server fills in `x-forwarded-proto`, and any proxy in front of a
 * deployment overwrites it, so it is the most direct statement available of
 * whether this request is HTTPS. Marking a cookie `Secure` on a plain-HTTP
 * connection buys nothing — the browser would just drop it — so the only
 * effect of this rule is that plain-HTTP self-hosting works at all.
 *
 * When the header is missing the old behaviour stands (secure in production),
 * and `AUTH_COOKIE_SECURE=true|false` overrides everything for setups where
 * neither is right.
 */
export function shouldUseSecureCookie(
  forwardedProto: string | null | undefined,
  env: { readonly NODE_ENV?: string; readonly AUTH_COOKIE_SECURE?: string } = process.env,
): boolean {
  const override = env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;

  // A chain of proxies appends; the first entry is the client-facing hop.
  const proto = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") return true;
  if (proto === "http") return false;

  return env.NODE_ENV === "production";
}
