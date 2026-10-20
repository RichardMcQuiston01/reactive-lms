# ROADMAP

Release plan for ReactiveLMS, derived from [GROK_PLAN.md](GROK_PLAN.md).
The plan holds the detail (domain model, API surface, step lists); this file
holds the order, the exit criteria, and the decisions still open.

Status key: ✅ done · 🚧 in progress · ⬜ planned · ❓ blocked on a decision

## Principles

- **Prove the spine first.** HTML5 plus the course container ships before the
  hard standards.
- **Don't claim a format until its fixture test is green.**
- **Own the domain, borrow the runtimes.** No commercial LMS engine.
- **Not a campus VLE.** Quizzes, forums, certificates, and similar features
  are out of scope for v1 (see [Non-goals](#non-goals-v1)).
- **Host-safe.** Tables are prefixed `rlms_`; identity, authorization, storage,
  and cache are injected adapters.

## Milestones

| Version | Theme                       | PRs (GROK_PLAN §14) | Status |
| ------- | --------------------------- | ------------------- | ------ |
| 0.1.0   | Specs, stack, repo hygiene  | —                   | ✅     |
| 0.2.0   | Scaffold + contracts + schema | 0, 1, 2           | ⬜     |
| 0.3.0   | Course container + HTML5    | 3                   | ⬜     |
| 0.4.0   | SCORM 1.2                   | 4                   | ❓ D1  |
| 0.5.0   | xAPI LRS + cmi5             | 5                   | ⬜     |
| 0.6.0   | SCORM 2004 (CMI, linear nav)| 6a                  | ⬜     |
| 0.7.0   | H5P                         | 7                   | ⬜     |
| 0.8.0   | LTI 1.3 Platform + Advantage| 8                   | ⬜     |
| 0.9.0   | Nest module, Angular player, standalone demo, reporting | 9, 10 | ❓ D2, D4, D5 |
| 1.0.0   | Hardening, docs, first stable release | —         | ⬜     |
| 1.1.0   | Multi-DB drivers, Redis cache | 11                | ❓ D8, D9 |
| later   | SCORM 2004 sequencing, certificates | 6b          | ❓ D6  |

Order notes: after 0.3.0, the cmi5, SCORM 2004, H5P, and LTI work depends only
on the shared pipeline and can run in parallel; the order above is a default,
not a constraint. LTI depends only on the schema (PR 2).

## 0.1.0 — Foundation ✅

- Design spec, technology stack, implementation plan
- MIT license, README, CHANGELOG, funding metadata

## 0.2.0 — Scaffold, contracts, schema

**Delivers**

- Bun workspace with seven packages: `shared`, `persistence`, `core`, `nest`,
  `player`, `standalone-api`, `standalone-web`
- `docs/STANDARDS.md` pinning exact spec versions
- `@reactive-lms/shared`: enums, DTOs, `LmsError`, `ContentRuntime`,
  `IdentityAdapter`, `CapabilityAdapter`, `StorageAdapter`, `CacheAdapter`
- `@reactive-lms/persistence`: LIS-shaped TypeORM entities, `0001` migration,
  `createPersistenceDataSource`

**Done when:** migrations apply to an empty Postgres and the unique
constraints exist; another package can import from `@reactive-lms/shared`.

**Guardrail:** dump the database and get an explicit OK before running
migrations against any shared database.

## 0.3.0 — Course container + HTML5

**Delivers:** package import (ZIP limits, antivirus hook), filesystem storage
outside the web root, course sections and modules, enrolment (`manual`,
`self`, `group`), launch, the HTML5 `postMessage` contract, event log, and
the first Angular player.

**Done when:** a section with one HTML5 module that posts `complete` marks the
module and section `completed`; a two-module section requires both.

## 0.4.0 — SCORM 1.2

**Delivers:** manifest parsing, CMI store with error codes, `window.API`
bridge, resume of `lesson_location` and `suspend_data`.

**Done when:** a known-good SCORM 1.2 sample launches, bookmarks, scores, and
completes, and a refresh resumes.

## 0.5.0 — xAPI LRS + cmi5

**Delivers:** statement and document resources, `cmi5.xml` import (1000+
AUs), one-time auth tokens, statement guard, `abandoned` handling, `moveOn`
and `satisfied` statements.

**Done when:** a cmi5 sample AU initializes, passes, terminates, and the
registration satisfies per `moveOn=Passed`.

## 0.6.0 — SCORM 2004 (CMI + linear navigation)

**Delivers:** `window.API_1484_11`, independent `completion_status` and
`success_status`, Next/Previous/TOC from the activity tree.

**Done when:** a SCORM 2004 sample without complex sequencing reports both
statuses independently.

## 0.7.0 — H5P

**Delivers:** `.h5p` import, shared libraries by `machineName-major.minor`,
iframe runtime, xAPI events forwarded into the LRS and progress.

**Done when:** an official multiple-choice sample records a score.

## 0.8.0 — LTI 1.3 Platform + Advantage

**Delivers:** deployment registry, OIDC login, resource-link launch, Deep
Linking 2.0, AGS 2.0, NRPS 2.0, single-use nonces.

**Done when:** an LTI 1.3 reference tool launches and posts a grade that
appears on the registration.

## 0.9.0 — Integration story

**Delivers**

- `ReactiveLmsModule.registerAsync` with a copy-paste host example
- Embeddable vs standalone migrations split
- Complete OpenAPI
- Packaged Angular library (`provideReactiveLms`), theme-free
- Standalone Angular + Tailwind demo
- Progress stream (SSE), accessibility pass on the player
- GDPR export/forget, section export, section report and transcript endpoints

**Done when:** a fresh clone can `bun install`, start standalone, and import
one package of each implemented type; a host app can add the Nest module and
Angular player without forking.

## 1.0.0 — First stable release

- Publish strategy executed (D4)
- Conformance fixtures green for every claimed format
- Security review: ZIP handling, token scoping, LTI key handling
- Docs: embedding guide, adapter guide, upgrade notes

## 1.1.0 — Portability

- Additional TypeORM drivers (D8) and `RedisCacheAdapter`
- Per-driver integration tests behind env flags

## Later

- SCORM 2004 sequencing and navigation engine (own plan; ADL conformance suite)
- Certificates (D6)
- S3/MinIO `StorageAdapter` (D3)

## Non-goals (v1)

Native quizzes/QTI, forums/assignments/calendar/chat, badges and competencies,
content bank, plugin themes/blocks/formats, authoring, marketplace/e-commerce,
social/gamification, built-in IdP, LIS SOAP/LDAP, LTI 1.1, LTI dynamic
registration/proctoring/Caliper, acting as an LTI Tool, Moodle `.mbz`,
multi-tenant billing, native mobile apps, AICC.

## Open design decisions

Recommendations are defaults, not agreements. Each blocks the milestone shown.

| #  | Decision | Blocks | Recommendation |
| -- | -------- | ------ | -------------- |
| D1 | **SCORM engine:** wrap `scorm-again` for the in-browser API object, or write our own. GROK_PLAN says both: wrap it, and also that `feature/lms-foundation` owns CMI in `shared`. That branch does not exist in this repo. | 0.4.0 | Wrap `scorm-again` for the browser API only; own the CMI store and persistence. |
| D2 | **Standalone admin UI:** minimal admin (upload, place modules, enrol, report) vs API plus a thin demo player. | 0.9.0 | Minimal admin; it's the only way to demo the full flow. |
| D3 | **Object storage:** filesystem only in v1, or also S3/MinIO. | 1.0.0 | Filesystem in v1; the adapter interface leaves room. |
| D4 | **Publish strategy:** private workspace via path references, or publish `@reactive-lms/*` to a registry. | 1.0.0 | Publish at 1.0.0; path references until then. |
| D5 | **Learning paths:** is `sort_order` + `availability_json` enough, or do we need a path entity. | 0.9.0 | Enough for v1. |
| D6 | **Certificates:** v1.1 or later. | post-1.0 | After 1.0; revisit on demand. |
| D7 | **Redis in standalone:** inject only, or bundled. | 1.1.0 | Inject only. |
| D8 | **Second database:** MySQL/MariaDB then SQLite, or another order. | 1.1.0 | MySQL/MariaDB, then SQLite for tests. |
| D9 | **Portable column types.** Plan constraints say "no Postgres-only types in entities," yet §4.1 specifies `jsonb` and `bytea`. | 0.2.0 | Use TypeORM `simple-json`/`json` and `blob`; keep native types in the Postgres migration only. |
| D10 | **Branch naming.** GROK_PLAN says `feature/...` from `dev` after confirmation; this repo currently merges `dev` straight to `main`. | 0.2.0 | Decide the convention before the first code PR. |

AICC is closed as out of scope. Angular version is closed by
`docs/TECHNOLOGY.md` (18+, standalone APIs).
