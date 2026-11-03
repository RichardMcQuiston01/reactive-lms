# ReactiveLMS

A TypeScript learning management system that runs standalone or embeds into
an existing NestJS + TypeORM API and Angular frontend.

> **Status:** pre-alpha (v0.2.0). The workspace contains working HTML5 and
> SCORM 1.2 import, launch, and progress, a module tree with availability
> conditions, and first admin screens (module tree, sections, packages, upload,
> placement); the rest of the standards are planned. See
> [ROADMAP.md](ROADMAP.md).

## Dual mode

| Mode | What you run | When to use it |
| --- | --- | --- |
| **Standalone** | `@richardmcquiston01/reactive-lms-standalone-api` + `@richardmcquiston01/reactive-lms-standalone-web` | Demo, evaluation, or a self-contained LMS process |
| **Embed** | Import `@richardmcquiston01/reactive-lms-nest` into a host NestJS app and `@richardmcquiston01/reactive-lms-player` into a host Angular app | Host already owns identity, auth, and UI shell |

Standalone boots the same Nest module and Angular player with thin local adapters (identity, storage). Embed reuses TypeORM entities/migrations and shared DTOs without owning host users.

A course section is a container of modules. Place an imported package with `ModuleService.place`, enrol via `EnrolmentService` (`manual`, `self`, or `group`), then `LaunchService.launch` for HTML5 (`playerKind: 'iframe'`) or SCORM 1.2 (`playerKind: 'scorm-frame'`). Module availability (versioned `all`/`any` conditions: `module_completed`, `date_window`, `min_score`, `group_member`) is enforced at launch, and a block's rules gate every module inside it. Progress writes go through `ProgressSinkService`, which rolls up `registration.status` from the section completion rule (default: every module completed). SCORM 1.2 commits map `cmi.core.lesson_status` and `cmi.core.score.raw` onto that sink.

Those services are also exposed over HTTP by `@richardmcquiston01/reactive-lms-nest` (`ReactiveLmsModule.registerAsync`, default prefix `/lms`). `@richardmcquiston01/reactive-lms-player` ships `provideReactiveLms` and `<rlms-player>` which launches a module, iframes `contentUrl`, and posts HTML5 `postMessage` progress.

## Monorepo map

