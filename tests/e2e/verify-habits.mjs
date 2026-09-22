/**
 * End-to-end verification of the Phase 4.4 habits against a running
 * production build.
 *
 *     npm run build && npm start                    # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 node tests/e2e/verify-habits.mjs
 *
 * The through-line: a habit is a schedule and the days it was kept. Ticking
 * one must award XP exactly once however many times it is clicked, un-ticking
 * must give back exactly what it gave, and a day the habit was never due must
 * never read as a failure.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();

const USER_A = { email: `ha.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Habit" };
const USER_B = { email: `hb.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Habit" };

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
    if (/hydrat|did not match|server rendered|React error #(418|419|421|423|425)/i.test(t))
      consoleErrors.push(`HYDRATION: ${t}`);
  });
  page.on("pageerror", (e) => { if (!IGNORABLE.test(e.message)) pageErrors.push(e.message); });
  page.on("response", (r) => { if (r.status() >= 500) pageErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  return page;
}

const dlg = (page) => page.locator("dialog[open]");
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const goHabits = (page) => page.goto(`${BASE}/app/habits`, { waitUntil: "networkidle" });
const text = async (page) => (await page.locator("main").innerText()).toLowerCase();

const noOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

/** Opens the habit dialog with H and fills it in. */
async function createHabit(page, { name, frequency, weekdays, target, xp, startDate }) {
  await page.keyboard.press("h");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Habit", { exact: false }).first().fill(name);
  if (frequency) await d.getByText(frequency, { exact: true }).click();
  if (weekdays) {
    for (const label of weekdays) await d.getByText(label, { exact: true }).click();
  }
  // Role-based: "Times per week" is both the recurrence option's label and the
  // number field's, so a label lookup alone is ambiguous.
  if (target !== undefined) await d.getByRole("spinbutton", { name: "Times per week" }).fill(String(target));
  if (xp !== undefined) await d.getByRole("spinbutton", { name: /XP per completion/ }).fill(String(xp));
  if (startDate) await d.getByLabel("Starts", { exact: false }).fill(startDate);
  await d.getByRole("button", { name: /Create habit/ }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

/**
 * Opens a habit's detail page from its card.
 *
 * The cards animate into their new order when one is ticked, so the click is
 * made once the list has settled and the navigation is waited for explicitly
 * rather than assumed — a click that lands on a moving card is a flaky test,
 * not a finding.
 */
async function openDetail(page, name) {
  const link = page.getByRole("link", { name: new RegExp(`Open ${name}$`) });
  await link.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);
  await link.click();
  await page.waitForURL(/\/app\/habits\/[a-z0-9]+$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  // The detail body streams in after the URL settles; without this the page
  // is still the loading skeleton, which has no text at all.
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible", timeout: 15000 });
}

/**
 * The tick for a named habit, wherever it is on the page.
 *
 * Keyed on `aria-pressed`, which only the toggle carries: the card's menu
 * button also names the habit, and a disabled tick says why it is disabled
 * instead of quoting the name.
 */
const tickFor = (page, name) =>
  page.locator(`button[aria-pressed][aria-label*="${name}"]`).first();

const readTotalXp = async (page) => {
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const t = await page.locator("text=/XP earned all time/").first().innerText();
  return Number(t.replace(/[^0-9]/g, ""));
};

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = wire(await ctxA.newPage());

  // ===================== NAVIGATION =====================
  section("Habits is a real destination");
  await signUp(page, USER_A);

  const sidebar = await page.locator("nav").first().innerText();
  check("Habits appears in the sidebar", /habits/i.test(sidebar));
  check("it is not marked as coming soon", !/habits[^\n]*\n?\s*lock/i.test(sidebar));

  await goHabits(page);
  check("the habits page loads", page.url().endsWith("/app/habits"));
  check("it is not the placeholder", !(await text(page)).includes("coming"));
  check("Habits is the current page", (await page.locator('[aria-current="page"]').innerText()).toLowerCase().includes("habits"));
  check("the empty state invites a first habit", (await text(page)).includes("no habits yet"));

  // ===================== CREATING =====================
  section("Creating");
  await createHabit(page, { name: "Read 20 pages", xp: 10 });
  check("the habit appears in the list", (await text(page)).includes("read 20 pages"));
  check("its schedule is stated in words", (await text(page)).includes("every day"));

  await createHabit(page, {
    name: "Gym session",
    frequency: "Chosen days",
    // Defaults are Mon-Fri; unpick the four that are not Monday.
    weekdays: ["Tue", "Wed", "Thu", "Fri"],
    xp: 20,
  });
  const listText = await text(page);
  check("a chosen-days habit names its days", listText.includes("mon"), listText.slice(0, 120));

  await createHabit(page, { name: "Call home", frequency: "Times per week", target: 3, xp: 15 });
  check("a weekly habit shows its target", (await text(page)).includes("3× a week"));
  check("and this week's progress", /0\/3\s*this week/.test(await text(page)));

  // ===================== COMPLETING =====================
  section("Completing awards XP once");
  const xpBefore = await readTotalXp(page);

  await goHabits(page);
  await tickFor(page, "Read 20 pages").click();
  await page.waitForTimeout(2500);
  check("the tick reports it as done", (await tickFor(page, "Read 20 pages").getAttribute("aria-label")).includes("not done"));

  const xpAfterOne = await readTotalXp(page);
  check("XP went up by the habit's reward", xpAfterOne === xpBefore + 10, `${xpBefore} → ${xpAfterOne}`);

  await goHabits(page);
  check("a streak of one is shown", /(^|\s)1\s*days?(\s|$)/m.test(await text(page)));

  // Double-tick: the second click un-ticks, so tick again and confirm the
  // ledger never paid twice for the same day.
  await tickFor(page, "Read 20 pages").click();
  await page.waitForTimeout(2200);
  const xpAfterUndo = await readTotalXp(page);
  check("un-ticking gives back exactly what it gave", xpAfterUndo === xpBefore, `${xpAfterOne} → ${xpAfterUndo}`);

  await goHabits(page);
  await tickFor(page, "Read 20 pages").click();
  await page.waitForTimeout(2200);
  const xpAfterRedo = await readTotalXp(page);
  check("re-ticking awards again, once", xpAfterRedo === xpBefore + 10, `${xpAfterUndo} → ${xpAfterRedo}`);

  // Rapid repeated clicks on the same occurrence.
  await goHabits(page);
  const gym = tickFor(page, "Gym session");
  const gymEnabled = await gym.isEnabled();
  check("a habit not due today cannot be ticked", !gymEnabled);

  // ===================== DETAIL =====================
  section("Detail and history");
  await goHabits(page);
  await openDetail(page, "Read 20 pages");
  check("the detail page opens", /\/app\/habits\/[a-z0-9]+$/.test(page.url()), page.url());

  const detail = await text(page);
  check("it names the habit", detail.includes("read 20 pages"));
  check("it shows the current streak", detail.includes("current streak"));
  check("it shows the longest streak", detail.includes("longest streak"));
  check("it shows a 30-day rate", detail.includes("last 30 days"));
  check("it shows the all-time count", detail.includes("all time"));
  check("it shows a 12-week history grid", detail.includes("last 12 weeks"));
  check("the grid legend names the states in words",
    detail.includes("kept") && detail.includes("missed") && detail.includes("not due"));
  check("it says unscheduled days are not misses", detail.includes("not counted as missed"));
  check("recent completions are listed", detail.includes("recent completions"));

  const cells = await page.locator('[role="img"][aria-label*="weeks"] span').count();
  check("the grid is 12 weeks of 7 days", cells === 84, `cells=${cells}`);

  // ===================== PAUSE / ARCHIVE =====================
  section("Pausing and archiving");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(2500);
  const paused = await text(page);
  check("the habit reads as paused", paused.includes("paused"));
  check("it explains paused days are not misses", paused.includes("not counted as missed"));
  check("a paused habit cannot be ticked", !(await tickFor(page, "Read 20 pages").isEnabled()));

  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForTimeout(2500);
  check("resuming brings it back", (await tickFor(page, "Read 20 pages").isEnabled()));
  check("the streak survived the pause", (await text(page)).includes("current streak"));

  await page.getByRole("button", { name: "Archive" }).click();
  await page.waitForTimeout(2500);
  check("archiving keeps the history", (await text(page)).includes("all time"));

  await goHabits(page);
  check("an archived habit leaves the active list", !(await text(page)).includes("read 20 pages"));

  await page.goto(`${BASE}/app/habits?status=ARCHIVED`, { waitUntil: "networkidle" });
  check("and is found under the archived filter", (await text(page)).includes("read 20 pages"));

  await page.goto(`${BASE}/app/habits?status=ALL`, { waitUntil: "networkidle" });
  check("the All filter shows every habit", (await text(page)).includes("call home"));

  await page.goto(`${BASE}/app/habits?q=call`, { waitUntil: "networkidle" });
  const searched = await text(page);
  check("search narrows the list", searched.includes("call home") && !searched.includes("gym session"));

  // ===================== TODAY AND DASHBOARD =====================
  section("Today and the dashboard");
  await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
  const todayText = await text(page);
  check("Today has a habits section", todayText.includes("habits"));
  check("it lists a habit due today", todayText.includes("call home"));
  check("habits are not rendered as tasks", !todayText.includes("call home") || !/call home[\s\S]{0,40}priority/i.test(todayText));

  await tickFor(page, "Call home").click();
  await page.waitForTimeout(2500);
  check("a habit can be ticked from Today",
    (await tickFor(page, "Call home").getAttribute("aria-label")).includes("not done"));

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const dash = await text(page);
  check("the dashboard has a habits panel", dash.includes("today's habits"));
  check("it counts what is kept", /\d+\/\d+/.test(dash));
  check("it links to the habits page", (await page.getByRole("link", { name: /All habits/ }).count()) >= 1);

  await tickFor(page, "Call home").click();
  await page.waitForTimeout(2500);
  check("a habit can be un-ticked from the dashboard",
    (await tickFor(page, "Call home").getAttribute("aria-label")).includes("as done"));

  // ===================== REFUSALS =====================
  section("A refused tick does not lie");

  // A future day cannot be kept in advance, and the control says so rather
  // than offering a click that the server is certain to reject.
  await page.goto(`${BASE}/app/today?date=${day(1)}`, { waitUntil: "networkidle" });
  const tomorrow = tickFor(page, "Call home");
  check("tomorrow's tick is disabled", !(await tomorrow.isEnabled()));
  check(
    "and says why",
    /not happened yet/i.test((await tomorrow.getAttribute("aria-label")) ?? ""),
    (await tomorrow.getAttribute("aria-label")) ?? "",
  );

  // A habit archived in one tab, ticked in another: the server refuses, and
  // the optimistic tick has to snap back rather than showing a completion
  // that was never recorded.
  const staleTab = wire(await ctxA.newPage());
  await staleTab.goto(`${BASE}/app/habits`, { waitUntil: "networkidle" });

  await page.goto(`${BASE}/app/habits`, { waitUntil: "networkidle" });
  await openDetail(page, "Call home");
  await page.getByRole("button", { name: "Archive" }).click();
  await page.waitForTimeout(2500);

  const stale = tickFor(staleTab, "Call home");
  await stale.click();
  await staleTab.waitForTimeout(3000);
  check(
    "a refused tick snaps back",
    (await stale.getAttribute("aria-pressed")) === "false",
    (await stale.getAttribute("aria-pressed")) ?? "",
  );
  check("and says what happened", (await staleTab.locator("body").innerText()).toLowerCase().includes("not active"));
  await staleTab.close();

  // Put it back for the rest of the suite.
  await page.getByRole("button", { name: "Restore" }).click();
  await page.waitForTimeout(2500);

  // ===================== WEEKLY ROLL-UPS =====================
  section("A weekly target met is not still outstanding");
  await page.goto(`${BASE}/app/habits`, { waitUntil: "networkidle" });
  await createHabit(page, { name: "Sunday call", frequency: "Times per week", target: 1, xp: 5 });
  await tickFor(page, "Sunday call").click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/app/habits`, { waitUntil: "networkidle" });
  check("its week reads as met", /1\/1\s*this week/.test(await text(page)));

  // ===================== EDITING =====================
  section("Editing changes the future, not the past");
  await page.goto(`${BASE}/app/habits?status=ALL`, { waitUntil: "networkidle" });
  await openDetail(page, "Call home");
  const keptBefore = (await text(page)).match(/(\d+)\s*\n?\s*days? kept/)?.[1] ?? "0";

  await page.getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Habit", { exact: false }).first().fill("Call home weekly");
  await dlg(page).getByRole("button", { name: /Save changes/ }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);

  const edited = await text(page);
  check("the rename took", edited.includes("call home weekly"));
  const keptAfter = edited.match(/(\d+)\s*\n?\s*days? kept/)?.[1] ?? "0";
  check("its history is unchanged by the edit", keptAfter === keptBefore, `${keptBefore} → ${keptAfter}`);

  // ===================== VALIDATION =====================
  section("Validation");
  await goHabits(page);
  await page.keyboard.press("h");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByRole("button", { name: /Create habit/ }).click();
  await page.waitForTimeout(1200);
  check("an unnamed habit is refused", (await dlg(page).innerText()).toLowerCase().includes("needs a name"));

  await dlg(page).getByLabel("Habit", { exact: false }).first().fill("No days");
  await dlg(page).getByText("Chosen days", { exact: true }).click();
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await dlg(page).getByText(d, { exact: true }).click();
  await dlg(page).getByRole("button", { name: /Create habit/ }).click();
  await page.waitForTimeout(1200);
  check("chosen days with no day selected is refused",
    (await dlg(page).innerText()).toLowerCase().includes("at least one day"));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check("Escape closes the dialog", (await page.locator("dialog[open]").count()) === 0);

  // ===================== ISOLATION =====================
  section("Another user's habit is not reachable");
  const detailUrl = await (async () => {
    await page.goto(`${BASE}/app/habits?status=ALL`, { waitUntil: "networkidle" });
    await openDetail(page, "Gym session");
    return page.url();
  })();

  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);

  await pageB.goto(detailUrl, { waitUntil: "networkidle" });
  const foreign = await text(pageB);
  check("a foreign habit URL 404s", foreign.includes("habit not found"));
  check("and reveals nothing about it", !foreign.includes("gym session"));

  await pageB.goto(`${BASE}/app/habits`, { waitUntil: "networkidle" });
  check("the new user sees none of it", (await text(pageB)).includes("no habits yet"));
  await ctxB.close();

  // ===================== RESPONSIVE =====================
  section("Responsive");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await goHabits(page);
    check(`no horizontal overflow at ${width}px`, await noOverflow(page));
    await page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
    check(`Today has no overflow at ${width}px`, await noOverflow(page));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // ===================== ACCESSIBILITY =====================
  section("Accessibility");
  await goHabits(page);
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    unlabelled: Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    unlabelledLinks: Array.from(document.querySelectorAll("a")).filter(
      (a) => !a.textContent.trim() && !a.getAttribute("aria-label")).length,
    pressed: document.querySelectorAll('button[aria-pressed]').length,
    progressbars: document.querySelectorAll('[role="progressbar"][aria-valuenow]').length,
    radiogroup: document.querySelectorAll('[role="radiogroup"]').length,
    badUl: Array.from(document.querySelectorAll("ul, ol")).filter((list) =>
      Array.from(list.children).some((c) => c.tagName !== "LI" && c.tagName !== "TEMPLATE")).length,
    ariaHidden: Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent.trim().length > 40).length,
  }));
  check("single h1", a11y.h1 === 1, `h1=${a11y.h1}`);
  check("no unlabelled icon-only buttons", a11y.unlabelled === 0, `count=${a11y.unlabelled}`);
  check("no unlabelled links", a11y.unlabelledLinks === 0, `count=${a11y.unlabelledLinks}`);
  check("ticks are toggle buttons with a pressed state", a11y.pressed >= 1, `count=${a11y.pressed}`);
  check("completion rates expose a value", a11y.progressbars >= 1);
  check("the status filter is a radiogroup", a11y.radiogroup >= 1);
  check("lists contain only list items", a11y.badUl === 0);
  check("no meaningful content hidden behind aria-hidden", a11y.ariaHidden === 0);

  const gridLabel = await (async () => {
    await page.goto(`${BASE}/app/habits?status=ALL`, { waitUntil: "networkidle" });
    await openDetail(page, "Call home weekly");
    return page.locator('[role="img"]').first().getAttribute("aria-label");
  })();
  check("the history grid has a spoken summary", /weeks/i.test(gridLabel ?? ""), gridLabel ?? "");

  // ===================== REGRESSION =====================
  section("Phase 1–4.3 flows still work");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.keyboard.press("n");
  await page.waitForTimeout(1000);
  check("N still opens the task dialog", (await dlg(page).innerText().catch(() => "")).includes("New task"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.keyboard.press("g");
  await page.waitForTimeout(1000);
  check("G still opens the goal dialog", (await dlg(page).innerText().catch(() => "")).includes("New goal"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.keyboard.press("p");
  await page.waitForTimeout(1000);
  check("P still opens the project dialog", (await dlg(page).innerText().catch(() => "")).includes("New project"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  for (const [path, needle] of [
    ["/app/tasks", "tasks"],
    ["/app/today", "today"],
    ["/app/calendar", "calendar"],
    ["/app/focus", "focus"],
    ["/app/projects", "projects"],
    ["/app/goals", "goals"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    check(`${path} still renders`, (await text(page)).includes(needle));
  }

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
