# NOVA — Phases 1–4.4

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
- **Focus** (`/app/focus`) answers *do it now* — a timed session recorded
  against the task being worked on, which is what finally puts **tracked focus**
  beside **estimated** time.

Beside all of them sits one thing that is not work to finish at all:

- **Habits** (`/app/habits`) answer *what do I want to consistently do?* — a
  schedule and the days you kept it. A habit is never done; a task is. That is
  why a habit is not a recurring task and generates none.

**Shipped:** authentication, tasks, projects, milestones, goals, progression,
calendar, timeline, the Today planner, focus sessions and habits.
**Not yet:** meetings, notes, analytics, AI planning.
Those exist as navigation placeholders, and the data model is shaped so they
can be added without rewriting what is here — Phases 2 and 3 proved that out by
adding constraints to columns an earlier phase had left in place, and Phases
4.1 and 4.2 proved it again by shipping two whole surfaces with **no schema
change at all**. Phase 4.3 is the first to add a table since Phase 3, and it
adds exactly one; Phase 4.4 adds three, all of them additive.

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

Seven on-demand browser harnesses cover the signed-in flows end to end against
a production build — `tests/e2e/verify.mjs` (tasks, XP, streaks, auth),
`tests/e2e/verify-projects.mjs` (projects, milestones, assignment),
`tests/e2e/verify-goals.mjs` (goals, project connection, progress),
`tests/e2e/verify-calendar.mjs` (the four calendar views, URL state, filters,
and that moving a date moves the item) and `tests/e2e/verify-today.mjs` (the
day's sections, overdue semantics, day navigation, workload and completion
through the existing XP path) and `tests/e2e/verify-focus.mjs` (the session
lifecycle, and that a refresh, a navigation and a reopened browser all recover
the same elapsed time) and `tests/e2e/verify-habits.mjs` (creating each kind of
schedule, ticking one occurrence exactly once, pausing, archiving, and that a
day the habit was never due never reads as a failure). None is part of
`npm test`, and Playwright is not a project dependency; see the header of any
of them to run it.

## Architecture

```
src/
  app/                      routes (App Router)
    (auth)/                 login, signup — redirects away if already signed in
    app/                    protected shell: dashboard, today, focus, tasks,
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
    focus/                  timer, focus bar, session view, conflict dialog
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
    focus/                  state machine, duration maths, service, queries
                            (the one place in the app that stores elapsed time)
    validation/             hand-rolled, shared by client and server
    leveling.ts  streak.ts  xp.ts  datetime.ts  prisma.ts
  config/                   app name, priorities, categories, colours,
                            projects, goals, calendar, today, focus, habits,
                            navigation
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

**The cached XP total moves by atomic increments.** Through Phase 4.3 task
completion was the only writer of `UserStats.totalXp`, so it could safely
compute the new value from a read. Phase 4.4 added a second writer, and two
transactions reading the same total and writing absolute values lose one of the
two amounts. Both paths now use `{ increment }`, and only the derived `level`
is written absolutely.

**The dashboard is a server component.** All of its data is fetched in one
parallel batch; only the interactive pieces ship JavaScript.

**Deleting a container never destroys its contents.** `Project.goalId`,
`Task.projectId` and `Task.milestoneId` are all `ON DELETE SET NULL`. Delete a
goal and its projects are released, keeping their milestones, tasks and XP.
Delete a project and its milestones go with it, but its tasks survive —
detached, with their XP history intact. Delete a milestone and its tasks stay
in the project. This is expressed in the schema, not in application code, so no
future code path can forget it.

**A habit is a schedule plus the days it was kept — not a pile of tasks.**
Nothing generates a row per day. `Habit` holds the recurrence, `HabitCompletion`
holds one row per day actually kept, and everything else — whether it is due
today, the streak, the 30-day rate, the history grid — is derived on read from
those two. A year of a daily habit is 365 small rows at most, not 365 tasks
cluttering every list, every count and every calendar.

**One completion per habit per day, enforced by the database.**
`@@unique([habitId, completedDate])` is the guarantee; the service inserts with
`ON CONFLICT DO NOTHING`, so ten simultaneous ticks produce one row and one XP
award, and the nine that lost are told the day was already done. The existing
`(taskId, kind, cycle)` ledger key gives no protection here — PostgreSQL treats
NULL `taskId`s as distinct — so habit XP has its own key,
`@@unique([habitCompletionId, kind])`.

**Streaks are derived, never stored.** A cached streak is computed under the
schedule that existed when it was written, so editing a habit would either
silently rewrite history or leave the cache lying. Deriving it on read from a
bounded window (a year) means an edit changes what is *due from here on* while
every day already kept stays exactly as it was. A run that reaches the edge of
that window is reported as "30+" rather than pretending to know more.

**A day you kept always counts, whatever the schedule says afterwards.** A
schedule describes what is *owed*; a completion records what was *done*. So a
kept day credits the streak even if the habit was later narrowed away from that
weekday, and even if it was paused that same afternoon — otherwise going on
holiday after ticking the morning's run would quietly delete that day from your
record, including from an all-time best.

**An unscheduled day is not a failure.** A Tuesday for a Mon/Wed/Fri habit, a
day inside a pause, a day before the habit started or after it ended — none of
these is an occurrence, so the streak steps over it rather than breaking on it.
Pausing is recorded as an interval (`HabitPause`) precisely so that the
arithmetic can tell "not required" from "missed" long after the fact. Today is
neutral too: a habit you have not done yet at 09:00 has not broken anything.

**A partly available week is judged against what was possible in it.** A
five-times-a-week habit paused from Wednesday could not be done five times, so
it is scored against the three days that existed — the same rule as "an
unscheduled day is not a miss", one level up. A week with nothing available at
all is neither kept nor missed.

**Ids are type-checked at the action boundary.** A Server Action's arguments
are JSON the client chose, and TypeScript's `habitId: string` is erased at
runtime — so without an explicit check an object can arrive where an id is
expected, and Prisma reads an object as a *filter*. Every habit action rejects
a non-string id with the same sentence a missing habit gets, and the service
never re-uses the caller's value once the database has handed back a real row:
the queries on completions and pauses are scoped through `habit: { userId }` as
well, because those tables have no owner column of their own.

**Habit streaks are not the global streak.** `UserStats.currentStreak` counts
days you completed a *task*, and habits never write it — nor `tasksCompleted`,
`longestStreak` or `lastCompletedDate`. Each habit carries its own streak,
derived from its own days. Habits do share the one XP economy: a completion
writes a normal `XpTransaction` with `source: HABIT_COMPLETION`, and un-ticking
writes a reversal for exactly what was granted.

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

**A focus session's clock is the database, not the browser.** `/app/focus`
is the first feature that stores elapsed time, and the whole design turns on
one rule: a client may ask to start, pause, resume, complete or cancel a
session, and may never say how long one lasted. There is no parameter in any
focus server action that carries a duration or a timestamp.

A session stores what has been banked and, while running, when the current
segment began. Elapsed time is therefore derived, never counted:

| status | elapsed |
|---|---|
| `RUNNING` | `accumulatedSeconds + (now − segmentStartedAt)` |
| `PAUSED` | `accumulatedSeconds` |
| `COMPLETED` / `CANCELLED` | `accumulatedSeconds`, banked when it ended |

That is why a refresh, a navigation, a sleeping laptop or a closed browser
cannot lose time — none of them was where the time was being kept. The visible
timer ticks once a second, but each tick *recomputes* from those timestamps
rather than adding one; an `elapsed += 1` timer is wrong after any throttled
tab, and silently.

Durations are intervals, so they never touch a timezone. Twenty-five minutes is
twenty-five minutes across midnight, across a DST boundary, and on a plane.

**A session is in exactly one of four states.**

```
RUNNING  ⇄  PAUSED
   ↓          ↓