Package manager: **[bun](https://bun.sh)** (workspaces). Do not use npm for install or scripts.

| Package | Name | Responsibility |
| --- | --- | --- |
| `packages/shared` | `@richardmcquiston01/reactive-lms-shared` | Enums, DTOs, adapter contracts, launch/progress models, `LmsError` (no Nest/Angular/TypeORM) |
| `packages/persistence` | `@richardmcquiston01/reactive-lms-persistence` | LIS-shaped TypeORM `rlms_*` entities, `createPersistenceDataSource` factory, and `0001-initial-schema` migration |
| `packages/core` | `@richardmcquiston01/reactive-lms-core` | Import, launch, progress, LRS, LTI, content runtimes. HTML5 and SCORM 1.2 ZIP import (`PackageImporter`, `Html5Runtime`, `Scorm12Runtime`, `FilesystemBlobStorageAdapter`), CMI store + persist (`ScormCmiService`), module placement (`ModuleService`), enrolment (`manual` / `self` / `group`), iframe / scorm-frame launch, and course-completion rollup are implemented; 2004 / cmi5 / H5P / LTI are detected but not yet parsed. |
| `packages/nest` | `@richardmcquiston01/reactive-lms-nest` | Embeddable NestJS module, REST + OpenAPI over the 3b/4 services, `LmsError` JSON filter |
| `packages/player` | `@richardmcquiston01/reactive-lms-player` | Angular standalone `RlmsPlayerComponent`, `provideReactiveLms`, HTML5 postMessage mapper, SCORM `window.API` bridge |
| `packages/standalone-api` | `@richardmcquiston01/reactive-lms-standalone-api` | Nest bootstrap, filesystem dataroot, demo identity, `/health`, `/lms/content/**` |
| `packages/standalone-web` | `@richardmcquiston01/reactive-lms-standalone-web` | Thin demo entry that re-exports the Angular player |

> Package names above are the current workspace names. They move to the
> `@richardmcquiston01/reactive-lms-*` scope when 0.2.0 is reconciled with the
> roadmap (D4).

## Features (planned)

- **Content formats:** SCORM 1.2, SCORM 2004, xAPI, cmi5, HTML5 bundles, H5P,
  and LTI 1.3 (as an LTI Platform).
- **One progress model:** every format launches, tracks, and reports through
  a common runtime contract.
- **Dual deployment:** standalone process, or a NestJS module for an existing
  host API.
- **Shared contracts:** interfaces and DTOs usable by both frontend and
  backend.
- **Standards-aligned:** follows 1EdTech (IMS Global) specs, including LIS
  concepts for people, courses, and memberships.
- **Host-friendly persistence:** TypeORM migrations that can be applied to an
  existing database.

## Tech stack

| Layer     | Technology                                      |
| --------- | ----------------------------------------------- |
| Backend   | TypeScript, NestJS, TypeORM (Postgres first)    |
| Demo UI   | Angular 18+, TailwindCSS, RxJS                  |
| Shared    | Interfaces and DTOs (`@richardmcquiston01/reactive-lms-shared`)    |
| Tooling   | bun workspaces                                  |
| Caching   | Redis later, behind a `CacheAdapter`            |

## Development

Requires [Bun](https://bun.sh). From the repository root:

```bash
bun install
bun run typecheck
bun run lint
bun run format:check   # bun run format to fix
bun test
```

CI runs the same four checks on every pull request, against a Postgres 16
service. To run the database-backed persistence tests locally, point
`RLMS_TEST_DATABASE_URL` at an empty Postgres 13+ database; without it those
tests are skipped.

### Running the standalone API

`standalone-api` reads these environment variables:

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `RLMS_DATABASE_URL` (or `DATABASE_URL`) | built from `DATABASE_*` parts | Postgres connection URL |
| `RLMS_DATAROOT` (or `DATAROOT`) | `./data` | Directory for uploaded and extracted packages, outside the web root |
| `RLMS_RUN_MIGRATIONS` | `true` | Run pending migrations on start. Set `false` (or `0`, `no`, `off`) if you apply migrations yourself |
| `PORT` | `3000` | HTTP port |

Standalone owns its database, so a fresh empty database is migrated on first
start. When running several API processes against one database, start one
first so two do not migrate at once. An unrecognised `RLMS_RUN_MIGRATIONS`
value stops the process with a message naming the variable.

### Authorization

ReactiveLMS asks; the host decides. When embedding, pass a `capabilityAdapter`
to `ReactiveLmsModule` and every route asks it (`package.import`,
`module.manage`, `launch`, `grade.view`, and so on). The adapter may also let
staff act for a learner.

Without an adapter:

- learner routes (launch, progress, SCORM CMI) are limited to the learner who
  owns the registration, so one learner cannot read or write another's;
- admin routes (import, create, place, enrol, delete) are open to any caller
  the `IdentityAdapter` identifies.

The standalone API runs without an adapter and with one fixed demo learner, so
it is for evaluation only. An embedding host should configure an adapter.

## Documentation

- [docs/DESIGN_CONSIDERATIONS.md](docs/DESIGN_CONSIDERATIONS.md) — product
  and standards requirements
- [docs/TECHNOLOGY.md](docs/TECHNOLOGY.md) — locked technology stack
- [GROK_PLAN.md](GROK_PLAN.md) — implementation plan
- [CHANGELOG.md](CHANGELOG.md) — release history

## License

[MIT](./LICENSE). Copyright (c) 2026 Richard McQuiston. See
[COPYRIGHT](./COPYRIGHT).

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[**Donate via PayPal**](https://www.paypal.com/ncp/payment/NENS5EGZLW5HA), or scan:

<a href="https://www.paypal.com/ncp/payment/NENS5EGZLW5HA"><img src="./donate.png" alt="Donate via PayPal" width="180"></a>
