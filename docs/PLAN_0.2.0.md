# 0.2.0 Plan — Reconcile the foundation with the roadmap

Working plan for milestone 0.2.0 in [ROADMAP.md](../ROADMAP.md). It replaces
the original from-scratch breakdown: `feature/lms-foundation` (merged in
PR 13) already delivers most of 0.2.0, much of 0.3.0, and the core of 0.4.0.
This plan lists what is built, where it differs from decisions D1 to D13, and
the work packages that close the gaps. Where this file and
[GROK_PLAN.md](../GROK_PLAN.md) disagree, this file wins.

## What the foundation already provides

Verified by running it: `bun install`, typecheck, and 161 tests pass (one
Postgres integration test is skipped without a database URL).

| Area | Built |
| ---- | ----- |
| Workspace | Bun workspaces, seven packages, `docs/STANDARDS.md` |
| `shared` | Enums, DTOs, adapter contracts (`ContentRuntime`, identity, capability, enrolment, storage), `LmsError` with HTTP mapping, CMI model; zero dependencies |
| `persistence` | 21 `rlms_*` entities, `0001` Postgres migration, `createPersistenceDataSource` |
| `core` | ZIP detection, HTML5 import with ZIP-bomb limits and antivirus hook, filesystem storage, modules, enrolment (`manual`, `self`, `group`), launch, availability, progress rollup, event log, SCORM 1.2 runtime and CMI store |
| `nest` | `register` / `registerAsync`, REST and OpenAPI controllers, error filters |
| `player` | Angular 18 `RlmsPlayerComponent`, HTML5 `postMessage` mapper, SCORM `window.API` bridge |
| `standalone-api` | Nest bootstrap, filesystem data root, demo identity |

## Gaps against the decisions

| Decision | Gap |
| -------- | --- |
| D4 package names | Packages are `@reactive-lms/*` at 0.0.0 |
| D9 portable types | Entities use `jsonb` (15), `bytea` (1), `timestamptz` (11), `numeric` (9) |
| D8 dialects | `createPersistenceDataSource` is hard-coded to Postgres; no dialect contract |
| D11 blob storage | `StorageAdapter` takes whole buffers, exposes `getPublicUrl`, and does ZIP extraction itself; not stream-based, and the name clashes with the `storage-adapters` package |
| D5 option B | `course_module` has no `parent_module_id`; availability is one object (prerequisite, date window, minimum score), with no all/any list and no group condition |
| D2 admin | No `admin` package; `standalone-web` only re-exports the player |
| D7 cache | No `CacheAdapter` |
| D12 error log | No error-sink hook |
| Tooling | Lint and CI added in WP0 (PR 14) |
| Verification | The one persistence integration test is skipped by default, so the migration and its unique constraints are not exercised in CI |
| SCORM fixtures | No sample-package conformance fixtures confirmed |

## Work packages

One `feature/` branch and one PR each, in this order. Subjects stay at 50
characters or fewer.

### WP0: Lint, format, CI (PR 14, merged)

- [x] Prettier, `.editorconfig`, ESLint with a guard keeping `shared` free of
      framework imports
- [x] GitHub Actions running typecheck, lint, format check, and tests
- [ ] Add a Postgres service to CI and run the persistence integration test,
      so the migration and unique constraints are verified (follow-up in WP3)

### WP1: Plan and roadmap rewrite (PR 15, merged)

- [x] This document; roadmap milestone status updated

### WP2: Package rename (D4, PR 16)

Commit scope `refactor(repo)`. Mechanical, so do it early.

- [x] Rename to `@richardmcquiston01/reactive-lms-{shared,persistence,core,nest,player}`;
      `standalone-api` and `standalone-web` take the same scheme and stay private
- [x] Update imports, `workspace:*` dependencies, lockfile, and README; set
      versions to 0.1.0 until the release PR
- [ ] Add the `admin` package name to the workspace list (empty scaffold in WP6)

**Done when:** typecheck, lint, and all tests pass with no `@reactive-lms/`
references left outside `GROK_PLAN.md`.

### WP3: Portable types and the dialect contract (D9, D8, PR 17)

Commit scope `feat(persistence)`. Open question 1 applies.

