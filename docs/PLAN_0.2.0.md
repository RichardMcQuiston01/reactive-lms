# 0.2.0 Task Breakdown — Scaffold, contracts, schema

Working plan for milestone 0.2.0 in [ROADMAP.md](../ROADMAP.md). Detail comes
from [GROK_PLAN.md](../GROK_PLAN.md) phases 0 to 2, updated for the decisions
recorded in the roadmap (D1 to D13). Where this file and GROK_PLAN disagree,
this file wins.

## Gate (D13)

Implementation starts once `@richardmcquiston01/storage-adapters` and
`@richardmcquiston01/error-log-adapter` both have stable 1.0 releases. At the
time of writing they are 0.20.0 and 0.15.0.

- [ ] Both packages published at 1.x
- [ ] Open questions at the bottom answered

## How the decisions land in 0.2.0

| Decision | Effect on 0.2.0 |
| -------- | --------------- |
| D2 | `admin` package exists as an empty scaffold; screens arrive in 0.3.0 |
| D4 | Six library packages named `@richardmcquiston01/reactive-lms-*`; workspace path references, nothing published yet |
| D5 (B) | `course_module` has `parent_module_id`; `availability_json` is a versioned condition list |
| D8 | `PersistenceDialect` contract and registry; Postgres is the only built-in dialect |
| D9 | Entities use portable TypeORM column types; native Postgres types only in the Postgres migration |
| D10 | One `feature/<name>` branch and PR per work package below, merge commits, subjects of 50 characters or fewer |
| D11 | `BlobStorageAdapter` contract in `shared`; filesystem implementation is 0.3.0 |
| D12 | Optional error-log support: `shared` defines the sink type, no hard dependency |

## Work packages

Three PRs, in order. Each is a feature branch off `dev`.

### WP0: Scaffold the monorepo (`feature/scaffold-workspace`)

Commit scope `chore(repo)`.

- [ ] Extend the root `package.json` with Bun workspaces (`packages/*`); keep
      it `private`, keep the `funding` field, keep version 0.1.0 until the
      release PR
- [ ] `tsconfig.base.json`: strict mode, ESM, declaration output
- [ ] Eight packages under `packages/`: `shared`, `persistence`, `core`,
      `nest`, `player`, `admin`, `standalone-api`, `standalone-web`. Each has
      `package.json` (`"type": "module"`, the D4 name, `private` for the two
      apps), `src/index.ts`, and a `tsconfig.json` extending the base
- [ ] Root scripts: `typecheck`, `test`, `test:file`, `lint`, `lint:file`,
      `format`
- [ ] Lint and format config following the Google TypeScript Style Guide
      (2-space indent, LF, trailing commas, 80-column soft margin)
- [ ] Test runner wired and one smoke test per package so `bun run test`
      exercises every workspace
- [ ] `.env.example` (no secrets; database URL, data directory, log directory)
- [ ] `docs/STANDARDS.md`: SCORM 1.2, SCORM 2004 4th Edition (CAM 1.3), xAPI
      1.0.3, cmi5 Quartz 1st Edition, LTI 1.3 with AGS 2.0, NRPS 2.0 and
      Deep Linking 2.0, H5P package spec, LIS 2.0.1 as the information model
- [ ] CI workflow running typecheck, lint, and test on pull requests
      (open question 1)
- [ ] README monorepo map; CHANGELOG entry

**Done when:** `bun install` links every workspace and `bun run typecheck`,
`lint`, and `test` pass on the empty packages.

### WP1: Shared contracts (`feature/shared-contracts`)

Commit scope `feat(shared)`. Depends on WP0. No Nest, Angular, TypeORM, Redis,
or Tailwind imports anywhere in this package; add a lint rule or test that
fails the build if one appears.

- [ ] Enums: `PackageType`, `RegistrationStatus`, plus completion and success
      status types
- [ ] Models: `LearnerRef`, `NormalizedProgress`, launch descriptor
- [ ] `LmsError` with `{ status, code, message, details? }` and HTTP mapping;
      readable codes (`PACKAGE_NOT_DETECTED`, `LAUNCH_SESSION_OPEN`,
      `CMI5_TOKEN_USED`). Messages must name the cause, not be generic.
      Tests written first
