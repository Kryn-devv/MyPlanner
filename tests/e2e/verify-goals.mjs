/**
 * End-to-end verification of the Phase 3 goal workflow against a running
 * production build.
 *
 *     npm run build && npm start                     # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 node tests/e2e/verify-goals.mjs
 *
 * Playwright is deliberately not a project dependency — this harness is run on
 * demand. Set E2E_CHROME to use a Chromium already on the machine.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();

const USER_A = { email: `ga.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Goal" };
const USER_B = { email: `gb.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Goal" };

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

/** Scopes lookups to the open dialog — page buttons share these labels. */
const dlg = (page) => page.locator("dialog[open]");
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function signUp(page, user) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Name", { exact: false }).fill(user.name);
  await page.getByLabel("Email", { exact: false }).fill(user.email);
  await page.getByLabel("Password", { exact: false }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 25000 });
}

async function createGoal(page, { title, priority, targetDate }) {
  await page.getByRole("button", { name: /New goal/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Goal", { exact: false }).fill(title);
  if (priority) await d.getByLabel("Priority", { exact: false }).selectOption(priority);
  if (targetDate) await d.getByLabel("Target date", { exact: false }).fill(targetDate);
  await d.getByRole("button", { name: "Create goal" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

async function createProject(page, { name, goal }) {
  await page.getByRole("button", { name: /New project/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Name", { exact: false }).fill(name);
  if (goal !== undefined) await d.getByLabel("Goal", { exact: false }).selectOption(goal);
  await d.getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

async function readTotalXp(page) {
  const text = await page.locator("text=/XP earned all time/").first().innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = wire(await ctxA.newPage());

  // ===================== SETUP =====================
  section("Account & navigation");
  await signUp(page, USER_A);
  check("sign up reaches the dashboard", page.url() === `${BASE}/app`);

  await page.goto(`${BASE}/app/goals`, { waitUntil: "networkidle" });
  check("goals route is real, not a placeholder", !(await page.locator("text=is not built yet").count()));
  check("empty state invites a first goal", (await page.locator("text=No goals yet.").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/g01-goals-empty.png`, fullPage: true });

  // ===================== CREATE GOAL =====================
  section("Goal creation & validation");
  await page.getByRole("button", { name: /New goal/ }).first().click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByRole("button", { name: "Create goal" }).click();
  await page.waitForTimeout(1200);
  check("goal title is required", (await page.locator("text=A goal needs a title.").count()) > 0);

  await dlg(page).getByLabel("Goal", { exact: false }).fill("Get into a top university");
  await dlg(page).getByLabel("Start date", { exact: false }).fill(day(10));
  await dlg(page).getByLabel("Target date", { exact: false }).fill(day(2));
  await dlg(page).getByRole("button", { name: "Create goal" }).click();
  await page.waitForTimeout(1200);
  check("target before start is rejected", (await page.locator("text=/cannot be before the start date/i").count()) > 0);
  check("typed title survives the validation error",
    (await dlg(page).getByLabel("Goal", { exact: false }).inputValue()) === "Get into a top university");

  await dlg(page).getByLabel("Start date", { exact: false }).fill(day(0));
  await dlg(page).getByLabel("Target date", { exact: false }).fill(day(28));
  await dlg(page).getByLabel("Priority", { exact: false }).selectOption("URGENT");
  await dlg(page).getByRole("button", { name: "Create goal" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check("goal is created", (await page.locator("text=Get into a top university").count()) > 0);
  check("goal card states days remaining", (await page.locator("text=/28 days remaining/").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/g02-goal-created.png`, fullPage: true });

  // ===================== OPEN DETAIL =====================
  section("Goal detail");
  await page.getByRole("link", { name: /Open Get into a top university/ }).click();
  await page.waitForURL(/\/app\/goals\/[^/]+$/, { timeout: 20000 });
  const goalUrl = page.url();
  const goalId = goalUrl.split("/").pop();
  check("navigates to the goal detail page", Boolean(goalId));

  await page.locator('h1:text("Get into a top university")').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  check("shows an empty-projects state", (await page.locator("text=This goal has no projects yet.").count()) > 0);
  check("empty goal shows no misleading percentage",
    (await page.locator("main#main").innerText()).includes("no projects connected"));

  // ===================== CREATE PROJECT FROM GOAL =====================
  section("Creating a project from the goal");
  await page.getByRole("button", { name: /New project/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const preGoal = await dlg(page).getByLabel("Goal", { exact: false }).inputValue();
  check("goal is pre-selected from context", preGoal === goalId, preGoal.slice(0, 8));

  await dlg(page).getByLabel("Name", { exact: false }).fill("SAT Preparation");
  await dlg(page).getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  check("project appears under the goal", (await page.locator("text=SAT Preparation").count()) > 0);
  check("goal now reports no task activity",
    (await page.locator("main#main").innerText()).includes("No task activity yet"));

  // ===================== MILESTONE + TASK =====================
  section("Milestone, task, and progress flowing upward");
  await page.getByRole("link", { name: /Open SAT Preparation/ }).click();
  await page.waitForURL(/\/app\/projects\//, { timeout: 20000 });
  const projectUrl = page.url();
  await page.locator('h1:text("SAT Preparation")').waitFor({ timeout: 20000 });

  check("project header links back to its goal",
    (await page.locator('a[href^="/app/goals/"]').count()) > 0);

  await page.getByRole("button", { name: /^Milestone$/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Title", { exact: false }).fill("Math");
  await dlg(page).getByRole("button", { name: "Add milestone" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  check("milestone is created", (await page.locator("text=Math").count()) > 0);

  await page.locator('button:has-text("Add task")').first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Title", { exact: false }).fill("Complete practice set");
  await dlg(page).getByLabel("Priority", { exact: false }).selectOption("HIGH");
  await dlg(page).getByRole("button", { name: "Create task" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  check("task created inside the milestone", (await page.locator("text=Complete practice set").count()) > 0);

  await page.goto(goalUrl, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  check("goal progress now counts the task",
    (await page.locator("main#main").innerText()).includes("0 of 1 tasks complete"));

  // ===================== COMPLETE TASK =====================
  section("Task completion updates XP and goal progress");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  const xpBefore = await readTotalXp(page);

  await page.goto(projectUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Mark .Complete practice set. as done/ }).first().click();
  await page.waitForTimeout(3000);

  await page.goto(goalUrl, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  const afterComplete = await page.locator("main#main").innerText();
  check("goal progress becomes 100%", afterComplete.includes("1 of 1 tasks complete"));
  check("goal offers completion once all work is done", afterComplete.includes("All connected work is complete"));
  check("goal did NOT auto-complete", afterComplete.includes("Active"));

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  const xpAfter = await readTotalXp(page);
  check("completing a goal-linked task awards XP", xpAfter - xpBefore === 40, `${xpBefore} -> ${xpAfter}`);
  await page.screenshot({ path: `${SHOTS}/g03-dashboard.png`, fullPage: true });

  // ===================== DASHBOARD =====================
  section("Dashboard");
  const dash = await page.locator("main#main").innerText();
  check("dashboard shows an active goals panel", dash.toLowerCase().includes("goals"));
  check("dashboard lists the goal", dash.includes("Get into a top university"));
  check("dashboard still shows projects", dash.includes("SAT Preparation"));
  check("dashboard still shows today's tasks", dash.includes("TODAY"));
  check("dashboard still shows streak, level and XP",
    dash.includes("STREAK") && dash.includes("LEVEL"));

  // ===================== ASSIGN / REMOVE / REASSIGN =====================
  section("Connecting, removing and reassigning projects");
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await createProject(page, { name: "Engineering Portfolio", goal: "" });
  check("second project created with no goal", (await page.locator("text=Engineering Portfolio").count()) > 0);

  await page.goto(goalUrl, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /Connect existing/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await dlg(page).getByLabel("Project", { exact: false }).selectOption({ label: "Engineering Portfolio" });
  await dlg(page).getByRole("button", { name: "Connect project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  check("existing project connected to the goal", (await page.locator("text=Engineering Portfolio").count()) > 0);

  await page.getByRole("button", { name: /Remove Engineering Portfolio from this goal/ }).click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  check("project removed from the goal", (await page.locator("text=Engineering Portfolio").count()) === 0);

  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  check("removed project still exists", (await page.locator("text=Engineering Portfolio").count()) > 0);

  // Reassign via the project form's goal selector.
  await page.getByRole("button", { name: /Actions for Engineering Portfolio/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByLabel("Goal", { exact: false }).selectOption({ label: "Get into a top university" });
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.goto(goalUrl, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  check("project reassigned through the project form", (await page.locator("text=Engineering Portfolio").count()) > 0);

  // ===================== PROJECT LIST GOAL FILTER =====================
  section("Project list goal filter");
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await page.selectOption("#filter-goal", { label: "Get into a top university" });
  await page.waitForTimeout(1600);
  check("goal filter narrows the project list", (await page.locator("text=SAT Preparation").count()) > 0);

  await page.selectOption("#filter-goal", "none");
  await page.waitForTimeout(1600);
  check("'No goal' filter excludes connected projects",
    (await page.locator("text=SAT Preparation").count()) === 0);
  await page.screenshot({ path: `${SHOTS}/g04-project-goal-filter.png`, fullPage: true });

  // ===================== EDIT / ACHIEVE / REOPEN =====================
  section("Edit, achieve and reopen");
  await page.goto(goalUrl, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /^Edit$/ }).first().click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByLabel("Goal", { exact: false }).fill("Get into a top university (2027)");
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  check("goal edit persists", (await page.locator("text=Get into a top university (2027)").count()) > 0);

  await page.getByRole("button", { name: /^Achieved$/ }).first().click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  check("goal shows as achieved", (await page.locator("main#main").innerText()).includes("Achieved"));

  await page.getByRole("button", { name: /^Reopen$/ }).first().click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  check("goal reopens to active", (await page.locator("main#main").innerText()).includes("Active"));

  // ===================== ARCHIVE / RESTORE =====================
  section("Archive and restore");
  await page.goto(`${BASE}/app/goals`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for Get into a top university/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  check("archived goal leaves the Active list", (await page.locator("text=Get into a top university").count()) === 0);

  await page.goto(`${BASE}/app/goals?status=ARCHIVED`, { waitUntil: "networkidle" });
  check("archived goal appears under Archived", (await page.locator("text=Get into a top university").count()) > 0);

  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  check("archiving a goal left its projects active", (await page.locator("text=SAT Preparation").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/g05-archived.png`, fullPage: true });

  await page.goto(`${BASE}/app/goals?status=ARCHIVED`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for Get into a top university/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await page.waitForTimeout(2600);
  await page.goto(`${BASE}/app/goals`, { waitUntil: "networkidle" });
  check("restored goal returns to Active", (await page.locator("text=Get into a top university").count()) > 0);

  // ===================== FILTERS & SEARCH =====================
  section("Filters and search");
  await page.goto(`${BASE}/app/goals?q=university`, { waitUntil: "networkidle" });
  check("search finds the goal", (await page.locator("text=Get into a top university").count()) > 0);

  await page.goto(`${BASE}/app/goals?q=zzzznothing`, { waitUntil: "networkidle" });
  check("no-match search shows a filtered empty state",
    (await page.locator("text=No goals match these filters").count()) > 0);

  await page.goto(`${BASE}/app/goals?status=ALL&sort=name`, { waitUntil: "networkidle" });
  check("sort and status params are accepted", (await page.locator("text=Get into a top university").count()) > 0);

  // ===================== CROSS-USER ISOLATION =====================
  section("Cross-user isolation");
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);

  await pageB.goto(`${BASE}/app/goals?status=ALL`, { waitUntil: "networkidle" });
  check("second account sees none of the first's goals",
    (await pageB.locator("text=Get into a top university").count()) === 0);

  await pageB.goto(goalUrl, { waitUntil: "networkidle" });
  const bBody = await pageB.locator("body").innerText();
  check("direct URL to another user's goal is not found", bBody.includes("Goal not found"));
  check("the 404 leaks no goal details", !bBody.includes("Get into a top university"));
  await pageB.screenshot({ path: `${SHOTS}/g06-cross-user-404.png`, fullPage: true });
  await ctxB.close();

  // ===================== DELETE GOAL =====================
  section("Delete goal keeps projects");
  await page.goto(goalUrl, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  await page.locator("main#main").getByRole("button", { name: "Delete goal" }).click();
  await page.waitForSelector("dialog[open]");
  const confirmText = (await dlg(page).innerText()).replace(/\n/g, " ");
  check("delete dialog states that projects are kept", /projects under this goal are\s+not\s+deleted/i.test(confirmText));
  await dlg(page).getByRole("button", { name: "Delete goal" }).click();
  await page.waitForURL(`${BASE}/app/goals`, { timeout: 20000 });
  check("deleting from the detail page returns to the list", page.url() === `${BASE}/app/goals`);

  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  check("projects survived their goal's deletion", (await page.locator("text=SAT Preparation").count()) > 0);

  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  check("tasks survived too", (await page.locator("text=Complete practice set").count()) > 0);

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  check("XP survived the goal deletion", (await readTotalXp(page)) === xpAfter, `expect ${xpAfter}`);

  // ===================== RESPONSIVE =====================
  section("Responsive");
  const mobile = wire(await ctxA.newPage());
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/app/goals`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(800);
  check("no horizontal overflow on mobile goals", !(await mobile.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await mobile.screenshot({ path: `${SHOTS}/g07-mobile-goals.png`, fullPage: true });

  await createGoal(mobile, { title: "Mobile check", priority: "LOW", targetDate: day(14) });
  await mobile.getByRole("link", { name: /Open Mobile check/ }).click();
  await mobile.waitForURL(/\/app\/goals\//, { timeout: 20000 });
  await mobile.locator("h1").first().waitFor({ timeout: 20000 });
  await mobile.waitForTimeout(1000);
  check("no horizontal overflow on mobile goal detail", !(await mobile.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await mobile.screenshot({ path: `${SHOTS}/g08-mobile-detail.png`, fullPage: true });

  await mobile.setViewportSize({ width: 768, height: 1024 });
  await mobile.reload({ waitUntil: "networkidle" });
  await mobile.waitForTimeout(900);
  check("no horizontal overflow at tablet width", !(await mobile.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  check("mobile bottom navigation still present",
    await mobile.locator("nav[aria-label='Main']").last().isVisible());
  await mobile.close();

  // ===================== ACCESSIBILITY =====================
  section("Accessibility");
  await page.goto(`${BASE}/app/goals`, { waitUntil: "networkidle" });
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    unlabelled: Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    progressbars: document.querySelectorAll('[role="progressbar"][aria-valuenow]').length,
    currentPage: document.querySelectorAll('[aria-current="page"]').length,
    badUl: Array.from(document.querySelectorAll("ul, ol")).filter((list) =>
      Array.from(list.children).some((c) => c.tagName !== "LI" && c.tagName !== "TEMPLATE")).length,
  }));
  check("single h1 on the goals page", a11y.h1 === 1, `h1=${a11y.h1}`);
  check("no unlabelled icon-only buttons", a11y.unlabelled === 0, `count=${a11y.unlabelled}`);
  check("progress bars expose values", a11y.progressbars >= 1, `count=${a11y.progressbars}`);
  check("goals nav marked as current", a11y.currentPage >= 1);
  check("lists contain only list items", a11y.badUl === 0, `bad=${a11y.badUl}`);

  await page.keyboard.press("g");
  await page.waitForTimeout(900);
  check("G opens the new-goal dialog", (await page.locator("dialog[open]").count()) > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  check("Escape closes it", (await page.locator("dialog[open]").count()) === 0);

  await page.keyboard.press("n");
  await page.waitForTimeout(900);
  const taskDialog = await dlg(page).innerText().catch(() => "");
  check("N still opens the task dialog directly", taskDialog.includes("New task"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

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
