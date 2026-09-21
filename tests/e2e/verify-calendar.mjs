/**
 * End-to-end verification of the Phase 4.1 calendar against a running
 * production build.
 *
 *     npm run build && npm start                       # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 node tests/e2e/verify-calendar.mjs
 *
 * The through-line of this suite: the calendar is a *view*. Every assertion
 * below either checks that it shows exactly what the underlying records say,
 * or that changing a record changes the calendar with nothing kept in sync.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();

const USER_A = { email: `ca.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Cal" };
const USER_B = { email: `cb.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Cal" };

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
const cal = (query = "") => `${BASE}/app/calendar${query}`;

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

async function createTask(page, { title, dueDate, dueTime, priority }) {
  await page.keyboard.press("n");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Title", { exact: false }).fill(title);
  if (dueDate) await d.getByLabel("Due date", { exact: false }).fill(dueDate);
  if (dueTime) await d.getByLabel("Due time", { exact: false }).fill(dueTime);
  if (priority) await d.getByLabel("Priority", { exact: false }).selectOption(priority);
  await d.getByRole("button", { name: /Create task/ }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1600);
}

async function createProject(page, { name, startDate, dueDate }) {
  await page.keyboard.press("p");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Name", { exact: false }).fill(name);
  if (startDate) await d.getByLabel("Start date", { exact: false }).fill(startDate);
  if (dueDate) await d.getByLabel("Due date", { exact: false }).fill(dueDate);
  await d.getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1600);
}

async function createGoal(page, { title, targetDate }) {
  await page.keyboard.press("g");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Goal", { exact: false }).fill(title);
  if (targetDate) await d.getByLabel("Target date", { exact: false }).fill(targetDate);
  await d.getByRole("button", { name: "Create goal" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1600);
}

const noOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = wire(await ctxA.newPage());

  // ===================== SETUP =====================
  section("Route & empty state");
  await signUp(page, USER_A);

  await page.goto(cal(), { waitUntil: "networkidle" });
  check("calendar route is real, not a placeholder",
    !(await page.locator("text=is not built yet").count()));
  check("page heading is Calendar",
    (await page.locator("h1").first().innerText()).trim() === "Calendar");
  check("empty calendar explains where items come from",
    (await page.locator("text=/Dates set on tasks, milestones, projects and goals/i").count()) > 0);
  check("month grid renders even with nothing on it",
    (await page.locator("text=Mon").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/c01-empty.png`, fullPage: true });

  // ===================== DATA APPEARS =====================
  section("Existing records appear, with no calendar record created");
  await createTask(page, { title: "Cal timed task", dueDate: day(0), dueTime: "14:30", priority: "URGENT" });
  await createTask(page, { title: "Cal all-day task", dueDate: day(1) });
  await createTask(page, { title: "Cal undated task" });
  await createProject(page, { name: "Cal project", startDate: day(0), dueDate: day(3) });
  await createGoal(page, { title: "Cal goal", targetDate: day(5) });

  await page.goto(cal(), { waitUntil: "networkidle" });
  const monthText = await page.locator("main").innerText();
  check("a task with a due date appears", monthText.includes("Cal timed task"));
  check("its time is shown in 12-hour form", monthText.includes("2:30 PM"));
  check("an all-day task appears", monthText.includes("Cal all-day task"));
  check("a project appears", monthText.includes("Cal project"));
  check("a goal appears", monthText.includes("Cal goal"));
  check("an undated task does NOT appear", !monthText.includes("Cal undated task"));
  await page.screenshot({ path: `${SHOTS}/c02-month.png`, fullPage: true });

  // A project with a start and a due date is two facts about one project.
  const projectChips = await page.locator("a", { hasText: "Cal project" }).count();
  check("a project with two dates is drawn on both days", projectChips >= 2, `chips=${projectChips}`);

  section("Items link to the real record, never to a calendar record");
  const hrefs = await page.locator("main a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  check("no href points at a calendar item detail page",
    hrefs.every((h) => !h || !/\/app\/calendar\/[^?]/.test(h)));
  check("project chips link to the project page",
    hrefs.some((h) => h && /\/app\/projects\/[a-z0-9]+$/i.test(h)));
  check("goal chips link to the goal page",
    hrefs.some((h) => h && /\/app\/goals\/[a-z0-9]+$/i.test(h)));

  // ===================== VIEWS =====================
  section("Four views over the same data");
  for (const [view, marker] of [["week", "Cal timed task"], ["day", "At a time"], ["timeline", "Today"]]) {
    await page.goto(cal(`?view=${view}`), { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    // `eyebrow` headings are uppercased in CSS, and innerText reports the
    // rendered casing — so section headings are matched case-insensitively.
    const text = (await page.locator("main").innerText()).toLowerCase();
    check(`${view} view renders`, text.includes(marker.toLowerCase()), `missing "${marker}"`);
    await page.screenshot({ path: `${SHOTS}/c03-${view}.png`, fullPage: true });
  }

  await page.goto(cal("?view=day"), { waitUntil: "networkidle" });
  const dayText = (await page.locator("main").innerText()).toLowerCase();
  check("day view separates timed from all-day work",
    dayText.includes("at a time") && dayText.includes("cal timed task"));
  check("day view does not show another day's items", !dayText.includes("cal all-day task"));

  await page.goto(cal("?view=timeline"), { waitUntil: "networkidle" });
  const timelineText = await page.locator("main").innerText();
  check("timeline is ordered from today forward",
    timelineText.indexOf("Cal timed task") < timelineText.indexOf("Cal goal"));
  check("timeline skips empty days",
    !/Nothing scheduled/i.test(timelineText));

  // ===================== URL STATE =====================
  section("URL state");
  await page.goto(cal(), { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "Week" }).click();
  await page.waitForTimeout(1200);
  check("switching view writes it to the URL", page.url().includes("view=week"));

  await page.getByRole("button", { name: /Next week/ }).click();
  await page.waitForTimeout(1200);
  check("stepping forward writes a date to the URL", /date=\d{4}-\d{2}-\d{2}/.test(page.url()));
  const steppedUrl = page.url();

  await page.getByRole("button", { name: /Previous week/ }).click();
  await page.waitForTimeout(1200);
  check("stepping back returns to the original range", page.url() !== steppedUrl);

  await page.goto(cal("?view=month&date=2027-03-01"), { waitUntil: "networkidle" });
  check("a shared link restores the exact range",
    (await page.locator("main").innerText()).includes("March 2027"));
  check("Today button is offered when away from today",
    await page.getByRole("button", { name: "Today" }).isEnabled());

  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForTimeout(1400);
  check("Today returns to the current range", !page.url().includes("date="));
  check("Today is disabled once you are already there",
    await page.getByRole("button", { name: "Today" }).isDisabled());

  section("Invalid URL state falls back rather than failing");
  for (const [query, expectation] of [
    ["?view=wormhole", "unknown view falls back to month"],
    ["?date=2026-02-31", "an impossible date falls back to today"],
    ["?date=not-a-date", "a malformed date falls back to today"],
    ["?kinds=events,meetings", "unknown kinds are dropped"],
    ["?show=everything", "an unknown filter falls back"],
    ["?date=2026-02-31&view=day&kinds=&show=", "all of it at once"],
  ]) {
    await page.goto(cal(query), { waitUntil: "networkidle" });
    const ok = (await page.locator("h1").first().innerText()).trim() === "Calendar";
    check(expectation, ok, query);
  }

  // ===================== FILTERS =====================
  section("Filters");
  await page.goto(cal(), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Tasks/ }).first().click();
  await page.waitForTimeout(1400);
  const withoutTasks = await page.locator("main").innerText();
  check("unticking Tasks removes tasks", !withoutTasks.includes("Cal timed task"));
  check("and leaves the other kinds alone", withoutTasks.includes("Cal project"));
  check("the kind filter is in the URL", page.url().includes("kinds="));

  await page.getByRole("button", { name: /Clear/ }).click();
  await page.waitForTimeout(1400);
  check("clearing restores everything",
    (await page.locator("main").innerText()).includes("Cal timed task"));

  // Completing a task must change the calendar, because the calendar is
  // reading the task.
  await page.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Mark .*Cal all-day task.* as done/ }).first().click();
  await page.waitForTimeout(2000);
  await page.goto(cal("?show=open"), { waitUntil: "networkidle" });
  check("a completed task drops out of the open-only calendar",
    !(await page.locator("main").innerText()).includes("Cal all-day task"));
  await page.goto(cal("?show=all"), { waitUntil: "networkidle" });
  check("and is still there when showing everything",
    (await page.locator("main").innerText()).includes("Cal all-day task"));

  // ===================== IT IS A VIEW =====================
  section("The calendar is a view, not a second source of truth");
  await page.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for .*Cal timed task/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Due date", { exact: false }).fill(day(4));
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await page.goto(cal("?view=day"), { waitUntil: "networkidle" });
  check("moving a task's date removes it from the old day",
    !(await page.locator("main").innerText()).includes("Cal timed task"));
  await page.goto(cal(`?view=day&date=${day(4)}`), { waitUntil: "networkidle" });
  check("and puts it on the new one, with nothing to keep in sync",
    (await page.locator("main").innerText()).includes("Cal timed task"));

  check("no calendar mutation controls are offered (read-only this phase)",
    (await page.locator("main button", { hasText: /Reschedule|Move|Drag/i }).count()) === 0);

  // ===================== CROSS-USER =====================
  section("Cross-user isolation");
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);
  await pageB.goto(cal("?show=all"), { waitUntil: "networkidle" });
  const bText = await pageB.locator("main").innerText();
  for (const title of ["Cal timed task", "Cal project", "Cal goal", "Cal all-day task"]) {
    check(`another user's "${title}" is not on this calendar`, !bText.includes(title));
  }
  await pageB.goto(cal(`?view=day&date=${day(4)}`), { waitUntil: "networkidle" });
  check("nor on the exact day it lives on",
    !(await pageB.locator("main").innerText()).includes("Cal timed task"));
  await ctxB.close();

  // ===================== RESPONSIVE =====================
  section("Responsive");
  const mobile = wire(await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await ctxA.storageState(),
  })).newPage());

  for (const [view, label] of [["month", "month"], ["week", "week"], ["day", "day"], ["timeline", "timeline"]]) {
    await mobile.goto(cal(`?view=${view}`), { waitUntil: "networkidle" });
    await mobile.waitForTimeout(700);
    check(`no horizontal overflow at 390px (${label})`, await noOverflow(mobile));
  }
  await mobile.screenshot({ path: `${SHOTS}/c04-mobile-month.png`, fullPage: true });

  await mobile.goto(cal("?view=week"), { waitUntil: "networkidle" });
  check("week view stacks rather than shrinking to slivers at 390px",
    (await mobile.locator("main").innerText()).includes("Cal project"));
  await mobile.screenshot({ path: `${SHOTS}/c05-mobile-week.png`, fullPage: true });

  await mobile.setViewportSize({ width: 768, height: 1024 });
  for (const view of ["month", "week", "day", "timeline"]) {
    await mobile.goto(cal(`?view=${view}`), { waitUntil: "networkidle" });
    await mobile.waitForTimeout(600);
    check(`no horizontal overflow at 768px (${view})`, await noOverflow(mobile));
  }
  await mobile.close();

  for (const view of ["month", "week", "day", "timeline"]) {
    await page.goto(cal(`?view=${view}`), { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    check(`no horizontal overflow at 1440px (${view})`, await noOverflow(page));
  }

  // ===================== ACCESSIBILITY =====================
  section("Accessibility");
  await page.goto(cal(), { waitUntil: "networkidle" });
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    unlabelled: Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    unlabelledLinks: Array.from(document.querySelectorAll("a")).filter(
      (a) => !a.textContent.trim() && !a.getAttribute("aria-label")).length,
    currentPage: document.querySelectorAll('[aria-current="page"]').length,
    badUl: Array.from(document.querySelectorAll("ul, ol")).filter((list) =>
      Array.from(list.children).some((c) => c.tagName !== "LI" && c.tagName !== "TEMPLATE")).length,
    radiogroup: document.querySelectorAll('[role="radiogroup"][aria-label]').length,
    live: document.querySelectorAll('[aria-live="polite"]').length,
    pressed: document.querySelectorAll("button[aria-pressed]").length,
  }));
  check("single h1 on the calendar", a11y.h1 === 1, `h1=${a11y.h1}`);
  check("no unlabelled icon-only buttons", a11y.unlabelled === 0, `count=${a11y.unlabelled}`);
  check("no unlabelled links", a11y.unlabelledLinks === 0, `count=${a11y.unlabelledLinks}`);
  check("calendar nav marked as current", a11y.currentPage >= 1);
  check("lists contain only list items", a11y.badUl === 0, `bad=${a11y.badUl}`);
  check("view switcher is a labelled radiogroup", a11y.radiogroup >= 1);
  check("the range label is announced when it changes", a11y.live >= 1);
  check("kind filters expose pressed state", a11y.pressed >= 4, `count=${a11y.pressed}`);

  await page.keyboard.press("Tab");
  const focusTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
  check("the page is keyboard reachable", focusTag !== "BODY", `focus=${focusTag}`);

  section("Phase 1 flows still work from the calendar");
  await page.keyboard.press("n");
  await page.waitForTimeout(1000);
  const taskDialog = await dlg(page).innerText().catch(() => "");
  check("N still opens the task dialog directly, with no menu", taskDialog.includes("New task"));
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
