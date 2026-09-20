/**
 * End-to-end verification of the complete Phase 1 flow against a running build.
 *
 *     npm run build && npm start          # terminal 1
 *     npx --yes playwright@1 install chromium
 *     E2E_BASE_URL=http://127.0.0.1:3000 npx --yes playwright@1 \
 *       node tests/e2e/verify.mjs         # terminal 2
 *
 * Playwright is deliberately NOT a project dependency — this harness is run on
 * demand, not in the unit/integration suite, so it adds no install weight.
 * Set E2E_CHROME to use a Chromium already on the machine.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();
const USER_A = { email: `alice.${stamp}@example.test`, password: "correct-horse-battery", name: "Alice Rivera" };
const USER_B = { email: `mallory.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Quinn" };

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
  page.on("console", (m) => { if (m.type() === "error" && !IGNORABLE.test(m.text())) consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => { if (!IGNORABLE.test(e.message)) pageErrors.push(e.message); });
  return page;
}

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

async function createTask(page, { title, priority, xp, dueDate, minutes }) {
  await page.getByRole("button", { name: "New task" }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await page.getByLabel("Title", { exact: false }).fill(title);
  if (priority) await page.getByLabel("Priority", { exact: false }).selectOption(priority);
  if (xp !== undefined) await page.getByLabel("XP reward", { exact: false }).fill(String(xp));
  if (dueDate) await page.getByLabel("Due date", { exact: false }).fill(dueDate);
  if (minutes) await page.getByLabel("Estimated duration", { exact: false }).fill(String(minutes));
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

/** Reads the "N XP earned all time" line from the dashboard XP panel. */
async function readTotalXp(page) {
  const text = await page.locator("text=/XP earned all time/").first().innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}
