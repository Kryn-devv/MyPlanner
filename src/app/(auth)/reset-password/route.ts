import { NextResponse, type NextRequest } from "next/server";
import { shouldUseSecureCookie } from "@/lib/auth/cookie-policy";
import { RESET_TOKEN_COOKIE } from "@/lib/auth/password-reset";
import { isWellFormedResetToken } from "@/lib/validation/auth";

/**
 * The form the link leads to. Its address never carries the token. Not
 * exported: a route file may export only what Next recognises.
 */
const RESET_FORM_PATH = "/reset-password/new";

/**
 * Where an emailed reset link lands.
 *
 * The token is moved out of the address into a short-lived cookie, and the
 * browser is sent on to the form at an address without it. A page whose URL
 * held the token would repeat it in the Referer of every stylesheet and script
 * it loads: Next streams the page's `<meta name="referrer">` into the head
 * after those, too late to cover them, and a page cannot set a response
 * header of its own. It would also leave the token in the browser's history.
 * This response loads nothing, and a redirect never becomes a Referer.
 *
 * Read-only, like the form itself: a mail scanner that follows the link is
 * handed a cookie it will never use, and the token is not spent.
 */
export function GET(request: NextRequest): NextResponse {
  // Exactly one: a link with the parameter repeated is not one the server
  // wrote, and picking either value would be a guess.
  const values = request.nextUrl.searchParams.getAll("token");
  const token = values.length === 1 ? (values[0] ?? "") : "";

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      // Relative, so the address is never rebuilt from a Host header.
      Location: RESET_FORM_PATH,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });

  if (isWellFormedResetToken(token)) {
    response.cookies.set(RESET_TOKEN_COOKIE.name, token, {
      httpOnly: true,
      // The link is opened from a mail client — another site — and `strict`
      // would withhold the cookie from the very redirect that follows.
      sameSite: "lax",
      secure: shouldUseSecureCookie(request.headers.get("x-forwarded-proto")),
      path: RESET_TOKEN_COOKIE.path,
      maxAge: RESET_TOKEN_COOKIE.maxAgeSeconds,
    });
  } else {
    // Otherwise an older link's token would still be in the cookie, and the
    // form would open for that link instead of saying this one is broken.
    response.cookies.delete({ name: RESET_TOKEN_COOKIE.name, path: RESET_TOKEN_COOKIE.path });
  }

  return response;
}
