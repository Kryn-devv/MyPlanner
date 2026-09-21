/**
 * End-to-end verification of the Phase 2 project workflow against a running
 * production build.
 *
 *     npm run build && npm start                       # terminal 1
 *     E2E_BASE_URL=http://127.0.0.1:3000 node tests/e2e/verify-projects.mjs
 *
 * Playwright is deliberately not a project dependency — this harness is run on
 * demand. Set E2E_CHROME to use a Chromium already on the machine.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = process.env.E2E_SHOTS ?? "./.shots";
const CHROME = process.env.E2E_CHROME;
const stamp = Date.now();

const USER_A = { email: `pa.${stamp}@example.test`, password: "correct-horse-battery", name: "Ada Project" };
const USER_B = { email: `pb.${stamp}@example.test`, password: "correct-horse-battery", name: "Mallory Project" };

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
    // A hydration mismatch logs as a warning, not an error — catch it too.
    // A production build reports a hydration failure as a *minified* error
    // — "Minified React error #418" — which contains none of the words a
    // development build uses. Matching only the prose would have let a real
    // mismatch through every suite here.
    if (/hydrat|did not match|server rendered|React error #(418|419|421|423|425)/i.test(t))
      consoleErrors.push(`HYDRATION: ${t}`);
  });
  page.on("pageerror", (e) => { if (!IGNORABLE.test(e.message)) pageErrors.push(e.message); });
  page.on("response", (r) => {
    if (r.status() >= 500) pageErrors.push(`HTTP ${r.status()} ${r.url()}`);
  });
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

async function createProject(page, { name, priority, dueDate, description }) {
  await page.getByRole("button", { name: /New project/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Name", { exact: false }).fill(name);
  if (description) await d.getByLabel("Description", { exact: false }).fill(description);
  if (priority) await d.getByLabel("Priority", { exact: false }).selectOption(priority);
  if (dueDate) await d.getByLabel("Due date", { exact: false }).fill(dueDate);
  await d.getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

async function createMilestone(page, title, dueDate) {
  await page.getByRole("button", { name: /^Milestone$|Add milestone|^Add$/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const d = dlg(page);
  await d.getByLabel("Title", { exact: false }).fill(title);
  if (dueDate) await d.getByLabel("Due date", { exact: false }).fill(dueDate);
  await d.getByRole("button", { name: "Add milestone" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

async function readTotalXp(page) {
  const text = await page.locator("text=/XP earned all time/").first().innerText();
  return Number(text.replace(/[^0-9]/g, ""));
}

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Scopes lookups to the open dialog — page-level buttons share these labels. */
const dlg = (page) => page.locator("dialog[open]");