COMPLETED / CANCELLED   (terminal)
```

Terminal means terminal — a completed session never runs again; more work is a
new session, which is also the honest record. Booleans were rejected for the
usual reason: `isRunning`/`isPaused`/`isDone` can express "running and
completed", and then every read has to decide which flag wins.

Every transition is a compare-and-swap: the `UPDATE` carries the status it
expects to find, so two racing requests resolve in the database and exactly one
changes a row. That is the same mechanism that makes double XP impossible.

**One live session per user, enforced by the database.** A partial unique index
— `UNIQUE (userId) WHERE status IN ('RUNNING','PAUSED')` — is created by hand in
the Phase 4.3 migration, because Prisma's schema language cannot express a
filtered index (so it does not appear in `schema.prisma`; the migration and
`src/lib/focus/service.ts` both say so). An application-level "check, then
insert" cannot do this: between the check and the insert, the other request
commits. Starting a second session returns a conflict naming the one you
already have, and never cancels it for you — switching is a separate,
explicit action that discards the old session in the same transaction.

**Tracked focus is not task completion, and earns no XP.** Finishing a session
leaves the task exactly as it was: the user decides when the work is done, and
sixty minutes of focus on a sixty-minute estimate may still need reviewing.
Nothing in `src/lib/focus/` writes to the XP ledger, `UserStats` or the streak —
awarding XP per elapsed minute would make the ledger a stopwatch to be gamed.
Completing the *task* still runs the existing Phase 1 logic, unchanged.

**Estimated and tracked are two different measurements** and are always shown
as such. `Task.estimatedMinutes` is never overwritten with a recorded duration.
The wording is "tracked focus" rather than "actual time", because a focus
session records a period someone put through the timer — it is not a claim
about how productive that period was, and there is no productivity score
anywhere in this app.

**Only completed sessions count.** A cancelled session keeps its row and its
banked seconds — it happened — but contributes nothing to any total. A session
finished under ten seconds is recorded as cancelled rather than completed, so a
mis-click cannot put minutes on the board; the UI says the session was too
short instead of implying it was saved.

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
| `FocusSession` | A period of focused work, with its elapsed time |
| `Habit` | A recurring intention: its schedule, reward and lifecycle |
| `HabitCompletion` | One day a habit was kept — the unit a streak counts |
| `HabitPause` | A period a habit was paused or archived, so it was not due |
| `XpTransaction` | Append-only XP ledger |
| `UserStats` | Cached rollup of the ledger, plus streak state |

Migrations live in `prisma/migrations`. Each phase adds tables and constraints
rather than rewriting what came before; the one removal in the set is Phase 3
dropping the unused `Task.goalId` column, which was verified NULL in every row
and referenced by no code before it went.

Phases 4.1 and 4.2 added no model, no column and no migration: the calendar
and the Today planner are built entirely from the date columns above.

Phase 4.3 adds one table and changes none. `FocusSession` carries `userId`
(cascade, as everything user-owned does) and a **nullable** `taskId` with
`ON DELETE SET NULL` — unlike most relations here, because a record of time you
actually spent should outlive the task it was spent on. A detached session
still counts towards your totals; it just no longer says what it was for, and
the UI shows "Deleted task". It has deliberately **no** project, milestone or
goal column: that hierarchy is reached through the task, and a second path to
the same fact is a second thing that can be wrong.

Its indexes follow the three questions actually asked of it: `(userId, status)`
for "is anything running?", `(taskId, status)` for a task's history and total,
and `(userId, endedAt)` for a day's tracked focus — plus the partial unique
index described above.

Phase 4.4 adds three tables and one column, all additive. `Habit` belongs to a
user (cascade); `HabitCompletion` and `HabitPause` belong to a habit (cascade)
and have **no** `userId` of their own — ownership flows through the habit, as a
milestone's does through its project, so there is one path to the answer and
nothing to keep in step. `XpTransaction` gains a nullable `habitCompletionId`
with `ON DELETE SET NULL`: deleting a habit takes its completions with it, but
the ledger rows it earned survive, detached, and still sum to the same total.

Dates on habits are `DATE` columns, not timestamps, for the same reason
`lastCompletedDate` is a string: a calendar day is not a point in time. Its
indexes follow what is asked of it: `(userId, status)` for the list,
`(habitId, completedDate)` for a habit's history, and `(habitId, startDate)`
for its pauses.

Routes: `/app` · `/app/today` · `/app/tasks` · `/app/projects` ·
`/app/projects/[projectId]` · `/app/goals` · `/app/goals/[goalId]` ·
`/app/habits` · `/app/habits/[habitId]` · `/app/calendar` · `/app/settings`,
plus `/login`, `/signup` and the remaining placeholder routes.

`/app/focus` takes no search parameters at all. The server decides which
session it shows, so there is nothing in the URL to tamper with and no way to
address somebody else's timer.

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
the features that do not exist yet — and Phase 4.4 deliberately left `habitId`
alone rather than wiring it up, because a habit does not produce tasks. The
column stays a forward reference for a feature that might one day want one
("turn today's occurrence into a task I can focus on"), not a relationship this
phase invented a use for. That pattern is what made Phases 2 and 3
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
- There is no task detail page in this app — tasks live in lists and in the
  edit dialog — so a task's focus history is shown on the focus page, and a
  compact tracked-focus figure sits beside the estimate on task rows.
- Focus sessions are not calendar items. The calendar shows what is *planned*;
  a session is a record of what was *done*, and putting execution records on a
  planning surface would confuse the two.
- A long-running session is never auto-cancelled. One that has been live for
  six hours says so when you return to it, and the choice to finish or discard
  it is yours — silently discarding someone's data to tidy up a number would be
  worse than showing a large one.
- There is no focus streak, no productivity score, and no analytics beyond a
  task's own total and a day's tracked figure. Those belong to a later phase.
- `prisma migrate dev` may report the partial unique index as drift, because
  the schema cannot describe it. `prisma migrate deploy` — what the tests and a
  fresh clone run — is unaffected.
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
- A habit cannot be deleted, only archived. Its completions are the record of
  what you actually did, and an archive keeps that while removing the habit
  from every live surface; a delete is available at the database level through
  the cascade, but no UI path invents one.
- Habit history is read within a rolling year (`HABIT_HISTORY_DAYS`). A streak
  that runs past it is shown as "365+" rather than loading an unbounded table,
  and back-dating a completion beyond it is refused.
- A streak is derived inside a rolling year, so a run older than that is
  reported as a floor ("365+") rather than a total — and the same caveat now
  applies to the longest streak, which is shown as "N+" when the best run
  reaches the edge of the loaded history.
- Un-ticking a day is allowed while a habit is paused or archived. Completing
  needs an active habit; undoing only removes a row and returns the XP it paid
  for, and refusing it would trap a mis-tick permanently behind a pause.
- A habit occurrence cannot be focused, given a due time, or put on the
  calendar. Habits are not calendar items for the same reason focus sessions
  are not: the calendar shows what is planned, and a habit is a standing
  intention rather than an appointment.
- Times-per-week habits count Monday to Sunday and cannot be given a custom
  week start; the whole date layer uses one week definition.
- There is no reminder, notification, streak freeze, repair or template — those
  are later-phase features, and a streak you can repair is not a streak.
- Email is not verifiable or changeable, and there is no password reset or
  login rate limiting.
- Daily statistics are derived rather than snapshotted, so they are always
  consistent but carry no history.
