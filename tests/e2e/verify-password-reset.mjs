/**
 * End-to-end verification of the forgot-password flow against a running
 * production build with NO email provider configured.
 *
 *     npm run build && npm start > server.log 2>&1       # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 E2E_SERVER_LOG=./server.log \
 *       node tests/e2e/verify-password-reset.mjs         # terminal 2
 *
 * Without RESEND_API_KEY or SMTP_URL the server prints every reset email to
 * its own terminal inside a banner. That is the only place a link ever
 * appears, so this suite reads links out of the server's log file, exactly as
 * the operator of a self-hosted install would. The printed link points at
 * APP_URL (E2E_APP_URL, if the server has one) or at localhost — never at the
 * host the request named — so it is replayed against E2E_BASE_URL by path.
 *
 * The link itself lands on a route that moves the token into a cookie and
 * redirects to /reset-password/new, so the form's own address never holds it.
 *
 * The through-line: the forgot page must answer every address the same way,
 * a link must work once and only for its own account, and using one must sign
 * out everything that knew the old password.
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const SERVER_LOG = process.env.E2E_SERVER_LOG;
const APP_URL = process.env.E2E_APP_URL;
const stamp = Date.now();

const USER = { email: `reset.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Reset" };
const NEW_PASSWORD = "a-brand-new-password-42";
const STRANGER = `nobody.${stamp}@example.test`;

const consoleErrors = [];
const pageErrors = [];
const results = [];
const IGNORABLE = /favicon|WebSocket|hmr|ERR_INVALID_HTTP_RESPONSE/i;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}
function section(t) { console.log(`\n── ${t} ──`); }

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

function wire(page) {
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !IGNORABLE.test(t)) consoleErrors.push(t);
    // A production build reports a hydration failure as a *minified* error
    // — "Minified React error #418" — which contains none of the words a
    // development build uses. Matching only the prose would have let a real
    // mismatch through every suite here.
    if (/hydrat|did not match|server rendered|React error #(418|419|421|423|425)/i.test(t))
      consoleErrors.push(`HYDRATION: ${t}`);
  });
  page.on("pageerror", (e) => { if (!IGNORABLE.test(e.message)) pageErrors.push(e.message); });
  page.on("response", (r) => { if (r.status() >= 500) pageErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  return page;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const h1 = async (page) => (await page.getByRole("heading", { level: 1 }).first().innerText()).trim();
const mainText = async (page) => (await page.locator("main#main").innerText()).trim();
const noOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Whether focus has landed on the page's heading, as it should after a view swap. */
const headingHasFocus = (page) => page
  .waitForFunction(() => document.activeElement?.tagName === "H1", null, { timeout: 5000 })
  .then(() => true, () => false);

const INVALID_HEADING = "This link is invalid or has expired";
const FORM_HEADING = "Choose a new password";
const FORM_URL = `${BASE}/reset-password/new`;

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: false }).fill(email);
  await page.getByLabel("Password", { exact: false }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Submits the forgot-password form and waits for its confirmation. */
async function requestLink(page, email) {
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: false }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByRole("heading", { level: 1, name: /^Check / }).waitFor({ timeout: 15000 });
}

async function readLog() {
  if (!SERVER_LOG) return "";
  try { return await readFile(SERVER_LOG, "utf8"); } catch { return ""; }
}

/**
 * The newest reset link printed for `email` after log offset `since`.
 *
 * The server sends the page first and prints the link a moment later — the
 * lookup and the email are deliberately deferred until after the response —
 * so this polls rather than reading once.
 */
async function waitForResetLink(email, since, timeoutMs = 20000) {
  const addressed = new RegExp(`To:\\s+${escapeRe(email)}\\s`, "g");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fresh = (await readLog()).slice(since);
    let last = -1;
    for (const m of fresh.matchAll(addressed)) last = m.index;
    if (last !== -1) {
      const link = fresh.slice(last).match(/https?:\/\/\S+?\/reset-password\?token=[A-Za-z0-9_-]{43}/);
      if (link) return link[0];
    }
    await sleep(250);
  }
  return null;
}

