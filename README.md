# NOVA — Phases 1–2

> **NOVA** is an internal working name. The brand is not hard-coded anywhere in
> the source: set `NEXT_PUBLIC_APP_NAME` and it updates across the UI and
> metadata. See `src/config/app.ts`.

A personal productivity workspace built around a hierarchy:

```
PROJECT  →  MILESTONE  →  TASK
```

Tasks carry priorities, categories, deadlines and estimates, and feed an
XP/level/streak progression system. Projects group them into work with a
beginning and an end; milestones are the checkpoints along the way.

**Shipped:** authentication, tasks, projects, milestones, progression.
**Not yet:** calendar, goals, habits, focus sessions, meetings, notes,
analytics, AI planning. Those exist as navigation placeholders, and the data
model is shaped so they can be added without rewriting what is here — Phase 2
proved that out, adding foreign keys to columns Phase 1 had left in place
rather than rewriting the task table.

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

Two on-demand browser harnesses cover the signed-in flows end to end against a
production build — `tests/e2e/verify.mjs` (tasks, XP, streaks, auth) and
`tests/e2e/verify-projects.mjs` (projects, milestones, assignment). Neither is
part of `npm test`, and Playwright is not a project dependency; see the header
of either file to run them.

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
    dashboard/              StatCard, panels, daily progress, active projects
    tasks/                  TaskCard, TaskList, TaskForm, badges, dialogs
    projects/               ProjectCard, ProjectHeader, MilestoneList, forms
    xp/  streaks/  auth/  settings/
  lib/
    auth/                   password (scrypt), sessions, guards, actions
    tasks/                  service (writes), queries (reads), actions
    projects/               service, queries, actions, progress
    validation/             hand-rolled, shared by client and server
    leveling.ts  streak.ts  xp.ts  datetime.ts  prisma.ts
  config/                   app name, priorities, categories, colours,
                            projects, navigation
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

**Deleting a container never destroys its contents.** `Task.projectId` and
`Task.milestoneId` are both `ON DELETE SET NULL`. Delete a project and its
milestones go with it, but its tasks survive — detached, with their XP history
intact. Delete a milestone and its tasks stay in the project. This is expressed
in the schema, not in application code, so no future code path can forget it.

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
counting tasks, via grouped aggregate queries — so a project list costs the
same whether you have ten tasks or ten thousand, and a stored percentage can
never go stale. Completion, by contrast, is never inferred: when every task is
done the UI *offers* to complete the project or milestone, and waits.

## Data model

| Model | Purpose |
|---|---|
| `User` / `Session` | Accounts and opaque server-side sessions |
| `Category` | User-defined task grouping |
| `Project` | Work with a beginning and an end — status, priority, dates |
| `Milestone` | An ordered checkpoint within a project |
| `Task` | The unit of work; optionally filed under a project and milestone |
| `XpTransaction` | Append-only XP ledger |
| `UserStats` | Cached rollup of the ledger, plus streak state |

Migrations live in `prisma/migrations` and are additive — the Phase 2 migration
adds two tables and two foreign keys without dropping or rewriting anything.

## Future readiness

`Task` still carries nullable `goalId`, `habitId`, `meetingId` and `eventId`
columns for the features that do not exist yet. That pattern is what made
Phase 2 cheap: `projectId` and `milestoneId` were already there, so adding
projects meant adding constraints to existing columns rather than rewriting the
task table and every query that touches it.

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
- Email is not verifiable or changeable, and there is no password reset or
  login rate limiting.
- Daily statistics are derived rather than snapshotted, so they are always
  consistent but carry no history.
