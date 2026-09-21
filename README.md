# NOVA — Phases 1–4.2

> **NOVA** is an internal working name. The brand is not hard-coded anywhere in
> the source: set `NEXT_PUBLIC_APP_NAME` and it updates across the UI and
> metadata. See `src/config/app.ts`.

A personal productivity workspace built around a hierarchy:

```
GOAL  →  PROJECT  →  MILESTONE  →  TASK
```

Each level answers a different question. A **goal** is where you are trying to
get. A **project** is what you are building. A **milestone** is a checkpoint
along the way. A **task** is the thing you actually do — and the only thing
that earns XP.

Tasks carry priorities, categories, deadlines and estimates, and feed an
XP/level/streak progression system. Every level above them is optional: a task
needs no project, and a project needs no goal.

Two views sit above all four, and neither is a fifth level — both read dates
that already live on the records, and store nothing of their own:

- **Calendar** (`/app/calendar`) answers *when?* — a month, week, day or
  timeline over tasks, milestones, projects and goals.
- **Today** (`/app/today`) answers *what should I actually do now?* — one day's
  work, what is outstanding from earlier, and how much of it is left.

**Shipped:** authentication, tasks, projects, milestones, goals, progression,
calendar, timeline and the Today planner.
**Not yet:** habits, focus sessions, meetings, notes, analytics, AI planning.
Those exist as navigation placeholders, and the data model is shaped so they
can be added without rewriting what is here — Phases 2 and 3 proved that out by
adding constraints to columns an earlier phase had left in place, and Phases
4.1 and 4.2 proved it again by shipping two whole surfaces with **no schema
change at all**.

---

## Requirements

| | |
|---|---|
| Node.js | 22.18+ (uses native `.ts` execution and `process.loadEnvFile`) |
| PostgreSQL | 14+ |

## Getting started

```bash
# 1. Install dependencies (runs `prisma generate` automatically)
npm install

# 2. Configure the environment
cp .env.example .env
#    Then edit .env:
#      - point DATABASE_URL and TEST_DATABASE_URL at your PostgreSQL
#      - set AUTH_SECRET to a random 32+ character string:
#        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Create the schema
npm run db:migrate

# 4. (optional) Load demo data
npm run db:seed          # signs in as demo@nova.test / demo-password
npm run db:unseed        # removes it again, touching nothing else

# 5. Run it
npm run dev              # http://localhost:3000
```

Creating an account through the sign-up form gives you a clean workspace with a
starter set of categories.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (generates the Prisma client first) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` (strict; also run by `build`) |
| `npm test` | Full test suite (unit + integration) |
| `npm run test:unit` | Pure logic only — no database needed |
| `npm run test:integration` | Against `TEST_DATABASE_URL` |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` / `db:unseed` | Add / remove demo data |

## Testing

```bash
npm test
```

Unit tests cover the level curve, streak transitions, timezone handling, XP
resolution and input validation. Integration tests run against a **real**
PostgreSQL database — the guarantees this app makes (no duplicate XP under
concurrency, no cross-user access, transactional consistency between the XP
ledger and its cached rollup) are enforced by database constraints and
transactions, and a mocked client would verify none of them.

`TEST_DATABASE_URL` is reset on every run, so never point it at a database
holding real data.

Five on-demand browser harnesses cover the signed-in flows end to end against
a production build — `tests/e2e/verify.mjs` (tasks, XP, streaks, auth),
`tests/e2e/verify-projects.mjs` (projects, milestones, assignment),
`tests/e2e/verify-goals.mjs` (goals, project connection, progress),
`tests/e2e/verify-calendar.mjs` (the four calendar views, URL state, filters,
and that moving a date moves the item) and `tests/e2e/verify-today.mjs` (the
day's sections, overdue semantics, day navigation, workload and completion
through the existing XP path). None is part of `npm test`, and Playwright is
not a project dependency; see the header of any of them to run it.

## Architecture