/** The same link, addressed to the server under test. */
const onBase = (link) => { const u = new URL(link); return `${BASE}${u.pathname}${u.search}`; };
/** The link with one character of its token changed — still well-formed, never issued. */
const tampered = (link) => link.replace(/token=(.)/, (_, c) => `token=${c === "A" ? "B" : "A"}`);

try {
  // ===================== SIGN-IN =====================
  section("Sign-in offers a way back in");
  const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const anon = wire(await anonCtx.newPage());

  await anon.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const forgotLink = anon.getByRole("link", { name: "Forgot password?" });
  check("the sign-in form shows \"Forgot password?\"", await forgotLink.isVisible());
  check("the sign-in labels are unchanged",
    (await anon.getByLabel("Email", { exact: false }).count()) === 1 &&
    (await anon.getByLabel("Password", { exact: false }).count()) === 1);
  check("the sign-in button and sign-up link are unchanged",
    (await anon.getByRole("button", { name: "Sign in" }).count()) === 1 &&
    (await anon.getByRole("link", { name: "Create an account" }).count()) === 1);

  await forgotLink.click();
  await anon.waitForURL(`${BASE}/forgot-password`, { timeout: 15000 });
  await anon.waitForLoadState("networkidle");
  check("it navigates to the forgot-password page", anon.url() === `${BASE}/forgot-password`, anon.url());
  check("which asks for an email", (await anon.getByLabel("Email", { exact: false }).count()) === 1);
  check("and links back to sign in", (await anon.getByRole("link", { name: "Back to sign in" }).count()) === 1);
  check("its intro promises no email the server may not send", !/we.ll send you/i.test(await mainText(anon)));
  await anon.screenshot({ path: `${SHOTS}/reset-01-forgot.png` });

  await anon.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  check("sign-up does not offer it", (await anon.getByRole("link", { name: "Forgot password?" }).count()) === 0);

  // ===================== VALIDATION =====================
  section("The forgot form validates format only");
  await anon.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
  await anon.getByRole("button", { name: "Send reset link" }).click();
  await anon.waitForTimeout(1200);
  check("an empty address is refused", (await anon.locator("text=Email is required.").count()) > 0);
  await anon.getByLabel("Email", { exact: false }).fill("bad-email");
  await anon.getByRole("button", { name: "Send reset link" }).click();
  await anon.waitForTimeout(1200);
  check("a malformed address is refused", (await anon.locator("text=Enter a valid email address.").count()) > 0);

  // ===================== SETUP =====================
  section("An account, signed in on another device");
  const otherDeviceCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const otherDevice = wire(await otherDeviceCtx.newPage());
  await signUp(otherDevice, USER);
  check("the account exists and is signed in elsewhere", otherDevice.url() === `${BASE}/app`);

  // ===================== NO ENUMERATION =====================
  section("Every address gets the same answer");
  check("E2E_SERVER_LOG names the server's log file", Boolean(SERVER_LOG) && (await readLog()).length > 0,
    SERVER_LOG ?? "unset");

  const beforeKnown = (await readLog()).length;
  const actionStatuses = { known: [], unknown: [] };
  let bucket = "known";
  anon.on("response", (r) => {
    if (r.request().method() === "POST" && r.url().startsWith(`${BASE}/forgot-password`)) actionStatuses[bucket].push(r.status());
  });

  await requestLink(anon, USER.email);
  check("the confirmation takes focus, so a screen reader hears it", await headingHasFocus(anon));
  const knownText = await mainText(anon);
  const knownUrl = anon.url();
  await anon.screenshot({ path: `${SHOTS}/reset-02-sent.png` });

  const beforeUnknown = (await readLog()).length;
  bucket = "unknown";
  await requestLink(anon, STRANGER);
  const unknownText = await mainText(anon);
  const unknownUrl = anon.url();

  check("a registered and an unregistered address see the identical message", knownText === unknownText,
    knownText === unknownText ? "" : `${knownText.slice(0, 80)} ≠ ${unknownText.slice(0, 80)}`);
  check("and stay on the same URL", knownUrl === unknownUrl && knownUrl === `${BASE}/forgot-password`, `${knownUrl} / ${unknownUrl}`);
  check("and get the same response status",
    JSON.stringify(actionStatuses.known) === JSON.stringify(actionStatuses.unknown),
    `${JSON.stringify(actionStatuses.known)} / ${JSON.stringify(actionStatuses.unknown)}`);
  check("the message does not claim the account exists", /if an account exists/i.test(knownText));
  check("it says email isn't configured and points at the server's terminal",
    /isn.t configured/i.test(knownText) && /terminal/i.test(knownText));
  check("it says how long the link lasts", knownText.includes("30 minutes"));
  check("it links back to sign in", (await anon.getByRole("link", { name: "Back to sign in" }).count()) === 1);

  const firstLink = await waitForResetLink(USER.email, beforeKnown);
  check("the server printed a reset link for the registered address", Boolean(firstLink), firstLink ? new URL(firstLink).origin : "none");
  // BASE names the server as 127.0.0.1, so a link built from the request
  // would say so. The server must use its own idea of its address instead.
  check("the printed link points at the server's own address, not the one the request named",
    Boolean(firstLink) && (APP_URL ? new URL(firstLink).origin === new URL(APP_URL).origin : new URL(firstLink).hostname === "localhost"),
    firstLink ? new URL(firstLink).origin : "none");
  await sleep(1500);
  const strangerLog = (await readLog()).slice(beforeUnknown);
  check("and printed nothing for the unregistered one", !strangerLog.includes(STRANGER));
  check("the banner is unmistakable", (await readLog()).slice(beforeKnown).includes("EMAIL NOT SENT"));

  // A second request supersedes the first link.
  const beforeSecond = (await readLog()).length;
  await requestLink(anon, USER.email);
  const secondLink = await waitForResetLink(USER.email, beforeSecond);
  check("asking again prints a fresh link", Boolean(secondLink) && secondLink !== firstLink);
  if (!firstLink || !secondLink) throw new Error("no reset links were printed; is E2E_SERVER_LOG the server's stdout?");

  // ===================== SUPERSEDED LINK =====================
  section("Only the newest link works");
  await anon.goto(onBase(firstLink), { waitUntil: "networkidle" });
  check("the superseded link shows the invalid state", (await h1(anon)) === INVALID_HEADING, await h1(anon));
  check("which says only the most recent link works", /most recent/i.test(await mainText(anon)));
  check("with a way to ask for a new one", (await anon.getByRole("link", { name: "Request a new link" }).count()) === 1);
  check("and no password fields", (await anon.locator('input[type="password"]').count()) === 0);

  // ===================== RESET PAGE =====================
  section("The reset page");
  const resetCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const reset = wire(await resetCtx.newPage());
  const token = new URL(secondLink).searchParams.get("token");
  const foreignRequests = [];
  const leakedReferers = [];
  reset.on("request", async (r) => {
    const url = new URL(r.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== new URL(BASE).origin) foreignRequests.push(r.url());
    // Every request, the page's stylesheets and scripts included: those are
    // fetched before any <meta name="referrer"> in the head is parsed.
    const referer = (await r.allHeaders().catch(() => ({})))["referer"] ?? "";
    if (token && referer.includes(token)) leakedReferers.push(r.url());
  });

  // Before anything uses it: a one-character change to this still-live link
  // must be refused, while the untouched link keeps working.
  await anon.goto(tampered(onBase(secondLink)), { waitUntil: "networkidle" });
  check("a tampered copy of a live link shows the invalid state", (await h1(anon)) === INVALID_HEADING, await h1(anon));

  await reset.goto(onBase(secondLink), { waitUntil: "networkidle" });
  check("the live link opens the form", (await h1(reset)) === FORM_HEADING, await h1(reset));
  check("it names the account being reset", (await mainText(reset)).includes(USER.email));
  check("the form's address does not hold the token", reset.url() === FORM_URL && Boolean(token) && !reset.url().includes(token), reset.url());

  await sleep(250);
  const referrer = await reset.evaluate(() => document.querySelector('meta[name="referrer"]')?.getAttribute("content") ?? null);
  check("the page keeps a no-referrer policy as a second line", referrer === "no-referrer", String(referrer));
  check("no request made while loading it carried the token in its Referer", leakedReferers.length === 0, leakedReferers.slice(0, 3).join(", "));
  check("it loads nothing from another origin", foreignRequests.length === 0, foreignRequests.slice(0, 3).join(", "));

  // Someone still signed in on one device opening the link there.
  await otherDevice.goto(onBase(secondLink), { waitUntil: "networkidle" });
  check("a signed-in visitor can open a live link too", (await h1(otherDevice)) === FORM_HEADING && otherDevice.url() === FORM_URL,
    `${await h1(otherDevice)} @ ${otherDevice.url()}`);

  const newField = reset.getByLabel(/^New password/);
  const confirmField = reset.getByLabel(/^Confirm new password/);
  check("both fields are new-password fields",
    (await newField.getAttribute("autocomplete")) === "new-password" &&
    (await confirmField.getAttribute("autocomplete")) === "new-password");
  check("the length rule is shown up front", (await reset.locator("text=At least 8 characters").count()) > 0);
  await reset.screenshot({ path: `${SHOTS}/reset-03-form.png` });

  for (const [width, height] of [[390, 844], [768, 1024], [1440, 960]]) {
    await reset.setViewportSize({ width, height });
    await reset.waitForTimeout(250);
    check(`the reset form has no horizontal overflow at ${width}px`, await noOverflow(reset));
  }

  await newField.fill("short");
  await confirmField.fill("short");
  await reset.getByRole("button", { name: "Reset password" }).click();
  await reset.waitForTimeout(1500);
  check("a short password is refused with sign-up's wording", (await reset.locator("text=Use at least 8 characters.").count()) > 0);

  await newField.fill(NEW_PASSWORD);
  await confirmField.fill(`${NEW_PASSWORD}-typo`);
  await reset.getByRole("button", { name: "Reset password" }).click();
  await reset.waitForTimeout(1500);
  check("a mismatched confirmation is refused", (await reset.locator("text=The passwords do not match.").count()) > 0);
  check("a refused submission keeps the link alive", (await h1(reset)) === FORM_HEADING);

  // A link that dies after the form loaded, met with a typo. The form is
  // pointed at a well-formed token that was never issued, which is exactly
  // what the server sees when a link has expired or been superseded meanwhile.
  await reset.evaluate((dead) => { document.querySelector('input[name="token"]').value = dead; }, "A".repeat(43));
  await newField.fill("short");
  await confirmField.fill("short");
  await reset.getByRole("button", { name: "Reset password" }).click();
  await reset.getByRole("heading", { level: 1, name: INVALID_HEADING }).waitFor({ timeout: 15000 }).catch(() => {});
  check("a link that died after loading is reported before the typo", (await h1(reset)) === INVALID_HEADING, await h1(reset));
  check("and focus moves to that news", await headingHasFocus(reset));

  await reset.goto(onBase(secondLink), { waitUntil: "networkidle" });
  check("the real link still opens the form afterwards", (await h1(reset)) === FORM_HEADING, await h1(reset));

  // ===================== RESET =====================
  section("Resetting");
  await newField.fill(NEW_PASSWORD);
  await confirmField.fill(NEW_PASSWORD);
  await reset.getByRole("button", { name: "Reset password" }).click();
  await reset.waitForURL(`${BASE}/app`, { timeout: 25000 }).catch(() => {});
  await reset.waitForLoadState("networkidle");
  check("after the reset the user is signed in at /app", reset.url() === `${BASE}/app`, reset.url());
  check("with the app actually rendered", (await reset.getByRole("button", { name: "Sign out" }).count()) > 0);
  check("the submission carried no Referer with the token", leakedReferers.length === 0, leakedReferers.join(", "));
  await reset.screenshot({ path: `${SHOTS}/reset-04-signed-in.png` });

  await otherDevice.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("the other device was signed out", otherDevice.url().includes("/login"), otherDevice.url());

  // The same browser, now signed in by the reset, opening the spent link.
  await reset.goto(onBase(secondLink), { waitUntil: "networkidle" });
  check("reopening the spent link while signed in shows the invalid state, not the app",
    (await h1(reset)) === INVALID_HEADING && reset.url() === FORM_URL, `${await h1(reset)} @ ${reset.url()}`);

  await reset.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
  check("a signed-in visitor is sent on to the app", reset.url() === `${BASE}/app`, reset.url());

  // ===================== CREDENTIALS =====================
  section("Only the new password works");
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const login = wire(await loginCtx.newPage());
  await signIn(login, USER.email, USER.password);
  await login.waitForTimeout(2500);
  check("the old password no longer signs in", (await login.locator("text=Incorrect email or password.").count()) > 0 && login.url().includes("/login"));

  await login.getByLabel("Password", { exact: false }).fill(NEW_PASSWORD);
  await login.getByRole("button", { name: "Sign in" }).click();
  await login.waitForURL(`${BASE}/app`, { timeout: 25000 }).catch(() => {});
  check("the new password does", login.url() === `${BASE}/app`, login.url());

  // ===================== SPENT LINK =====================
  section("A link works once");
  const replayCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const replay = wire(await replayCtx.newPage());
  await replay.goto(onBase(secondLink), { waitUntil: "networkidle" });
  check("a second use of the same link shows the invalid state", (await h1(replay)) === INVALID_HEADING, await h1(replay));
  await replay.screenshot({ path: `${SHOTS}/reset-05-invalid.png` });

  for (const [label, url] of [
    ["a garbage token", `${BASE}/reset-password?token=not-a-real-token`],
    ["no token at all", `${BASE}/reset-password`],
    ["a repeated token parameter", `${onBase(secondLink)}&token=again`],
  ]) {
    await replay.goto(url, { waitUntil: "networkidle" });
    check(`${label} shows the same invalid state`, (await h1(replay)) === INVALID_HEADING, await h1(replay));
  }

  await replay.getByRole("link", { name: "Request a new link" }).click();
  await replay.waitForURL(`${BASE}/forgot-password`, { timeout: 15000 }).catch(() => {});
  check("\"Request a new link\" leads back to the forgot page", replay.url() === `${BASE}/forgot-password`, replay.url());

  // ===================== RESPONSIVE =====================
  section("Responsive layout");
  const sizes = [[390, 844], [768, 1024], [1440, 960]];
  for (const [width, height] of sizes) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = wire(await ctx.newPage());

    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    check(`sign-in has no horizontal overflow at ${width}px`, await noOverflow(p));
    check(`"Forgot password?" is visible at ${width}px`, await p.getByRole("link", { name: "Forgot password?" }).isVisible());

    await p.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
    check(`the forgot form has no horizontal overflow at ${width}px`, await noOverflow(p));

    // An unregistered address: it exercises the confirmation without using
    // up the account's hourly allowance of links.
    await requestLink(p, `nobody.${width}.${stamp}@example.test`);
    check(`the confirmation has no horizontal overflow at ${width}px`, await noOverflow(p));

    await p.goto(`${BASE}/reset-password?token=${"A".repeat(43)}`, { waitUntil: "networkidle" });
    check(`the invalid state has no horizontal overflow at ${width}px`, await noOverflow(p));
    if (width === 390) await p.screenshot({ path: `${SHOTS}/reset-06-mobile-invalid.png`, fullPage: true });

    await ctx.close();
  }

  // ===================== HEALTH =====================
  section("Console and server health");
  check("no console errors or hydration warnings", consoleErrors.length === 0, [...new Set(consoleErrors)].slice(0, 3).join(" | "));
  check("no uncaught page errors or 5xx responses", pageErrors.length === 0, [...new Set(pageErrors)].slice(0, 3).join(" | "));

  await Promise.all([anonCtx, otherDeviceCtx, resetCtx, loginCtx, replayCtx].map((c) => c.close()));
} catch (error) {
  console.error("\nE2E ERROR:", error.message);
  results.push({ name: "suite ran to completion", ok: false, detail: error.message });
} finally {
  console.log("\n=== console errors / hydration warnings ===");
  console.log(consoleErrors.length ? [...new Set(consoleErrors)].join("\n") : "(none)");
  console.log("=== page errors / 5xx ===");
  console.log(pageErrors.length ? [...new Set(pageErrors)].join("\n") : "(none)");
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("\nFAILURES:"); failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`)); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}
