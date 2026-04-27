# Migration: Prisma + Neon → Zoho Catalyst Data Store

Status: **In Progress** — Phase 1 (Setup) complete

---

## Why

Mandate to consolidate the OMS stack on Zoho infrastructure. The backend already
runs on Catalyst AppSail; this migration moves the database from Neon PostgreSQL
to Catalyst Data Store so the entire stack is Zoho-native.

## Strategy: Parallel, Feature-Flagged Migration

We are **not** ripping out Prisma. Both data layers coexist behind feature flags
so we can:

- Migrate one module at a time
- Run both DBs in parallel during cutover
- Roll back instantly via env var if Catalyst behaves badly
- Compare output between the two layers in production

## Architecture

```
backend/src/
├── lib/
│   ├── prisma.ts             # Existing — Neon connection (DO NOT DELETE)
│   └── catalyst.ts           # NEW    — Catalyst SDK wrapper
│
├── config/
│   ├── index.ts              # Existing — env normalization
│   └── feature-flags.ts      # NEW    — per-module toggles
│
├── controllers/              # Existing — Prisma-backed
│   ├── visitor.controller.ts
│   ├── grievance.controller.ts
│   └── ...
│
├── controllers-catalyst/     # NEW — Catalyst-backed parallel implementations
│   ├── visitor.controller.ts
│   └── ... (added incrementally)
│
└── routes/
    └── *.routes.ts           # Modified to dispatch by feature flag
```

## Feature Flags

Set in `.env`:

| Variable | Purpose |
|---|---|
| `USE_CATALYST=true` | Master switch — every module uses Catalyst |
| `USE_CATALYST_VISITOR=true` | Per-module — only Visitor uses Catalyst |
| `USE_CATALYST_GRIEVANCE=true` | Per-module — only Grievance uses Catalyst |
| ...one per module | |

A module uses Catalyst if EITHER its specific flag OR `USE_CATALYST` is true.

To roll back: set the relevant flag to `false` and restart. No code changes.

## Phase Status

| Phase | Status | Detail |
|---|---|---|
| 1. Setup (SDK + scaffolding) | ✅ Complete | `zcatalyst-sdk-node` installed, `catalyst.ts` + `feature-flags.ts` created |
| 2. Schema in Catalyst Console | ⏳ Pending | Tables to be created via Console (manual) |
| 3. Visitor POC | ⏳ Pending | Smallest module first to validate the approach |
| 4. Full module migration | ⏳ Pending | Grievance, Train, Tour, Task, News, Birthday, Auth, Stats |
| 5. Data migration (Neon → Catalyst) | ⏳ Pending | CSV export → Stratus → Catalyst CLI import |
| 6. Cutover (parallel run + switch) | ⏳ Pending | 1-week dual-write period before disabling Prisma |

## Phase 1 Deliverables (this commit)

- `backend/package.json` — added `zcatalyst-sdk-node` dependency
- `backend/src/lib/catalyst.ts` — request-scoped SDK initializer + helpers
- `backend/src/config/feature-flags.ts` — toggle system with per-module flags
- `MIGRATION.md` — this doc

## Key Design Decisions

### Request-scoped SDK, not singleton
Prisma is a long-lived singleton. The Catalyst SDK initializes per request because
it embeds the AppSail request context. Each controller method must accept `req`
and pass it down. Our `getCatalystApp(req)` and `getTable(req, name)` helpers
encapsulate this.

### Manual escaping for ZCQL
ZCQL has no parameter binding (unlike Prisma's parameterized queries).
`zcqlEscape()` in `catalyst.ts` handles the SQL-injection risk. Always use it
when interpolating user input into ZCQL.

### What Catalyst Data Store does NOT support
This migration must work around:
- **Enums** → stored as TEXT, validated in app code
- **JSON columns** (`AuditLog.oldData`, `newData`) → stringified to TEXT
- **Foreign-key cascades** → manual cascade-delete in controllers
- **Transactions** → multi-table writes are NOT atomic
- **JOINs > 4 tables** → split into multiple queries, combine in code
- **`@default(now())`** → set timestamps in app code before insert
- **`@default(uuid())`** → use Catalyst's auto-generated `ROWID`

### DB-level access control via Security Rules
Catalyst supports per-table Security Rules (Console → Cloud Scale → Security Rules).
We will mirror our controller-level filters at the DB layer for STAFF data isolation,
making the system safer than the current Prisma setup.

## How to Roll Back

Any time during the migration, set in `.env`:
```
USE_CATALYST=false
```
Restart the server. All modules revert to Prisma + Neon. No code changes needed.

If a specific module misbehaves, leave the master flag on and disable just that one:
```
USE_CATALYST=true
USE_CATALYST_VISITOR=false
```