```
src/
  app/                      routes (App Router)
    (auth)/                 login, signup — redirects away if already signed in
    app/                    protected shell: dashboard, today, tasks,
                            projects, goals, calendar, settings
                            + placeholder routes
  components/
    ui/                     Button, Field, Modal, ProgressBar, Toast, States
    layout/                 Sidebar, Topbar, MobileNav, PageHeader, ComingSoon
    dashboard/              StatCard, panels, daily progress, projects, goals
    tasks/                  TaskCard, TaskList, TaskForm, badges, dialogs
    projects/               ProjectCard, ProjectHeader, MilestoneList, forms
    goals/                  GoalCard, GoalHeader, GoalStats, project section
    calendar/               month/week/day/timeline views, toolbar, filters
    today/                  day navigation, day summary, section headings
    xp/  streaks/  auth/  settings/
  lib/
    auth/                   password (scrypt), sessions, guards, actions
    tasks/                  service (writes), queries (reads), actions
    projects/               service, queries, actions, progress
    goals/                  service, queries, actions, progress
    calendar/               range maths, item ordering, bounded reads (no
                            writes — the calendar owns no data)
    today/                  day classification, ordering, progress, workload
                            (no writes — Today owns no data either)
    validation/             hand-rolled, shared by client and server
    leveling.ts  streak.ts  xp.ts  datetime.ts  prisma.ts
  config/                   app name, priorities, categories, colours,
                            projects, goals, calendar, today, navigation
```

### Decisions worth knowing

**XP cannot be duplicated.** Completion is a compare-and-swap: the `UPDATE`
carries `completed: false` in its `WHERE`, so concurrent requests race in the
database and exactly one wins. A unique index on `(taskId, kind, cycle)` backs
that up. Reopening writes a *reversal* row rather than editing history, and
reverses the amount that was actually granted — not the task's current reward.

**XP is never trusted from the client.** The toggle action takes only a task id
and a boolean; the server reads the reward from the stored row.

**Authorisation is per-query, not middleware.** Every read and write takes
`userId` and folds it into the `WHERE` clause. There is no code path that loads
a task by id alone, so a forged id returns "not found" — identical to a task
that never existed, which also keeps ids unenumerable.

**A calendar day is not a timestamp.** "Today" and `lastCompletedDate` are
`YYYY-MM-DD` strings resolved through the user's configured IANA timezone.
Streaks only ever change when a task is completed — opening the app from
another timezone never mutates them.

**The dashboard is a server component.** All of its data is fetched in one
parallel batch; only the interactive pieces ship JavaScript.

**Deleting a container never destroys its contents.** `Project.goalId`,
`Task.projectId` and `Task.milestoneId` are all `ON DELETE SET NULL`. Delete a
goal and its projects are released, keeping their milestones, tasks and XP.
Delete a project and its milestones go with it, but its tasks survive —
detached, with their XP history intact. Delete a milestone and its tasks stay
in the project. This is expressed in the schema, not in application code, so no
future code path can forget it.

**A task's goal is its project's goal — there is no `Task.goalId`.** Phase 1
left one as a forward reference and Phase 3 deliberately dropped it rather than
wiring it up. Two paths to the same fact could disagree, with nothing able to
adjudicate: a task claiming one goal while its project served another would
make goal progress undefinable. One hierarchy, one path.

**A milestone belongs to a project, and a task may not mix the two up.** A task
can have a project without a milestone, but never a milestone without a
project, and never a milestone from a *different* project. That last case is
the one a naive check misses — verifying "you own the project" and "you own the
milestone" separately still admits an unrelated pair. The check is one query
keyed on both ids, run inside the write transaction.

**Milestones have no `userId`.** Ownership reaches them through their project
via a relation filter, which compiles to a subquery and keeps the write atomic.
One owner column cannot then drift out of step with another.

**Progress is derived; status is explicit.** Percentages always come from
counting tasks, via grouped aggregate queries — so a list costs the same
whether you have ten tasks or ten thousand, and a stored percentage can never
go stale. Completion, by contrast, is never inferred: when every task is done
the UI *offers* to complete the milestone, project or goal, and waits.

**Goal progress pools tasks; it does not average projects.** Averaging the
percentages of a 10-task project and a 20-task project treats them as equal
contributors, so finishing something trivial could move a goal further than
finishing something hard:

