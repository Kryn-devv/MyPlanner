# NOVA — Phase 1

> **NOVA** is an internal working name. The brand is not hard-coded anywhere in
> the source: set `NEXT_PUBLIC_APP_NAME` and it updates across the UI and
> metadata. See `src/config/app.ts`.

A personal productivity workspace: tasks with priorities, categories, deadlines
and estimates, on top of an XP/level/streak progression system.

This is **Phase 1**. Calendar, projects, goals, habits, focus sessions,
meetings, notes, analytics and AI planning are not implemented — they exist as
navigation placeholders, and the data model is shaped so they can be added
without rewriting the task system.

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
| `npm run typecheck` | `tsc --noEmit` |
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

There is also an on-demand browser harness at `tests/e2e/verify.mjs` covering
the whole signed-in flow. It is not part of `npm test` and Playwright is not a
project dependency; see the header of that file to run it.

## Architecture

```
src/
  app/                      routes (App Router)
    (auth)/                 login, signup — redirects away if already signed in
    app/                    protected shell: dashboard, tasks, settings
                            + 12 Phase 2 placeholder routes
  components/
    ui/                     Button, Field, Modal, ProgressBar, Toast, States
    layout/                 Sidebar, Topbar, MobileNav, PageHeader, ComingSoon
    dashboard/              StatCard, panels, daily progress
    tasks/                  TaskCard, TaskList, TaskForm, badges, dialogs
    xp/  streaks/  auth/  settings/
  lib/
    auth/                   password (scrypt), sessions, guards, actions
    tasks/                  service (writes), queries (reads), actions
    validation/             hand-rolled, shared by client and server
    leveling.ts  streak.ts  xp.ts  datetime.ts  prisma.ts
  config/                   app name, priorities, categories, navigation
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

## Phase 2+ readiness

`Task` already carries nullable `projectId`, `goalId`, `habitId`, `meetingId`,
`eventId` and `milestoneId` columns. Adding those features is an additive
migration — create the table, add the foreign key — with no change to the task
table or the queries that read it. `XpSource` and the quick-add action list are
likewise open for extension, and `src/config/navigation.ts` drives both the
sidebar and the placeholder pages from one list.
