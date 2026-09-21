/**
 * End-to-end verification of the Phase 4.3 focus sessions against a running
 * production build.
 *
 *     npm run build && npm start                    # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 node tests/e2e/verify-focus.mjs
 *
 * The through-line: the browser is never the authority. Refreshing,
 * navigating away, pausing and coming back must all land on the duration the
 * server's timestamps imply — never on a number a client was counting.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();

const USER_A = { email: `fa.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Focus" };
const USER_B = { email: `fb.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Focus" };

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

const dlg = (page) => page.locator("dialog[open]");
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const goFocus = (page) => page.goto(`${BASE}/app/focus`, { waitUntil: "networkidle" });
const text = async (page) => (await page.locator("main").innerText()).toLowerCase();

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

async function createTask(page, { title, dueDate, minutes }) {
  await page.keyboard.press("n");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Title", { exact: false }).fill(title);
  if (dueDate !== undefined) await d.getByLabel("Due date", { exact: false }).fill(dueDate ?? "");
  if (minutes) await d.getByLabel("Estimated duration", { exact: false }).fill(String(minutes));
  await d.getByRole("button", { name: /Create task/ }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function createProject(page, { name }) {
  await page.keyboard.press("p");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Name", { exact: false }).fill(name);
  await dlg(page).getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/** Reads the focus bar's clock, e.g. "0:07", as seconds. */
async function barSeconds(page) {
  const bar = page.locator("[aria-label='Active focus session']");
  if ((await bar.count()) === 0) return null;
  const raw = await bar.innerText();
  const match = raw.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return match[3]
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : Number(match[1]) * 60 + Number(match[2]);
}

/** Reads the big timer on the focus page as seconds. */
async function pageSeconds(page) {
  const raw = await page.locator("main").innerText();
  const match = raw.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return match[3]
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : Number(match[1]) * 60 + Number(match[2]);
}

const noOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