```
Project A  8/10 tasks        Project B  2/20 tasks
pooled  -> 10/30 = 33%       averaged -> (80% + 10%) / 2 = 45%
```

Pooling counts the work that actually exists, and is the version a person can
check by hand.

**Status never cascades.** Archiving a goal leaves its projects exactly as they
were — shelving an objective is not a decision about the work already under
way, and silently rewriting a week of someone's plans to tidy up an
organisational layer would be indefensible.

**The calendar is a view, not a second source of truth.** There is no
`CalendarEvent` table, and Phase 4.1 added no migration. Every item on the grid
is read live from the column that already owns the date — `Task.dueDate` and
`dueTime`, `Milestone.dueDate`, `Project.startDate`/`dueDate`,
`Goal.startDate`/`targetDate` — and normalised into a `CalendarItem`, an
application-level DTO that exists for the length of one render and is never
written anywhere. A calendar record would mean a due date lived in two places,
and the first time one of them was updated without the other, the calendar
would start lying. Because it holds nothing, it cannot drift: moving a task's
date moves it on the calendar with nothing to keep in sync.

That is also why this phase is read-only. A due date has exactly one place it
can be edited — the record that owns it — so the calendar links to that record
rather than offering a second way to set the same field.

**Every calendar read is bounded and scoped in SQL.** A view asks for an
inclusive day range (42 days at most, for the month grid) and nothing wider;
the range itself is validated before it reaches the database, so a hand-edited
URL cannot ask for a table scan. Ownership is in the `WHERE` clause of all four
queries. Milestones are the interesting case: they carry no `userId` of their
own, so they are filtered through `project: { userId }` — still in SQL, never
by loading rows and discarding them afterwards.

**Today is a query, not a plan.** `/app/today` also added no model and no
migration. A day is the set of tasks whose own `dueDate` is that day, read
live; there is no `DailyPlan`, no `ScheduleEntry`, no copy of a task. Moving
work between days means editing that one column on the task, through the form
that already does it — which is why the page is read-mostly and why it can
never disagree with the task list.

Its semantics turn on keeping **two dates apart**, and this is the part worth
knowing:

| | meaning |
|---|---|
| `today` | the user's real current date, resolved in their timezone |
| `selectedDate` | the day on screen, from `?date=`; defaults to `today` |

- **Overdue** is `dueDate < today && !completed` — measured against the *real*
  current date and nothing else. Browsing to next week therefore never claims
  a future task is late, and reviewing last Tuesday still tells the truth about
  what is outstanding *now* (the page says "as of today" when it is not).
- **The day** is `dueDate == selectedDate`, complete or not — a day's record
  includes what you finished. The day wins over every other bucket, so a task
  appears in exactly one section of the page.
- **Up next** is after the selected day *and* still ahead of now, so the
  preview never offers a day that has already gone.
- **Unscheduled** (no `dueDate`) belongs to no day. It is never overdue — not
  committing to a day is not being late — and never counts towards the day's
  progress or workload.
- **Progress** counts only tasks dated the selected day. Overdue work from
  earlier days is reported beside it, never folded into it, so the bar cannot
  move without the day's plan changing.
- **Workload** sums `estimatedMinutes` and says so. There is no time tracking
  in this app, so nothing on the page is a claim about time actually spent, and
  tasks with no estimate are counted rather than guessed at.

Completion, XP, streaks and editing on Today all run through the components and
actions that already own them — the page hands its tasks to the same `TaskList`
the task page uses. It adds nothing to the write path.

**Calendar dates are computed as strings, never with `Intl`.** The grid is
built from `"YYYY-MM-DD"` arithmetic and the same fixed month and weekday
tables the rest of the app uses, and weeks start on Monday by configuration
rather than by locale. A locale-derived grid renders one way on the server and
another in the browser, which is a hydration mismatch rather than a cosmetic
difference.

## Data model