async function readLevel(page) {
  const panel = await page.locator("main#main").innerText();
  const m = panel.match(/LEVEL\s*\n?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

const today = new Date().toISOString().slice(0, 10);
let taskAId = null;

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = wire(await ctxA.newPage());

  // ===================== AUTH =====================
  section("Authentication & route protection");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("unauthenticated /app redirects to /login", page.url().includes("/login"));
  await page.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  check("unauthenticated /app/tasks redirects to /login", page.url().includes("/login"));
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle" });
  check("unauthenticated /app/settings redirects to /login", page.url().includes("/login"));

  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill("X");
  await page.getByLabel("Email", { exact: false }).fill("bad-email");
  await page.getByLabel("Password", { exact: false }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(1500);
  check("sign-up rejects a malformed email", (await page.locator("text=Enter a valid email address.").count()) > 0);
  check("sign-up rejects a short password", (await page.locator("text=Use at least 8 characters.").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/01-signup-validation.png` });

  await signUp(page, USER_A);
  check("sign up succeeds and lands on the dashboard", page.url() === `${BASE}/app`);
  await page.waitForLoadState("networkidle");

  // ===================== EMPTY / LOADING STATES =====================
  section("Empty states");
  const mainText = await page.locator("main#main").innerText();
  check("dashboard shows the no-tasks empty state", mainText.includes("No tasks yet"));
  check("upcoming panel shows its empty state", mainText.includes("Nothing scheduled"));
  check("deadlines panel shows its empty state", mainText.includes("No deadlines ahead"));
  check("new account starts at level 1", (await readLevel(page)) === 1);
  check("new account starts at 0 XP", (await readTotalXp(page)) === 0);
  await page.screenshot({ path: `${SHOTS}/02-dashboard-empty.png`, fullPage: true });

  // ===================== TASK CREATION + VALIDATION =====================
  section("Task creation & validation");
  await page.getByRole("button", { name: "New task" }).first().click();
  await page.waitForSelector("dialog[open]");
  check("quick add opens a dialog", (await page.locator("dialog[open]").count()) > 0);

  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForTimeout(1200);
  check("title is required", (await page.locator("text=A title is required.").count()) > 0);

  await page.getByLabel("Title", { exact: false }).fill("Work on IRIS");
  await page.getByLabel("XP reward", { exact: false }).fill("-10");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForTimeout(1200);
  check("negative XP is rejected", (await page.locator("text=XP cannot be negative.").count()) > 0);

  await page.getByLabel("XP reward", { exact: false }).fill("60");
  await page.getByLabel("Estimated duration", { exact: false }).fill("0");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForTimeout(1200);
  check("zero duration is rejected", (await page.locator("text=Duration must be greater than zero.").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/03-task-validation.png` });

  await page.getByLabel("Estimated duration", { exact: false }).fill("120");
  await page.getByLabel("Priority", { exact: false }).selectOption("URGENT");
  await page.getByLabel("Due date", { exact: false }).fill(today);
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check("valid task is created", (await page.locator("text=Work on IRIS").count()) > 0);

  await createTask(page, { title: "Finish Chemistry notes", priority: "HIGH", xp: 40, dueDate: today, minutes: 60 });
  await createTask(page, { title: "English project", priority: "URGENT", xp: 60, dueDate: nextDay(1) });
  await createTask(page, { title: "Read chapter", priority: "LOW", xp: 10 });
  await page.reload({ waitUntil: "networkidle" });
  const afterCreate = await page.locator("main#main").innerText();
  check("dated tasks appear on the dashboard", ["Work on IRIS", "Finish Chemistry notes", "English project"].every((t) => afterCreate.includes(t)));
  // An undated task belongs to neither "today" nor "upcoming", so it is
  // correctly absent here and present on the tasks page.
  check("undated task is not shown on the dashboard", !afterCreate.includes("Read chapter"));
  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  const allTasks = await page.locator("main#main").innerText();
  check("all four tasks persist and are listed on the tasks page", ["Work on IRIS", "Finish Chemistry notes", "English project", "Read chapter"].every((t) => allTasks.includes(t)));
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("deadline panel picks up the urgent dated task", (await page.locator("main#main").innerText()).includes("English project"));
  await page.screenshot({ path: `${SHOTS}/04-dashboard-populated.png`, fullPage: true });

  // ===================== COMPLETION + XP =====================
  section("Completion, XP and levels");
  const xpBefore = await readTotalXp(page);
  await page.getByRole("button", { name: /Mark .Work on IRIS. as done/ }).first().click();
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });
  const xpAfter = await readTotalXp(page);
  check("completing a 60 XP task awards exactly 60 XP", xpAfter - xpBefore === 60, `${xpBefore} -> ${xpAfter}`);
  check("task shows as completed", (await page.getByRole("button", { name: /Mark .Work on IRIS. as not done/ }).count()) > 0);
  await page.screenshot({ path: `${SHOTS}/05-task-completed.png`, fullPage: true });

  // Duplicate protection: hammer the toggle.
  const toggle = page.getByRole("button", { name: /Mark .Work on IRIS. as not done/ }).first();
  for (let i = 0; i < 5; i++) { await toggle.click({ force: true }).catch(() => {}); await page.waitForTimeout(60); }
  await page.waitForTimeout(3500);
  await page.reload({ waitUntil: "networkidle" });
  const xpAfterSpam = await readTotalXp(page);
  check("rapid repeated toggling never inflates XP", xpAfterSpam === 60 || xpAfterSpam === 0, `total=${xpAfterSpam}`);

  // Settle to completed, then verify reopen reverses.
  let isDone = (await page.getByRole("button", { name: /Mark .Work on IRIS. as not done/ }).count()) > 0;
  if (!isDone) {
    await page.getByRole("button", { name: /Mark .Work on IRIS. as done/ }).first().click();
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: "networkidle" });
  }
  check("XP is 60 with the task complete", (await readTotalXp(page)) === 60, `total=${await readTotalXp(page)}`);

  await page.getByRole("button", { name: /Mark .Work on IRIS. as not done/ }).first().click();
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });
  check("reopening reverses the XP back to 0", (await readTotalXp(page)) === 0, `total=${await readTotalXp(page)}`);

  // Level up: complete enough to cross 100 XP.
  await page.getByRole("button", { name: /Mark .Work on IRIS. as done/ }).first().click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Mark .Finish Chemistry notes. as done/ }).first().click();
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });
  const xpLevel = await readTotalXp(page);
  const lvl = await readLevel(page);
  check("XP accumulates across tasks", xpLevel === 100, `total=${xpLevel}`);
  check("level rises to 2 at 100 XP", lvl === 2, `level=${lvl}`);

  const dash = await page.locator("main#main").innerText();
  check("streak starts at 1 day", /\b1\s*\n?\s*day\b/i.test(dash), dash.match(/STREAK[\s\S]{0,60}/)?.[0]?.replace(/\n/g, " "));
  check("today's completion percentage is shown", /\d+%/.test(dash));
  await page.screenshot({ path: `${SHOTS}/06-dashboard-progress.png`, fullPage: true });

  // ===================== TASKS PAGE, EDIT, DELETE, FILTERS =====================
  section("Tasks page: edit, delete, filters");
  await page.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  check("tasks page lists every task", (await page.locator("text=Read chapter").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/07-tasks-page.png`, fullPage: true });

  await page.getByRole("button", { name: /Actions for .Read chapter./ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]");
  await page.getByLabel("Title", { exact: false }).fill("Read chapter 12");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  check("editing a task persists", (await page.locator("text=Read chapter 12").count()) > 0);

  await page.getByRole("button", { name: /Actions for .Read chapter 12./ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.waitForSelector("dialog[open]");
  await page.getByRole("button", { name: "Delete task" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  check("deleting a task removes it", (await page.locator("text=Read chapter 12").count()) === 0);

  await page.goto(`${BASE}/app/tasks?status=completed`, { waitUntil: "networkidle" });
  const doneOnly = await page.locator("main#main").innerText();
  check("completed filter shows completed work", doneOnly.includes("Work on IRIS"));
  check("completed filter hides open work", !doneOnly.includes("English project"));

  await page.goto(`${BASE}/app/tasks?priority=URGENT&status=all`, { waitUntil: "networkidle" });
  const urgentOnly = await page.locator("main#main").innerText();
  check("priority filter narrows the list", urgentOnly.includes("English project") && !urgentOnly.includes("Finish Chemistry notes"));

  await page.goto(`${BASE}/app/tasks?q=English&status=all`, { waitUntil: "networkidle" });
  const searched = await page.locator("main#main").innerText();
  check("search narrows the list", searched.includes("English project") && !searched.includes("Work on IRIS"));

  await page.goto(`${BASE}/app/tasks?q=zzzznothing&status=all`, { waitUntil: "networkidle" });
  check("no-match search shows a filtered empty state", (await page.locator("text=No tasks match these filters").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/08-tasks-filtered-empty.png` });

  // capture a task id for the cross-user probe
  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  taskAId = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Actions for"]');
    return btn ? btn.getAttribute("aria-label") : null;
  });

  // ===================== PLACEHOLDERS =====================
  section("Unbuilt feature placeholders");
  // /app/projects (Phase 2), /app/goals (Phase 3) and /app/calendar (Phase
  // 4.1) were placeholders here once and are now real routes, so they are
  // asserted the other way round.
  for (const route of ["/app/inbox", "/app/deadlines", "/app/analytics"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const txt = await page.locator("main#main").innerText();
    check(`${route} renders a coming-soon state`, txt.includes("is not built yet"));
  }

  for (const route of ["/app/projects", "/app/goals", "/app/calendar"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    check(`${route} is a real route, not a placeholder`,
      !(await page.locator("text=is not built yet").count()));
  }
  await page.screenshot({ path: `${SHOTS}/09-coming-soon.png`, fullPage: true });

  // ===================== SETTINGS =====================
  section("Settings");
  await page.goto(`${BASE}/app/settings`, { waitUntil: "networkidle" });
  const settings = await page.locator("main#main").innerText();
  const settingsLower = settings.toLowerCase();
  check("settings shows progress summary", settingsLower.includes("total xp") && settingsLower.includes("longest streak"));
  check("settings lists default categories", settings.includes("Robotics") && settings.includes("Coding"));
  await page.getByLabel("Timezone", { exact: false }).selectOption("Asia/Tokyo").catch(() => {});
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2200);
  await page.reload({ waitUntil: "networkidle" });
  const tz = await page.getByLabel("Timezone", { exact: false }).inputValue();
  check("timezone change persists", tz === "Asia/Tokyo", tz);
  await page.screenshot({ path: `${SHOTS}/10-settings.png`, fullPage: true });

  // ===================== SESSION PERSISTENCE =====================
  section("Session persistence & sign out");
  const reopened = wire(await ctxA.newPage());
  await reopened.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("session persists in a new tab", reopened.url() === `${BASE}/app`);
  await reopened.close();

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 20000 });
  check("sign out returns to login", page.url().includes("/login"));
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("after sign out /app is protected again", page.url().includes("/login"));

  // sign back in
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: false }).fill(USER_A.email);
  await page.getByLabel("Password", { exact: false }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(2500);
  check("wrong password is rejected", (await page.locator("text=Incorrect email or password.").count()) > 0);

  await page.getByLabel("Password", { exact: false }).fill(USER_A.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
  check("signing back in restores the account", (await readTotalXp(page)) === 100);

  // ===================== CROSS-USER ISOLATION =====================
  section("Cross-user isolation");
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);
  await pageB.waitForLoadState("networkidle");
  const bDash = await pageB.locator("main#main").innerText();
  check("second account sees none of the first's tasks", !bDash.includes("Work on IRIS") && !bDash.includes("English project"));
  check("second account starts at 0 XP", (await readTotalXp(pageB)) === 0);

  await pageB.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  const bTasks = await pageB.locator("main#main").innerText();
  check("second account's task list is empty of the first's data", !bTasks.includes("Work on IRIS"));
  await pageB.screenshot({ path: `${SHOTS}/11-second-account.png`, fullPage: true });
  await ctxB.close();

  // ===================== RESPONSIVE =====================
  section("Responsive layout");
  const mobile = wire(await ctxA.newPage());
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const bottomNav = await mobile.locator("nav[aria-label='Main']").last().isVisible();
  check("mobile shows bottom navigation", bottomNav);
  const sidebarHidden = await mobile.locator("nav[aria-label='Main']").first().evaluate((el) => window.getComputedStyle(el).display === "none").catch(() => true);
  check("mobile hides the desktop sidebar", sidebarHidden);
  await mobile.screenshot({ path: `${SHOTS}/12-mobile-dashboard.png`, fullPage: true });

  await mobile.setViewportSize({ width: 820, height: 1180 });
  await mobile.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: `${SHOTS}/13-tablet-tasks.png`, fullPage: true });
  check("tablet layout renders the task list", (await mobile.locator("main#main").innerText()).includes("Tasks"));
  await mobile.close();

  section("Assets");
  const iconStatus = await page.evaluate(async () => (await fetch("/icon.svg")).status);
  check("app icon is served (no favicon 404)", iconStatus === 200, `status=${iconStatus}`);

  // ===================== ACCESSIBILITY SPOT CHECKS =====================
  section("Accessibility");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const a11y = await page.evaluate(() => {
    const out = {};
    out.progressbars = document.querySelectorAll('[role="progressbar"][aria-valuenow]').length;
    out.toggles = document.querySelectorAll('button[aria-pressed]').length;
    out.skipLink = Boolean(document.querySelector('a[href="#main"]'));
    out.main = Boolean(document.querySelector("main#main"));
    out.h1 = document.querySelectorAll("h1").length;
    out.navLandmarks = document.querySelectorAll('nav[aria-label]').length;
    out.currentPage = document.querySelectorAll('[aria-current="page"]').length;
    out.unlabelledIconButtons = Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")
    ).length;
    return out;
  });
  check("progress bars expose values", a11y.progressbars >= 2, JSON.stringify(a11y.progressbars));
  check("completion controls are toggle buttons", a11y.toggles >= 1);
  check("skip link present", a11y.skipLink);
  check("single h1 and a main landmark", a11y.h1 === 1 && a11y.main, `h1=${a11y.h1}`);
  check("navigation landmarks are labelled", a11y.navLandmarks >= 1);
  check("active nav item marked aria-current", a11y.currentPage >= 1);
  check("no unlabelled icon-only buttons", a11y.unlabelledIconButtons === 0, `count=${a11y.unlabelledIconButtons}`);

  // keyboard: tab to skip link, then activate quick add via N
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("first tab stop is the skip link", focused === "Skip to content", String(focused));

  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("n");
  await page.waitForTimeout(900);
  check("keyboard shortcut N opens quick add", (await page.locator("dialog[open]").count()) > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  check("Escape closes the dialog", (await page.locator("dialog[open]").count()) === 0);

  await ctxA.close();
} catch (error) {
  console.error("\nE2E ERROR:", error.message);
  results.push({ name: "suite ran to completion", ok: false, detail: error.message });
} finally {
  console.log("\n=== console errors ===");
  console.log(consoleErrors.length ? [...new Set(consoleErrors)].join("\n") : "(none)");
  console.log("=== uncaught page errors ===");
  console.log(pageErrors.length ? [...new Set(pageErrors)].join("\n") : "(none)");
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("\nFAILURES:"); failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`)); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

function nextDay(n) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