- [ ] Package-type detection helpers, with fixtures for a bare HTML ZIP, an
      `imsmanifest.xml` ZIP, a `cmi5.xml` ZIP, and an `h5p.json` ZIP. Tests
      written first
- [ ] Contracts: `ContentRuntime`, `IdentityAdapter`, `CapabilityAdapter`,
      `EnrolmentAdapter`, `BlobStorageAdapter` (stream-based, key-based,
      prefix listing, no local paths), `CacheAdapter` (`get`, `set`, `del`,
      `setNx`), and an `ErrorSink` type compatible with `error-log-adapter`
      (D12)
- [ ] DTOs for content package, registration, and launch
- [ ] One `src/index.ts` barrel; JSDoc on every public type and method
- [ ] All functions return checked result values rather than throwing across
      package boundaries, per the project's error-handling rule

**Done when:** another workspace package can import `ContentRuntime` and
`LearnerRef` from `@richardmcquiston01/reactive-lms-shared`.

### WP2: Persistence and dialects (`feature/persistence-schema`)

Commit scope `feat(persistence)`. Depends on WP1.

- [ ] Naming strategy adding the `rlms_` prefix to every table, so entity
      `person` maps to `rlms_person`
- [ ] Entities for the 21 tables in GROK_PLAN section 4.1: singular
      `snake_case` names, UUID primary keys, `created_at` and `updated_at` on
      every table that is not many-to-many or append-only, and
      `created_by_user_id` and `updated_by_user_id` where users modify rows
- [ ] D9: portable column types only (`json` or `simple-json`, `blob`, plain
      `uuid`, `timestamp`); no `jsonb` or `bytea` in entities
- [ ] D5 option B fields: `parent_module_id` on `course_module`;
      `availability_json` documented as `{ version: 1, all: [...] }` with
      `any` allowed
- [ ] `PersistenceDialect` contract (driver type, connection options,
      migration set) and a dialect registry; `postgres` registered as the
      first dialect and replaceable by a host (D8)
- [ ] `createPersistenceDataSource({ url, dialect, migrationsRun? })`
- [ ] `0001-initial-schema` for the Postgres dialect, generated then
      reviewed by hand. Native Postgres types and UUID defaults live only
      here
- [ ] Shared persistence test suite, written so a future dialect can run it
      behind an env flag. Cases: unique `(person_id, course_section_id)` on
      `registration`; one section holding two `course_module` rows for the
      same `content_package`; no update path for `xapi_statement`
- [ ] Disposable Postgres for tests (open question 3)

**Guardrail:** never run migrations against a shared database without a dump
and an explicit OK.

**Done when:** migrations apply to an empty Postgres and the unique
constraints exist.

### WP3: Release prep (`feature/release-0-2-0`)

Commit scope `chore(release)`. Depends on WP0 to WP2.

- [ ] Root version to 0.2.0; workspace package versions aligned
- [ ] CHANGELOG moves the Unreleased entries under `0.2.0 - <date>`
- [ ] README reflects the package map and dual-mode story
- [ ] ROADMAP marks 0.2.0 done and updates the milestone table
- [ ] Tag from `main` after the `dev` to `main` merge (not published; D4)

## Out of scope for 0.2.0

Filesystem blob storage and its conformance suite, the importer, launch,
enrolment, event log service, any runtime, the admin screens, the player, and
the Nest module. These start in 0.3.0.

## Open questions

1. **CI:** add a GitHub Actions workflow in WP0? Recommended yes; the repo has
   none today.
2. **Lint and format tooling:** ESLint with Prettier configured to the Google
   style, or `gts`? Recommended ESLint plus Prettier, since `gts` is opinionated
   about its own config.
3. **Test database:** Testcontainers or a `docker compose` service named
   `rlms_test`? Recommended `docker compose`, which is simpler in cloud
   sessions and CI; Testcontainers needs a Docker socket.
4. **UUID generation:** generate IDs in application code (UUID v4, or v7 for
   index locality) so every dialect behaves the same, or rely on database
   defaults? Recommended application-generated, with Postgres defaults only as
   a fallback in the migration.
5. **Test runner:** `bun test` or Vitest? Recommended `bun test` where it
   works; the Angular packages may need their own runner later.