| Model | Purpose |
|---|---|
| `User` / `Session` | Accounts and opaque server-side sessions |
| `Category` | User-defined task grouping |
| `Goal` | A strategic objective — status, priority, start and target dates |
| `Project` | Work with a beginning and an end; optionally serves a goal |
| `Milestone` | An ordered checkpoint within a project |
| `Task` | The unit of work; optionally filed under a project and milestone |
| `XpTransaction` | Append-only XP ledger |
| `UserStats` | Cached rollup of the ledger, plus streak state |

Migrations live in `prisma/migrations`. Each phase adds tables and constraints
rather than rewriting what came before; the one removal in the set is Phase 3
dropping the unused `Task.goalId` column, which was verified NULL in every row
and referenced by no code before it went.

Phases 4.1 and 4.2 added no model, no column and no migration: the calendar
and the Today planner are built entirely from the date columns above.

Routes: `/app` · `/app/today` · `/app/tasks` · `/app/projects` ·
`/app/projects/[projectId]` · `/app/goals` · `/app/goals/[goalId]` ·
`/app/calendar` · `/app/settings`, plus `/login`, `/signup` and the remaining
placeholder routes.

Today takes one search param, `date` (a `YYYY-MM-DD` day within a year of
today). It is validated by round-trip — `2026-02-31` is rejected rather than
rolling into March — and falls back to today rather than erroring. `/app/today`
with no parameter always means *now*, whenever it is opened, which is what
makes it safe to bookmark.

The calendar's state is entirely in its URL — `view` (`month`, `week`, `day`,
`timeline`), `date` (the anchor day), `kinds` (a comma-separated subset of
`task,milestone,project,goal`) and `show` (`all` or `open`). Every one of them
is validated and falls back to a default, so a link is shareable and a
hand-edited one cannot produce an error page.

## Future readiness

`Task` still carries nullable `habitId`, `meetingId` and `eventId` columns for
the features that do not exist yet. That pattern is what made Phases 2 and 3
cheap: the columns those phases needed were already there, so shipping them
meant adding constraints rather than rewriting tables and every query that
touches them.

A forward reference is a bet, not a promise. Phase 3 called one of them —
`Task.goalId` — and removed it, because the hierarchy it implied would have
been a second source of truth. The remaining three are still genuinely
undecided.

`XpSource` is likewise open for extension, and `src/config/navigation.ts`
drives the sidebar and the placeholder pages from one list — shipping a feature
is a matter of flipping its `phase` and replacing one page body.

## Known limitations

- `npm audit` reports advisories in `mysql2`, which reaches the production
  dependency tree through `@prisma/client` → `prisma`. It is **not** bundled
  into the build output and the app never imports a MySQL adapter — it speaks
  PostgreSQL through `@prisma/adapter-pg` — so the vulnerable code paths (the
  MySQL auth handshake and protocol decompression) are unreachable here.
  `npm audit fix --force` downgrades Prisma 7 to 6, which removes the driver
  adapter architecture this app is built on, so it has deliberately not been
  applied.
- Milestone ordering is stored (`position`) and respected everywhere, but there
  is no drag-to-reorder UI yet; the `reorderMilestones` service and action are
  in place for one.
- The calendar and Today are both read-only with respect to dates: there is no
  drag-to-reschedule, and a date is changed on the task, project or goal that
  owns it.
- Today's progress counts tasks dated the day. The dashboard's own daily figure
  additionally counts anything finished today that was scheduled for another
  day, so the two can differ; Today lists that ad-hoc work in its own section
  and says it does not count towards the day.
- Today's lists are capped — 200 for the day itself, 50 overdue, 5 for each
  preview — and the page shows the true total beside each, and says so when a
  cap bites. The day's progress and workload come from database aggregates
  rather than the loaded rows, so a cap bounds a read without changing a
  figure.
- The calendar shows no all-day *spans*. A project with a start and a due date
  appears as two marks rather than a bar drawn across the weeks between them.
- Goals have no ordering of their own — they sort by target date, name,
  priority or recency, but cannot be arranged by hand.
- The goal detail page summarises task counts but does not list individual
  tasks; those live on the project pages it links to.
- Email is not verifiable or changeable, and there is no password reset or
  login rate limiting.
- Daily statistics are derived rather than snapshotted, so they are always
  consistent but carry no history.
