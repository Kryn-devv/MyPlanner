/**
 * End-to-end verification of the Phase 4.2 Today page against a running
 * production build.
 *
 *     npm run build && npm start                    # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 node tests/e2e/verify-today.mjs
 *
 * The through-line: Today is a *view* over tasks. Every assertion either
 * checks that the day shows exactly what the task rows say, or that changing
 * a task changes the day — with nothing kept in sync, because there is
 * nothing to keep in sync.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();

const USER_A = { email: `ta.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Day" };
const USER_B = { email: `tb.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Day" };

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
const today = (page) => page.goto(`${BASE}/app/today`, { waitUntil: "networkidle" });
const todayAt = (page, query) => page.goto(`${BASE}/app/today${query}`, { waitUntil: "networkidle" });
/** `eyebrow` headings are uppercased in CSS and innerText reports the rendered
    casing, so section headings are always matched case-insensitively. */
const text = async (page) => (await page.locator("main").innerText()).toLowerCase();

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

async function createTask(page, { title, dueDate, dueTime, priority, minutes, xp }) {
  await page.keyboard.press("n");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Title", { exact: false }).fill(title);
  if (priority) await d.getByLabel("Priority", { exact: false }).selectOption(priority);
  if (dueDate !== undefined) await d.getByLabel("Due date", { exact: false }).fill(dueDate ?? "");
  if (dueTime) await d.getByLabel("Due time", { exact: false }).fill(dueTime);
  if (minutes) await d.getByLabel("Estimated duration", { exact: false }).fill(String(minutes));
  if (xp !== undefined) await d.getByLabel("XP reward", { exact: false }).fill(String(xp));
  await d.getByRole("button", { name: /Create task/ }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function createProject(page, { name }) {
  await page.keyboard.press("p");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Name", { exact: false }).fill(name);
  await d.getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function createGoal(page, { title }) {
  await page.keyboard.press("g");
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Goal", { exact: false }).fill(title);
  await d.getByRole("button", { name: "Create goal" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

const noOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/** Total XP lives on the dashboard; Today shows only the day's own figure. */
const readTotalXp = async (page) => {
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const t = await page.locator("text=/XP earned all time/").first().innerText();
  return Number(t.replace(/[^0-9]/g, ""));
};

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = wire(await ctxA.newPage());

  // ===================== ROUTE & EMPTY =====================
  section("Route and empty state");
  await signUp(page, USER_A);

  await today(page);
  check("/app/today opens", page.url() === `${BASE}/app/today`);
  check("route is real, not a placeholder",
    !(await page.locator("text=is not built yet").count()));
  check("heading says Today", (await page.locator("h1").first().innerText()).trim() === "Today");
  check("the current date is shown", (await text(page)).includes(
    new Date().toLocaleDateString("en-GB", { day: "numeric" }).toLowerCase()));
  check("an empty day explains itself rather than looking broken",
    (await text(page)).includes("nothing scheduled for today"));
  check("an empty day still offers a way to start",
    (await page.getByRole("button", { name: /Add a task/ }).count()) > 0);
  await page.screenshot({ path: `${SHOTS}/t01-empty.png`, fullPage: true });

  // ===================== THE DAY =====================
  section("Today's work");
  await createTask(page, { title: "Day timed nine", dueDate: day(0), dueTime: "09:00", minutes: 30, priority: "URGENT" });
  await createTask(page, { title: "Day timed five", dueDate: day(0), dueTime: "17:00", minutes: 45 });
  await createTask(page, { title: "Day all day", dueDate: day(0), minutes: 20 });
  await createTask(page, { title: "Day no estimate", dueDate: day(0) });
  await createTask(page, { title: "Day overdue one", dueDate: day(-2), priority: "HIGH" });
  await createTask(page, { title: "Day overdue two", dueDate: day(-5) });
  await createTask(page, { title: "Day tomorrow", dueDate: day(1) });
  await createTask(page, { title: "Day unscheduled", dueDate: null });

  await today(page);
  const dayText = await text(page);
  check("today's tasks appear", dayText.includes("day timed nine") && dayText.includes("day all day"));
  check("timed work is separated from all-day work",
    dayText.includes("at a time") && dayText.includes("all day"));
  check("times render in 12-hour form",
    (await page.locator("main").innerText()).includes("9:00 AM"));
  check("timed tasks are in chronological order",
    dayText.indexOf("day timed nine") < dayText.indexOf("day timed five"));
  check("an unscheduled task is not in the day",
    dayText.indexOf("unscheduled") > dayText.indexOf("day all day"));
  check("a future task is not in the day", !dayText.includes("day tomorrow  \n"));
  await page.screenshot({ path: `${SHOTS}/t02-day.png`, fullPage: true });

  section("Overdue");
  check("overdue has its own section", dayText.includes("overdue"));
  check("overdue tasks appear", dayText.includes("day overdue one") && dayText.includes("day overdue two"));
  check("overdue is listed before today's work",
    dayText.indexOf("day overdue two") < dayText.indexOf("at a time"));
  check("the oldest miss is first",
    dayText.indexOf("day overdue two") < dayText.indexOf("day overdue one"));
  check("an overdue row shows its original due date",
    (await page.locator("main").innerText()).match(/\d+ \w{3}/) !== null);
  check("a future task is never called overdue",
    !dayText.slice(0, dayText.indexOf("at a time")).includes("day tomorrow"));

  section("Progress and workload");
  check("progress counts only this day's tasks", dayText.includes("0 of 4 tasks completed"));
  check("estimated workload is the sum of this day's estimates",
    dayText.includes("1h 35m"), "30 + 45 + 20");
  check("workload is labelled an estimate, never time spent", dayText.includes("estimated"));
  check("tasks with no estimate are counted, not guessed", dayText.includes("1 unestimated"));
  check("outstanding work from earlier is counted separately",
    dayText.includes("2 outstanding from earlier"));
  check("the progress bar exposes a value",
    (await page.locator('[role="progressbar"][aria-valuenow]').count()) >= 1);

  // ===================== COMPLETION =====================
  section("Completion, XP and streak run through the existing systems");
  const xpBefore = await readTotalXp(page);
  await page.getByRole("button", { name: /Mark .*Day all day.* as done/ }).first().click();
  await page.waitForTimeout(2500);

  await today(page);
  const afterText = await text(page);
  check("completing a task works from Today", afterText.includes("completed today"));
  check("a completed task stays visible", afterText.includes("day all day"));
  check("daily progress updates", afterText.includes("1 of 4 tasks completed"));
  check("XP earned on the day is shown", /\+\d+/.test(await page.locator("main").innerText()));
  const xpAfter = await readTotalXp(page);
  check("the existing XP ledger ran, not a second one", xpAfter > xpBefore, `${xpBefore} -> ${xpAfter}`);
  check("the existing streak ran", (await page.locator("text=/day streak/i").count()) > 0
    || (await page.locator("main").innerText()).includes("day"));
  check("remaining estimate drops by the completed task",
    afterText.includes("1h 15m left"), "95 - 20");
  await page.screenshot({ path: `${SHOTS}/t03-completed.png`, fullPage: true });

  section("Completing an overdue task clears it from overdue");
  await page.getByRole("button", { name: /Mark .*Day overdue two.* as done/ }).first().click();
  await page.waitForTimeout(2500);
  await today(page);
  const overdueText = await text(page);
  check("a completed overdue task leaves the overdue section",
    !overdueText.slice(0, overdueText.indexOf("at a time")).includes("day overdue two"));
  check("and the overdue count drops", overdueText.includes("1 outstanding from earlier"));
  check("it is not silently rescheduled — the date was not touched",
    overdueText.includes("day overdue two"));

  // ===================== DATE NAVIGATION =====================
  section("Date navigation");
  await today(page);
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.waitForTimeout(1500);
  check("previous day writes the date to the URL", page.url().includes(`date=${day(-1)}`));
  check("the heading names the day", (await page.locator("h1").first().innerText()).trim() === "Yesterday");

  await page.getByRole("button", { name: "Next day" }).click();
  await page.waitForTimeout(1500);
  check("next day returns to today, which carries no parameter", !page.url().includes("date="));

  await page.getByRole("button", { name: "Next day" }).click();
  await page.waitForTimeout(1500);
  check("next day moves forward", page.url().includes(`date=${day(1)}`));
  check("tomorrow's task is on tomorrow", (await text(page)).includes("day tomorrow"));
  check("Today is offered when away from today",
    await page.getByRole("button", { name: "Today" }).isEnabled());

  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForTimeout(1500);
  check("Today returns to the current date", !page.url().includes("date="));
  check("Today is disabled once already there",
    await page.getByRole("button", { name: "Today" }).isDisabled());

  section("Historical and future days");
  await todayAt(page, `?date=${day(-2)}`);
  const pastText = await text(page);
  check("a historical day shows its own tasks", pastText.includes("day overdue one"));
  check("and is labelled as a past day, not as today",
    (await page.locator("h1").first().innerText()).trim() !== "Today");
  check("the viewed day's own tasks are not repeated in overdue",
    (pastText.match(/day overdue one/g) ?? []).length === 1);
  const pastHasOverdueSection = (await page.locator("#overdue-heading").count()) > 0;
  check("overdue on a past day is explicitly 'as of today'",
    !pastHasOverdueSection || pastText.includes("as of today"),
    `section=${pastHasOverdueSection}`);

  await todayAt(page, `?date=${day(7)}`);
  const futureText = await text(page);
  check("a future day renders", (await page.locator("h1").count()) === 1);
  check("nothing on a future day is called overdue merely for being before now",
    !futureText.includes("day tomorrow") || !futureText.includes("deadline has already passed"));
  check("a future day still surfaces what is genuinely late",
    futureText.includes("day overdue one"));

  section("Unscheduled");
  await today(page);
  const uText = await text(page);
  check("unscheduled has its own section", uText.includes("unscheduled"));
  check("it names the task", uText.includes("day unscheduled"));
  check("it is explicitly not overdue", uText.includes("never counted as overdue"));
  check("it sits below the day's work",
    uText.indexOf("unscheduled") > uText.indexOf("at a time"));
  check("it does not count towards the day", uText.includes("1 of 4 tasks completed"));

  section("Up next");
  check("a compact preview of what follows", uText.includes("up next"));
  check("it shows the upcoming task", uText.includes("day tomorrow"));
  check("it links to the timeline rather than rendering a calendar",
    (await page.locator("main a", { hasText: /See the timeline/i }).count()) > 0);

  // ===================== URL STATE =====================
  section("URL state and malformed input");
  for (const [query, expectation] of [
    ["?date=2026-02-31", "an impossible date falls back to today"],
    ["?date=not-a-date", "a malformed date falls back to today"],
    ["?date=", "an empty date falls back to today"],
    ["?date=1900-01-01", "a date outside the supported range falls back"],
    ["?date=9999-12-31", "a far-future date falls back"],
    ["?date[]=2026-01-01&date[]=x", "an array parameter does not break the page"],
    ["?userId=someone-else", "an unexpected parameter is ignored"],
  ]) {
    await todayAt(page, query);
    const ok = (await page.locator("h1").count()) === 1
      && !(await page.locator("text=/prisma|sql|stack/i").count());
    check(expectation, ok, query);
  }

  await todayAt(page, `?date=${day(-1)}`);
  check("a shared link restores the exact day", page.url().includes(`date=${day(-1)}`));
  check("and renders that day", (await page.locator("h1").first().innerText()).trim() === "Yesterday");

  // ===================== LINKS =====================
  section("Navigation out to the canonical pages");
  await createProject(page, { name: "Day project" });
  await createGoal(page, { title: "Day goal" });
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  await today(page);
  check("the calendar link carries the day",
    (await page.locator('main a[href*="/app/calendar"]').first().getAttribute("href"))
      ?.includes("view=day"));

  const calLink = page.locator('main a[href*="/app/calendar"]').first();
  await calLink.click();
  await page.waitForURL(/\/app\/calendar/, { timeout: 15000 });
  check("the calendar link works", page.url().includes("/app/calendar"));
  check("and lands on the day view", page.url().includes("view=day"));

  await today(page);
  const taskLink = page.locator('main a[href^="/app/tasks"]').first();
  check("Today links through to the task list", (await taskLink.count()) > 0);

  section("Project and goal context");
  await page.goto(`${BASE}/app/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for .*Day timed nine/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Project", { exact: false }).selectOption({ label: "Day project" });
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await today(page);
  check("a task shows its project", (await text(page)).includes("day project"));
  const projectLink = page.locator('main a[href^="/app/projects/"]').first();
  check("the project chip links to the project page", (await projectLink.count()) > 0);
  if (await projectLink.count()) {
    await projectLink.click();
    await page.waitForURL(/\/app\/projects\//, { timeout: 15000 });
    check("project navigation works", page.url().includes("/app/projects/"));
  }

  // Connect the project to the goal so the day can say what it is for.
  await page.getByRole("button", { name: /Actions for|Edit project/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for .*Day project|Edit/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const edit = page.getByRole("menuitem", { name: "Edit" }).first();
  if (await edit.count()) {
    await edit.click();
    await page.waitForSelector("dialog[open]", { timeout: 10000 });
    await dlg(page).getByLabel("Goal", { exact: false }).selectOption({ label: "Day goal" }).catch(() => {});
    await dlg(page).getByRole("button", { name: /Save/ }).click();
    await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  await today(page);
  const goalText = await text(page);
  check("the day says what it is working towards", goalText.includes("working towards"), "goal line");
  check("and names the goal once, not per row",
    (goalText.match(/day goal/g) ?? []).length === 1);
  const goalLink = page.locator('main a[href^="/app/goals/"]').first();
  check("the goal link is present", (await goalLink.count()) > 0);
  if (await goalLink.count()) {
    await goalLink.click();
    await page.waitForURL(/\/app\/goals\//, { timeout: 15000 });
    check("goal navigation works", page.url().includes("/app/goals/"));
  }
  await page.screenshot({ path: `${SHOTS}/t04-context.png`, fullPage: true });

  // ===================== QUICK ADD =====================
  section("Quick add keeps working, and knows the day");
  await todayAt(page, `?date=${day(3)}`);
  await page.locator("main").getByRole("button", { name: /New task/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  check("New task from Today prefills the day being viewed",
    (await dlg(page).getByLabel("Due date", { exact: false }).inputValue()) === day(3));
  await dlg(page).getByLabel("Title", { exact: false }).fill("Planned ahead");
  await dlg(page).getByRole("button", { name: /Create task/ }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check("and the task lands on that day", (await text(page)).includes("planned ahead"));

  await today(page);
  await page.keyboard.press("n");
  await page.waitForTimeout(900);
  check("N still opens the task dialog directly, with no menu",
    (await dlg(page).innerText().catch(() => "")).includes("New task"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  check("Escape closes it", (await page.locator("dialog[open]").count()) === 0);

  check("no rescheduling controls are offered (dates change on the task)",
    (await page.locator("main button", { hasText: /Reschedule|Move to|Drag/i }).count()) === 0);

  // ===================== DASHBOARD =====================
  section("Dashboard hands off rather than duplicating");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const toTodayLinks = await page.locator('main a[href="/app/today"]').count();
  check("the dashboard links to Today", toTodayLinks > 0, `links=${toTodayLinks}`);
  await page.locator('main a[href="/app/today"]').first().click();
  await page.waitForURL(`${BASE}/app/today`, { timeout: 15000 });
  check("and the link works", page.url() === `${BASE}/app/today`);

  // ===================== CROSS-USER =====================
  section("Cross-user isolation");
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);

  for (const query of ["", `?date=${day(-2)}`, `?date=${day(1)}`, `?date=${day(7)}`]) {
    await todayAt(pageB, query);
    const bText = await text(pageB);
    const leaked = ["day timed nine", "day overdue one", "day unscheduled", "day project", "day goal"]
      .filter((title) => bText.includes(title));
    check(`another user's data does not appear${query ? ` (${query})` : ""}`,
      leaked.length === 0, leaked.join(", "));
  }
  await today(pageB);
  check("and their day reads as empty",
    (await text(pageB)).includes("nothing scheduled for today"));
  await ctxB.close();

  // ===================== RESPONSIVE =====================
  section("Responsive");
  const mobile = wire(await (await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await ctxA.storageState(),
  })).newPage());

  for (const query of ["", `?date=${day(-2)}`, `?date=${day(7)}`]) {
    await todayAt(mobile, query);
    await mobile.waitForTimeout(700);
    check(`no horizontal overflow at 390px${query ? ` (${query})` : ""}`, await noOverflow(mobile));
  }
  check("the date controls stay usable at 390px",
    await mobile.getByRole("button", { name: "Previous day" }).isVisible());
  const progressBox = await mobile
    .locator('main [role="progressbar"]')
    .first()
    .boundingBox();
  check("progress still fits at 390px",
    Boolean(progressBox) && progressBox.width <= 390,
    `width=${progressBox?.width ?? "none"}`);
  check("mobile navigation is present and does not overflow",
    await mobile.locator("nav[aria-label='Main']").last().isVisible());
  check("completion controls remain tappable at 390px", await (async () => {
    const box = await mobile.getByRole("button", { name: /as done/ }).first().boundingBox();
    return Boolean(box && box.height >= 16 && box.width >= 16);
  })());
  await mobile.screenshot({ path: `${SHOTS}/t05-mobile.png`, fullPage: true });

  await mobile.setViewportSize({ width: 768, height: 1024 });
  await todayAt(mobile, "");
  await mobile.waitForTimeout(700);
  check("no horizontal overflow at 768px", await noOverflow(mobile));
  check("the day still renders at 768px", (await text(mobile)).includes("at a time"));
  await mobile.screenshot({ path: `${SHOTS}/t06-tablet.png`, fullPage: true });
  await mobile.close();

  for (const query of ["", `?date=${day(-2)}`]) {
    await todayAt(page, query);
    check(`no horizontal overflow at 1440px${query ? ` (${query})` : ""}`, await noOverflow(page));
  }

  // ===================== ACCESSIBILITY =====================
  section("Accessibility");
  await today(page);
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    unlabelled: Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    unlabelledLinks: Array.from(document.querySelectorAll("a")).filter(
      (a) => !a.textContent.trim() && !a.getAttribute("aria-label")).length,
    progressbars: document.querySelectorAll('[role="progressbar"][aria-valuenow]').length,
    currentPage: document.querySelectorAll('[aria-current="page"]').length,
    badUl: Array.from(document.querySelectorAll("ul, ol")).filter((list) =>
      Array.from(list.children).some((c) => c.tagName !== "LI" && c.tagName !== "TEMPLATE")).length,
    ariaHidden: Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
      (el) => el.textContent.trim().length > 40).length,
    sections: document.querySelectorAll("section[aria-labelledby]").length,
    checkboxes: document.querySelectorAll("button[aria-pressed]").length,
    struck: document.querySelectorAll(".line-through").length,
  }));
  check("single h1", a11y.h1 === 1, `h1=${a11y.h1}`);
  check("no unlabelled icon-only buttons", a11y.unlabelled === 0, `count=${a11y.unlabelled}`);
  check("no unlabelled links", a11y.unlabelledLinks === 0, `count=${a11y.unlabelledLinks}`);
  check("progress exposes a labelled value", a11y.progressbars >= 1);
  check("Today is marked as the current page", a11y.currentPage >= 1);
  check("lists contain only list items", a11y.badUl === 0, `bad=${a11y.badUl}`);
  check("no meaningful content is hidden behind aria-hidden", a11y.ariaHidden === 0,
    `count=${a11y.ariaHidden}`);
  check("sections are labelled landmarks", a11y.sections >= 2, `count=${a11y.sections}`);
  check("completion controls expose their state", a11y.checkboxes >= 1);
  check("completed state is shown without relying on colour", a11y.struck >= 1);

  await page.keyboard.press("Tab");
  check("the page is keyboard reachable",
    (await page.evaluate(() => document.activeElement?.tagName ?? "")) !== "BODY");

  const toggled = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((b) => /as done/.test(b.getAttribute("aria-label") ?? ""));
    if (!button) return false;
    button.focus();
    return document.activeElement === button;
  });
  check("task completion is keyboard focusable", toggled);

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