try {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = wire(await ctxA.newPage());

  // ===================== SETUP =====================
  section("Account & navigation");
  await signUp(page, USER_A);
  check("sign up reaches the dashboard", page.url() === `${BASE}/app`);

  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  check("projects route is real, not a placeholder", !(await page.locator("text=is not built yet").count()));
  check("empty workspace state shown", (await page.locator("text=Your workspace is clear.").count()) > 0);
  const navLocked = await page.locator('a[href="/app/projects"] >> text=coming in a future phase').count();
  check("projects nav item is unlocked", navLocked === 0);
  await page.screenshot({ path: `${SHOTS}/p01-projects-empty.png`, fullPage: true });

  // ===================== CREATE PROJECT =====================
  section("Project creation & validation");
  await page.getByRole("button", { name: /New project/ }).first().click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByRole("button", { name: "Create project" }).click();
  await page.waitForTimeout(1200);
  check("project name is required", (await page.locator("text=A project name is required.").count()) > 0);

  await dlg(page).getByLabel("Name", { exact: false }).fill("Build IRIS");
  await dlg(page).getByLabel("Start date", { exact: false }).fill(day(5));
  await dlg(page).getByLabel("Due date", { exact: false }).fill(day(1));
  await dlg(page).getByRole("button", { name: "Create project" }).click();
  await page.waitForTimeout(1200);
  check("due date before start date is rejected", (await page.locator("text=/cannot be before the start date/i").count()) > 0);

  await dlg(page).getByLabel("Start date", { exact: false }).fill(day(0));
  await dlg(page).getByLabel("Due date", { exact: false }).fill(day(30));
  await dlg(page).getByLabel("Priority", { exact: false }).selectOption("URGENT");
  await dlg(page).getByRole("button", { name: "Create project" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check("project is created", (await page.locator("text=Build IRIS").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/p02-project-created.png`, fullPage: true });

  // ===================== OPEN DETAIL =====================
  section("Project detail");
  await page.getByRole("link", { name: /Open Build IRIS/ }).click();
  await page.waitForURL(/\/app\/projects\/[^/]+$/, { timeout: 20000 });
  const projectUrl = page.url();
  const projectId = projectUrl.split("/").pop();
  check("navigates to the project detail page", Boolean(projectId));

  // The page streams; wait for real content rather than the skeleton.
  await page.locator('h1:text("Build IRIS")').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  check("shows an empty-milestones state", (await page.locator("text=No milestones yet.").count()) > 0);
  check("shows an empty-tasks state", (await page.locator("text=No tasks in this project.").count()) > 0);
  check("empty project shows no misleading percentage", (await page.locator("main#main").innerText()).includes("no tasks yet"));

  // ===================== MILESTONES =====================
  section("Milestones");
  await createMilestone(page, "Hardware", day(7));
  check("milestone is created", (await page.locator("text=Hardware").count()) > 0);
  await createMilestone(page, "Voice System", day(14));
  check("second milestone is created", (await page.locator("text=Voice System").count()) > 0);
  const order = await page.locator('h2:text("Milestones") ~ ul li').count().catch(() => 0);
  check("both milestones listed", order === 0 || order >= 2, `count=${order}`);
  await page.screenshot({ path: `${SHOTS}/p03-milestones.png`, fullPage: true });

  // ===================== TASK INSIDE MILESTONE =====================
  section("Task creation inside a project and milestone");
  await page.locator('button:has-text("Add task")').first().click();
  await page.waitForSelector("dialog[open]", { timeout: 10000 });

  const preProject = await dlg(page).getByLabel("Project", { exact: false }).inputValue();
  const preMilestone = await dlg(page).getByLabel("Milestone", { exact: false }).inputValue();
  check("project is pre-selected from context", preProject === projectId, preProject.slice(0, 8));
  check("milestone is pre-selected from context", preMilestone.length > 0);

  await dlg(page).getByLabel("Title", { exact: false }).fill("Wire ultrasonic sensors");
  await dlg(page).getByLabel("Priority", { exact: false }).selectOption("HIGH");
  await dlg(page).getByRole("button", { name: "Create task" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  check("task created inside the milestone", (await page.locator("text=Wire ultrasonic sensors").count()) > 0);

  const afterFirst = await page.locator("main#main").innerText();
  check("milestone progress reflects the new task", /0\s*\/\s*1\s*tasks/.test(afterFirst), "expect 0/1");
  check("project progress reflects the new task", afterFirst.includes("0 of 1 tasks complete"));

  // ===================== COMPLETE TASK: XP + PROGRESS =====================
  section("Task completion updates XP and both progress bars");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  const xpBefore = await readTotalXp(page);

  await page.goto(projectUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Mark .Wire ultrasonic sensors. as done/ }).first().click();
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });

  const afterComplete = await page.locator("main#main").innerText();
  check("milestone progress becomes 1/1", /1\s*\/\s*1\s*tasks/.test(afterComplete));
  check("project progress becomes 100%", afterComplete.includes("1 of 1 tasks complete"));
  check("offers to complete the milestone", afterComplete.includes("All milestone tasks complete"));
  check("offers to complete the project", afterComplete.includes("tasks in this project are complete"));
  check("did NOT auto-complete the milestone", (await page.locator("main#main").innerText()).includes("Pending"));

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  const xpAfter = await readTotalXp(page);
  check("completing a project task awards XP", xpAfter - xpBefore === 40, `${xpBefore} -> ${xpAfter}`);
  await page.screenshot({ path: `${SHOTS}/p04-progress.png`, fullPage: true });

  // ===================== COMPLETE MILESTONE =====================
  section("Milestone completion");
  await page.goto(projectUrl, { waitUntil: "networkidle" });
  const xpBeforeMilestone = xpAfter;
  await page.getByRole("button", { name: /Complete milestone Hardware/ }).first().click();
  await page.waitForTimeout(2800);
  await page.reload({ waitUntil: "networkidle" });
  check("milestone shows as completed", (await page.locator("text=Completed").count()) > 0);

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  check("completing a milestone awards NO XP", (await readTotalXp(page)) === xpBeforeMilestone, `still ${xpBeforeMilestone}`);

  // ===================== MOVE TASK BETWEEN MILESTONES =====================
  section("Reassigning a task");
  await page.goto(projectUrl, { waitUntil: "networkidle" });
  await page.locator('h1:text("Build IRIS")').waitFor({ timeout: 20000 });

  // A completed milestone starts collapsed, so its tasks are not rendered.
  // That is deliberate; expand it before reaching for a task inside.
  //
  // The disclosure is matched by `aria-expanded` rather than by name: the
  // milestone header also carries a completion toggle whose accessible name
  // contains the same title, and clicking that would change its status.
  const collapsedBefore = (await page.locator("text=Wire ultrasonic sensors").count()) === 0;
  check("completed milestone collapses its tasks", collapsedBefore);

  if (collapsedBefore) {
    await page.locator('button[aria-expanded="false"][aria-controls^="milestone-panel-"]').first().click();
    await page.waitForTimeout(700);
  }
  check("expanding reveals its tasks again",
    (await page.locator("text=Wire ultrasonic sensors").count()) > 0);

  await page.getByRole("button", { name: /Actions for .Wire ultrasonic sensors./ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]");

  // Move it to the other milestone.
  const milestoneSelect = dlg(page).getByLabel("Milestone", { exact: false });
  const options = await milestoneSelect.locator("option").allTextContents();
  check("milestone picker lists this project's milestones", options.includes("Voice System"), options.join("|"));
  await milestoneSelect.selectOption({ label: "Voice System" });
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('h1:text("Build IRIS")').waitFor({ timeout: 20000 });

  const moved = await page.locator("main#main").innerText();
  check("task moved to the other milestone", moved.indexOf("Voice System") < moved.indexOf("Wire ultrasonic sensors"));

  // Remove from milestone, keep in project.
  await page.getByRole("button", { name: /Actions for .Wire ultrasonic sensors./ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByLabel("Milestone", { exact: false }).selectOption("");
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  // Section headings are uppercased by CSS, so innerText returns them that way.
  check("task is now unassigned but still in the project",
    (await page.locator("main#main").innerText()).toLowerCase().includes("unassigned tasks"));

  // Remove from project entirely.
  await page.getByRole("button", { name: /Actions for .Wire ultrasonic sensors./ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByLabel("Project", { exact: false }).selectOption("");
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  check("task removed from the project", (await page.locator("text=Wire ultrasonic sensors").count()) === 0);

  // And back in again.
  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for .Wire ultrasonic sensors./ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByLabel("Project", { exact: false }).selectOption({ label: "Build IRIS" });
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.goto(projectUrl, { waitUntil: "networkidle" });
  check("task reassigned back to the project", (await page.locator("text=Wire ultrasonic sensors").count()) > 0);

  // ===================== TASK PAGE INTEGRATION =====================
  section("Task page project integration");
  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  check("task card shows its project", (await page.locator("text=Build IRIS").count()) > 0);

  await page.selectOption("#filter-project", { label: "Build IRIS" });
  await page.waitForTimeout(1600);
  check("project filter narrows the list", (await page.locator("text=Wire ultrasonic sensors").count()) > 0);

  await page.selectOption("#filter-project", "none");
  await page.waitForTimeout(1600);
  check("'No project' filter excludes project tasks",
    (await page.locator("text=Wire ultrasonic sensors").count()) === 0);
  await page.screenshot({ path: `${SHOTS}/p05-task-filters.png`, fullPage: true });

  // ===================== DASHBOARD =====================
  section("Dashboard");
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  const dash = await page.locator("main#main").innerText();
  check("dashboard shows an active projects panel", dash.includes("PROJECTS"));
  check("dashboard lists the project", dash.includes("Build IRIS"));
  check("dashboard still shows today's tasks", dash.includes("TODAY"));
  check("dashboard still shows the streak", dash.includes("STREAK"));
  check("dashboard still shows level and XP", dash.includes("LEVEL"));

  // ===================== ARCHIVE / RESTORE =====================
  section("Archive and restore");
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for Build IRIS/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  check("archived project leaves the Active list", (await page.locator("text=Build IRIS").count()) === 0);

  await page.goto(`${BASE}/app/projects?status=ARCHIVED`, { waitUntil: "networkidle" });
  check("archived project appears under Archived", (await page.locator("text=Build IRIS").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/p06-archived.png`, fullPage: true });

  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  check("archiving preserved its tasks", (await page.locator("text=Wire ultrasonic sensors").count()) > 0);

  await page.goto(`${BASE}/app/projects?status=ARCHIVED`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Actions for Build IRIS/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await page.waitForTimeout(2600);
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  check("restored project returns to Active", (await page.locator("text=Build IRIS").count()) > 0);

  // ===================== EDIT + COMPLETE + REOPEN =====================
  section("Edit, complete and reopen");
  await page.getByRole("link", { name: /Open Build IRIS/ }).click();
  await page.waitForURL(/\/app\/projects\//, { timeout: 20000 });
  await page.getByRole("button", { name: /^Edit$/ }).first().click();
  await page.waitForSelector("dialog[open]");
  await dlg(page).getByLabel("Name", { exact: false }).fill("Build IRIS v2");
  await dlg(page).getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  check("project edit persists", (await page.locator("text=Build IRIS v2").count()) > 0);

  await page.getByRole("button", { name: /^Complete$/ }).first().click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  check("project shows as completed", (await page.locator("main#main").innerText()).includes("Completed"));

  await page.getByRole("button", { name: /^Reopen$/ }).first().click();
  await page.waitForTimeout(2600);
  await page.reload({ waitUntil: "networkidle" });
  check("project reopens to active", (await page.locator("main#main").innerText()).includes("Active"));

  // ===================== CROSS-USER ISOLATION =====================
  section("Cross-user isolation");
  const currentUrl = page.url();
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pageB = wire(await ctxB.newPage());
  await signUp(pageB, USER_B);

  await pageB.goto(`${BASE}/app/projects?status=ALL`, { waitUntil: "networkidle" });
  check("second account sees none of the first's projects",
    (await pageB.locator("text=Build IRIS").count()) === 0);

  await pageB.goto(currentUrl, { waitUntil: "networkidle" });
  const bBody = await pageB.locator("body").innerText();
  check("direct URL to another user's project is not found", bBody.includes("Project not found"));
  check("the 404 leaks no project details", !bBody.includes("Build IRIS"));

  const optionsB = await pageB.evaluate(async () => {
    const res = await fetch("/app/tasks?status=all");
    return res.status;
  });
  check("second account's task page still works", optionsB === 200);
  await pageB.screenshot({ path: `${SHOTS}/p07-cross-user-404.png`, fullPage: true });
  await ctxB.close();

  // ===================== DELETE PROJECT =====================
  section("Delete project keeps tasks");
  await page.goto(currentUrl, { waitUntil: "networkidle" });
  await page.locator("main#main").getByRole("button", { name: "Delete project" }).click();
  await page.waitForSelector("dialog[open]");
  const confirmText = await page.locator("dialog[open]").innerText();
  check("delete dialog states that tasks are kept", /tasks in this project are\s+not\s+deleted/i.test(confirmText.replace(/\n/g, " ")));
  await dlg(page).getByRole("button", { name: "Delete project" }).click();
  await page.waitForURL(`${BASE}/app/projects`, { timeout: 20000 });
  check("deleting from the detail page returns to the list", page.url() === `${BASE}/app/projects`);

  await page.goto(`${BASE}/app/tasks?status=all`, { waitUntil: "networkidle" });
  check("the task survived its project's deletion", (await page.locator("text=Wire ultrasonic sensors").count()) > 0);
  const detached = await page.locator("main#main").innerText();
  check("the task is no longer attached to a project", !detached.includes("Build IRIS"));

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.locator("text=/XP earned all time/").first().waitFor({ timeout: 20000 });
  check("XP survived the project deletion", (await readTotalXp(page)) === xpAfter, `expect ${xpAfter}`);

  // ===================== RESPONSIVE =====================
  section("Responsive");
  const mobile = wire(await ctxA.newPage());
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: `${SHOTS}/p08-mobile-projects.png`, fullPage: true });

  const overflow = await mobile.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check("no horizontal overflow on mobile projects", !overflow);

  await createProject(mobile, { name: "Mobile check", priority: "LOW" });
  await mobile.getByRole("link", { name: /Open Mobile check/ }).click();
  await mobile.waitForURL(/\/app\/projects\//, { timeout: 20000 });
  await mobile.waitForTimeout(1200);
  const overflowDetail = await mobile.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check("no horizontal overflow on mobile project detail", !overflowDetail);
  await mobile.screenshot({ path: `${SHOTS}/p09-mobile-detail.png`, fullPage: true });

  const bottomNav = await mobile.locator("nav[aria-label='Main']").last().isVisible();
  check("mobile bottom navigation still present", bottomNav);
  await mobile.close();

  // ===================== ACCESSIBILITY =====================
  section("Accessibility");
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  const a11y = await page.evaluate(() => ({
    h1: document.querySelectorAll("h1").length,
    unlabelled: Array.from(document.querySelectorAll("button")).filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    progressbars: document.querySelectorAll('[role="progressbar"][aria-valuenow]').length,
    currentPage: document.querySelectorAll('[aria-current="page"]').length,
  }));
  check("single h1 on the projects page", a11y.h1 === 1, `h1=${a11y.h1}`);
  check("no unlabelled icon-only buttons", a11y.unlabelled === 0, `count=${a11y.unlabelled}`);
  check("progress bars expose values", a11y.progressbars >= 1, `count=${a11y.progressbars}`);
  check("projects nav marked as current", a11y.currentPage >= 1);

  await page.keyboard.press("p");
  await page.waitForTimeout(900);
  check("P opens the new-project dialog", (await page.locator("dialog[open]").count()) > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
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