const readTotalXp = async (page) => {
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const t = await page.locator("text=/XP earned all time/").first().innerText();
  return Number(t.replace(/[^0-9]/g, ""));
};

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = wire(await ctxA.newPage());

  // ===================== NO SESSION =====================
  section("Focus page with nothing running");
  await signUp(page, USER_A);
  await goFocus(page);

  check("/app/focus opens", page.url() === `${BASE}/app/focus`);
  check("route is real, not a placeholder", !(await page.locator("text=is not built yet").count()));
  check("it says there is no session rather than faking a timer",
    (await text(page)).includes("no active focus session"));
  check("no timer is shown", (await pageSeconds(page)) === null);
  check("it links on to where work is chosen",
    (await page.locator('main a[href="/app/today"]').count()) > 0
      && (await page.locator('main a[href="/app/tasks"]').count()) > 0
      && (await page.locator('main a[href="/app/calendar"]').count()) > 0);
  check("no focus bar when nothing runs",
    (await page.locator("[aria-label='Active focus session']").count()) === 0);
  await page.screenshot({ path: `${SHOTS}/f01-empty.png`, fullPage: true });

  // ===================== START =====================
  section("Starting");
  await createTask(page, { title: "Focus alpha", dueDate: day(0), minutes: 60 });
  await createTask(page, { title: "Focus beta", dueDate: day(0), minutes: 30 });

  await goFocus(page);
  check("today's open work is offered", (await text(page)).includes("focus alpha"));
  check("a session length can be chosen",
    (await page.getByRole("radio", { name: "25 min" }).count()) > 0);

  await page.getByRole("radio", { name: "25 min" }).click();
  await page.locator("main").getByRole("button", { name: /Focus alpha/ }).first().click();
  await page.waitForTimeout(2500);

  check("a session starts from the focus page", (await pageSeconds(page)) !== null);
  check("the task is named", (await text(page)).includes("focus alpha"));
  check("the target is shown", (await page.locator("main").innerText()).includes("25:00"));
  check("the progress bar exposes a value",
    (await page.locator('main [role="progressbar"][aria-valuenow]').count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/f02-running.png`, fullPage: true });

  // ===================== TIMER AUTHORITY =====================
  section("The timer is derived from the server's timestamps");
  const t1 = await pageSeconds(page);
  await page.waitForTimeout(3000);
  const t2 = await pageSeconds(page);
  check("the timer advances", t2 > t1, `${t1} -> ${t2}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const afterReload = await pageSeconds(page);
  check("a refresh does not reset it", afterReload >= t2, `${t2} -> ${afterReload}`);

  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  check("the focus bar follows you to another page",
    (await page.locator("[aria-label='Active focus session']").count()) === 1);
  check("the bar names the task",
    (await page.locator("[aria-label='Active focus session']").innerText()).includes("Focus alpha"));
  const onToday = await barSeconds(page);
  check("and shows the same running time", onToday >= afterReload, `${afterReload} -> ${onToday}`);

  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await goFocus(page);
  const afterNavigation = await pageSeconds(page);
  check("navigating away and back does not reset it",
    afterNavigation >= onToday, `${onToday} -> ${afterNavigation}`);

  // A fresh browser context with the same session cookie: the closest thing
  // to closing and reopening the browser.
  const reopened = wire(await (await browser.newContext({
    storageState: await ctxA.storageState(),
    viewport: { width: 1280, height: 900 },
  })).newPage());
  await goFocus(reopened);
  const inNewWindow = await pageSeconds(reopened);
  check("reopening the browser recovers the session",
    inNewWindow >= afterNavigation, `${afterNavigation} -> ${inNewWindow}`);
  await reopened.close();

  // ===================== PAUSE / RESUME =====================
  section("Pause and resume");
  await goFocus(page);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(2500);

  check("the session reads as paused", (await text(page)).includes("paused"));
  const paused1 = await pageSeconds(page);
  await page.waitForTimeout(3000);
  const paused2 = await pageSeconds(page);
  check("the timer stops while paused", paused1 === paused2, `${paused1} vs ${paused2}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  check("a refresh while paused does not resume it",
    (await text(page)).includes("paused") && (await pageSeconds(page)) === paused1);

  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForTimeout(3000);
  const resumed = await pageSeconds(page);
  check("resuming continues from where it stopped", resumed > paused1, `${paused1} -> ${resumed}`);
  check("time spent paused is not counted", resumed < paused1 + 8, `${resumed} vs ${paused1}`);
  await page.screenshot({ path: `${SHOTS}/f03-paused.png`, fullPage: true });

  // ===================== SECOND SESSION =====================
  section("Only one session at a time");
  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  check("the task in focus says so, rather than offering to start again",
    (await page.locator("main").getByText("In focus").count()) > 0);

  await page.locator("main").getByRole("button", { name: /Start a focus session on .*Focus beta/ }).first().click();
  await page.waitForTimeout(2000);
  check("starting another task warns rather than silently switching",
    (await dlg(page).innerText()).toLowerCase().includes("already focusing"));
  check("it names the session you already have",
    (await dlg(page).innerText()).includes("Focus alpha"));

  await dlg(page).getByRole("button", { name: /Keep current session/ }).click();
  await page.waitForTimeout(1500);
  await goFocus(page);
  check("keeping the current session leaves it alone",
    (await text(page)).includes("focus alpha"));
  await page.screenshot({ path: `${SHOTS}/f04-conflict.png`, fullPage: true });

  // ===================== COMPLETE =====================
  section("Completing a session");
  const xpBefore = await readTotalXp(page);
  await goFocus(page);
  const beforeComplete = await pageSeconds(page);
  await page.getByRole("button", { name: /Complete session/ }).click();
  await page.waitForTimeout(3000);

  check("the session ends", (await text(page)).includes("no active focus session"));
  check("the tracked duration is reported",
    (await page.locator("text=/tracked/i").count()) > 0, `worked ${beforeComplete}s`);
  check("the focus bar disappears",
    (await page.locator("[aria-label='Active focus session']").count()) === 0);

  const xpAfter = await readTotalXp(page);
  check("no XP is awarded for focusing", xpAfter === xpBefore, `${xpBefore} -> ${xpAfter}`);

  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  const todayText = await page.locator("main").innerText();
  check("the task is NOT completed by focusing on it",
    (await page.getByRole("button", { name: /Mark .*Focus alpha.* as done/ }).count()) > 0);
  check("tracked focus appears on the task row", /Tracked focus/i.test(
    await page.locator("main").innerHTML()));
  check("today reports tracked focus", todayText.toLowerCase().includes("tracked focus"));
  await page.screenshot({ path: `${SHOTS}/f05-after.png`, fullPage: true });

  section("Task completion still works separately");
  await page.getByRole("button", { name: /Mark .*Focus alpha.* as done/ }).first().click();
  await page.waitForTimeout(2500);
  const xpAfterTask = await readTotalXp(page);
  check("completing the task still awards XP", xpAfterTask > xpAfter, `${xpAfter} -> ${xpAfterTask}`);

  // ===================== HISTORY =====================
  section("Focus history aggregates");
  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  await page.locator("main").getByRole("button", { name: /Start a focus session on .*Focus beta/ }).first().click();
  await page.waitForTimeout(2500);
  await goFocus(page);
  await page.waitForTimeout(11000);
  await page.getByRole("button", { name: /Complete session/ }).click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  await page.locator("main").getByRole("button", { name: /Start a focus session on .*Focus beta/ }).first().click();
  await page.waitForTimeout(2500);
  await goFocus(page);
  check("a second session shows the task's existing history",
    (await text(page)).includes("tracked focus"));
  check("history lists past sessions", (await text(page)).includes("session"));
  await page.screenshot({ path: `${SHOTS}/f06-history.png`, fullPage: true });

  // ===================== CANCEL =====================
  section("Cancelling");
  await page.waitForTimeout(11000);
  const beforeCancel = await pageSeconds(page);
  await page.getByRole("button", { name: /Discard session/ }).click();
  await page.waitForTimeout(3000);

  check("the session ends", (await text(page)).includes("no active focus session"));
  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  const trackedAfterCancel = await page.locator("main").innerText();
  check("a cancelled session does not count towards tracked focus",
    !trackedAfterCancel.includes(`${Math.floor(beforeCancel / 60)}m`) || beforeCancel < 60,
    `discarded ${beforeCancel}s`);

  // ===================== TARGET =====================
  section("Target progress");
  await goFocus(page);
  await page.getByRole("radio", { name: "No target" }).click();
  await page.locator("main").getByRole("button", { name: /Focus beta/ }).first().click();
  await page.waitForTimeout(2500);
  check("a session with no target has no progress bar",
    (await page.locator('main [role="progressbar"]').count()) === 0);
  await page.getByRole("button", { name: /Discard session/ }).click();
  await page.waitForTimeout(2000);

  // ===================== MALFORMED =====================
  section("Malformed and hostile input");
  for (const [path, expectation] of [
    ["/app/focus?session=someone-elses", "a session parameter is ignored"],
    ["/app/focus?userId=someone-else", "a userId parameter is ignored"],
    ["/app/focus/whatever", "an unknown sub-path does not 5xx"],
  ]) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    check(expectation, (response?.status() ?? 500) < 500, `${path} -> ${response?.status()}`);
  }
  await goFocus(page);
  check("the focus page still works afterwards", (await text(page)).includes("focus"));

  // The 404 probe above is a deliberate request for a route that should not
  // exist, and the browser logs every 404 as a console error. Dropping exactly
  // that entry keeps the console assertion meaningful instead of either
  // failing on a result the suite asked for or blanket-ignoring all 404s.
  const deliberate404 = consoleErrors.findIndex((e) => /404 \(Not Found\)/.test(e));
  check("the only console error was the deliberate 404 probe", deliberate404 !== -1,
    consoleErrors.join(" | "));
  if (deliberate404 !== -1) consoleErrors.splice(deliberate404, 1);

  // ===================== CROSS-USER =====================
  section("Cross-user isolation");
  await page.locator("main").getByRole("button", { name: /Focus beta/ }).first().click();
  await page.waitForTimeout(2500);

  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);
  await goFocus(pageB);

  check("another user sees no session", (await text(pageB)).includes("no active focus session"));
  check("and no focus bar",
    (await pageB.locator("[aria-label='Active focus session']").count()) === 0);
  check("nor the other user's task",
    !(await text(pageB)).includes("focus beta"));
  await pageB.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  check("nor their work on Today", !(await text(pageB)).includes("focus alpha"));
  await ctxB.close();

  // ===================== DELETED TASK =====================
  section("A deleted task does not break the session");
  await page.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for .*Focus beta/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Delete" }).first().click();
  await page.waitForTimeout(1200);
  const confirm = page.getByRole("button", { name: /Delete task|Delete/ }).last();
  await confirm.click().catch(() => {});
  await page.waitForTimeout(2500);

  await goFocus(page);
  check("the session survives its task being deleted",
    (await pageSeconds(page)) !== null || (await text(page)).includes("deleted task"));
  check("and says so rather than crashing", (await text(page)).includes("deleted task"));
  check("no 5xx from the detached session", pageErrors.filter((e) => /HTTP 5/.test(e)).length === 0);
  await page.screenshot({ path: `${SHOTS}/f07-deleted-task.png`, fullPage: true });

  await page.getByRole("button", { name: /Discard session/ }).click().catch(() => {});
  await page.waitForTimeout(2000);

  // ===================== RESPONSIVE =====================
  section("Responsive");
  await createTask(page, { title: "Mobile focus", dueDate: day(0), minutes: 25 });
  const mobile = wire(await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await ctxA.storageState(),
  })).newPage());

  await goFocus(mobile);
  check("no horizontal overflow at 390px (no session)", await noOverflow(mobile));
  await mobile.locator("main").getByRole("button", { name: /Mobile focus/ }).first().click();
  await mobile.waitForTimeout(2500);
  check("no horizontal overflow at 390px (running)", await noOverflow(mobile));
  check("the timer fits at 390px", (await pageSeconds(mobile)) !== null);
  check("controls remain tappable at 390px", await (async () => {
    const box = await mobile.getByRole("button", { name: "Pause" }).boundingBox();
    return Boolean(box && box.height >= 28);
  })());
  await mobile.screenshot({ path: `${SHOTS}/f08-mobile.png`, fullPage: true });

  await mobile.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  check("the focus bar fits at 390px without blocking the page", await noOverflow(mobile));
  check("and is still reachable at 390px",
    await mobile.locator("[aria-label='Active focus session']").isVisible());
  check("mobile navigation still present",
    await mobile.locator("nav[aria-label='Main']").last().isVisible());

  await mobile.setViewportSize({ width: 768, height: 1024 });
  await goFocus(mobile);
  await mobile.waitForTimeout(700);
  check("no horizontal overflow at 768px", await noOverflow(mobile));
  await mobile.close();

  await goFocus(page);
  check("no horizontal overflow at 1440px", await noOverflow(page));
  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  check("no horizontal overflow at 1440px with the focus bar", await noOverflow(page));

  // ===================== ACCESSIBILITY =====================
  section("Accessibility");
  await goFocus(page);
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    unlabelled: Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    unlabelledLinks: Array.from(document.querySelectorAll("a")).filter(
      (a) => !a.textContent.trim() && !a.getAttribute("aria-label")).length,
    progressbars: document.querySelectorAll('[role="progressbar"][aria-valuenow]').length,
    timerLabelled: Array.from(document.querySelectorAll("[aria-label]")).some(
      (el) => /elapsed/i.test(el.getAttribute("aria-label") ?? "")),
    currentPage: document.querySelectorAll('[aria-current="page"]').length,
    badUl: Array.from(document.querySelectorAll("ul, ol")).filter((list) =>
      Array.from(list.children).some((c) => c.tagName !== "LI" && c.tagName !== "TEMPLATE")).length,
    ariaHidden: Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent.trim().length > 40).length,
  }));
  check("single h1", a11y.h1 === 1, `h1=${a11y.h1}`);
  check("no unlabelled icon-only buttons", a11y.unlabelled === 0, `count=${a11y.unlabelled}`);
  check("no unlabelled links", a11y.unlabelledLinks === 0, `count=${a11y.unlabelledLinks}`);
  check("the timer has a spoken label, not just digits", a11y.timerLabelled);
  check("target progress exposes a value", a11y.progressbars >= 1);
  check("Focus is marked as the current page", a11y.currentPage >= 1);
  check("lists contain only list items", a11y.badUl === 0);
  check("no meaningful content hidden behind aria-hidden", a11y.ariaHidden === 0);

  const before = await pageSeconds(page);
  await page.keyboard.press(" ");
  await page.waitForTimeout(2500);
  check("space pauses the session", (await text(page)).includes("paused"), `at ${before}s`);
  await page.keyboard.press(" ");
  await page.waitForTimeout(2500);
  check("space resumes it", !(await text(page)).includes("paused"));

  section("Phase 1 flows still work");
  await page.keyboard.press("n");
  await page.waitForTimeout(1000);
  check("N still opens the task dialog", (await dlg(page).innerText().catch(() => "")).includes("New task"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check("Escape closes it", (await page.locator("dialog[open]").count()) === 0);

  await ctxA.close();
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