- [x] Replace native types in entities with portable TypeORM types: `json` or
      `simple-json` for `jsonb`, `blob` for `bytea`, `decimal` for `numeric`,
      and a portable timestamp type for `timestamptz`
- [x] `PersistenceDialect` contract (driver type, options, migration set) and
      a registry; Postgres is the first dialect and replaceable by a host
- [x] `createPersistenceDataSource({ url, dialect, migrationsRun? })`
- [x] Keep native Postgres types and UUID defaults only in the Postgres
      migration
- [x] Postgres service container in CI; the integration test runs there
- [~] Persistence test suite structured so later dialects reuse it (the
      portability check is dialect-neutral; the integration test still targets
      Postgres)

### WP4: Blob storage contract (D11)

Commit scope `feat(shared)` then `refactor(core)`.

- [x] `BlobStorageAdapter` in `shared`: stream-based, key-based, prefix
      listing, no local paths, no `getPublicUrl`
- [x] Move ZIP extraction out of the adapter into the importer, so adapters
      stay storage-only
- [x] Port `FilesystemStorageAdapter`; update Nest tokens and the standalone
      bootstrap
- [x] Shared adapter conformance suite (the pass bar for the 1.0.0 S3 adapter)

### WP5: Module conditions and tree (D5 option B)

Split in two PRs.

**WP5a: versioned conditions (PR 19)**

- [x] `availability_json` as `{ version: 1, all | any: [...] }`; condition
      types: previous module complete, date window, minimum score, group
      membership; nested groups
- [x] Read the current single-object shape as version 0 and upcast it, so
      existing rows keep working
- [x] Validate on write with per-path errors; fail closed on invalid stored
      rules
- [x] Tests for each condition, nesting, upcast, and group membership at launch

**WP5b: module tree**

- [x] `parent_module_id` on `course_module`, with container modules (blocks)
      that have no content package
- [x] A module is available only if its ancestors' rules hold too
- [x] Blocks are not launchable and do not count toward section completion
- [x] Place and reorder within a parent; tests for nesting

### WP6: Admin package scaffold (D2)

Commit scope `feat(admin)`.

- [x] `@richardmcquiston01/reactive-lms-admin`: Angular 18 library, theme-free
      (CSS custom properties), with the extension points: navigation token,
      replaceable screens, content-projection slots, wrappable API client,
      `CapabilityAdapter` visibility
- [x] `provideReactiveLmsAdmin` and `reactiveLmsAdminRoutes`
- [x] `standalone-web` composes `admin` and `player`

The screens themselves (upload, placement, enrolment, progress, module tree)
follow as 0.3.0 work.

### WP7: Cache and error-sink hooks (D7, D12)

Commit scope `feat(shared)`.

- [ ] `CacheAdapter` contract and `MemoryCacheAdapter`; route cmi5 tokens and
      LTI nonces through it when those land
- [ ] `ErrorSink` type compatible with `error-log-adapter`, with a built-in
      console fallback in `core` and `nest`; the package stays optional
- [ ] Gated by D13: the `storage-adapters`-backed cache and the
      `error-log-adapter` wiring wait until both packages reach 1.0

### Then, to finish 0.3.0 and 0.4.0

- [ ] Admin screens and module-tree view
- [ ] SCORM 1.2 sample-package fixtures and an ADL conformance check
- [ ] Release prep: version bump, changelog, roadmap update, tag from `main`

## Out of scope for 0.2.0

xAPI, cmi5, SCORM 2004, H5P, LTI, completion events (0.9.0), and the MySQL,
MariaDB, and SQLite dialects (1.1.0).

## Open questions

1. ~~**Editing `0001`**~~ Answered: never applied, edited in place.
2. **SCORM 1.2 engine:** D1 says wrap `scorm-again`; the foundation has its own
   tested CMI store and bridge. Proposal: keep the existing runtime for 1.2 and
   evaluate `scorm-again` for 2004 sequencing at 0.6.0. Needs confirmation.
3. **D13 scope:** the gate applies only to WP7's package-backed pieces; all
   other work proceeds now. Needs confirmation.
4. ~~**Timestamp type**~~ Answered: store UTC. Entities declare `Date`; Postgres
   keeps `timestamptz` (UTC instants) in its migration; MySQL and SQLite
   dialects will use UTC `datetime`.
