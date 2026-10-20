# ROADMAP

Release plan for ReactiveLMS, derived from [GROK_PLAN.md](GROK_PLAN.md).
The plan holds the detail (domain model, API surface, step lists); this file
holds the order, the exit criteria, and the decisions still open.

Status key: ✅ done · 🚧 in progress · ⬜ planned · ⏸ waiting · ❓ blocked on a decision

## Adopted packages

| Package | Role in ReactiveLMS | Where |
| ------- | ------------------- | ----- |
| `@richardmcquiston01/error-log-adapter` | Optional (D12): operational error logging behind an injected `ErrorLogAdapter`, with a built-in console fallback. Adapters never throw, which fits the "catch everything, exit gracefully" rule. `LmsError` maps onto `ErrorLogEntry` (`code`, `message`, `cause`, `source`). Host chooses the sink (console, webhook, Postgres, S3, ...). | 0.2.0 |
| `@richardmcquiston01/storage-adapters` | Small key-value state behind `CacheAdapter` (`memoryAdapter` in v1; its Postgres/other adapters and `withReadCache`/`withRetry` wrappers for later). Typed results with revisions suit cmi5 token and LTI nonce handling. | 0.3.0 / 1.1.0 |

Boundaries, so the two don't blur:

- **`event_log` (database) stays.** It is the product's audit trail (import,
  launch, grade, enrol, GDPR export). The error-log adapter is for operational
  failures and does not replace it.
- **Package files do not go through `storage-adapters`.** It is a string
  key-value contract (some backends cap values around 1 MB). Imported ZIPs,
  extracted trees, and H5P libraries need streaming binary I/O, so
  `BlobStorageAdapter` stays our own interface (D11).
- Both packages are Apache-2.0 and zero-dependency at the core. Our MIT
  license is unaffected; we depend on them, we don't redistribute them.

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
| 0.2.0   | Scaffold + contracts + schema | 0, 1, 2           | ⏸ waits for both packages at 1.0 |
| 0.3.0   | Course container + HTML5 + first admin screens | 3 | ⬜     |
| 0.4.0   | SCORM 1.2                   | 4                   | ⬜     |
| 0.5.0   | xAPI LRS + cmi5             | 5                   | ⬜     |
| 0.6.0   | SCORM 2004 (CMI, nav, sequencing spike) | 6a, 6b  | ⬜     |
| 0.7.0   | H5P                         | 7                   | ⬜     |
| 0.8.0   | LTI 1.3 Platform + Advantage| 8                   | ⬜     |
| 0.9.0   | Nest module, Angular player, standalone demo, reporting | 9, 10 | ⬜     |
| 1.0.0   | Hardening, docs, first stable release | —         | ⬜     |
| 1.1.0   | Multi-DB drivers, Redis cache | 11                | ❓ D8  |
| 1.2.0   | Reusable learning paths (D5)  | —                 | ⬜     |
| 1.3.0   | Built-in certificates (D6, option C) | —               | ⬜     |
| 1.4.0   | Open Badges 3.0 credentials (D6, option D) | —         | ⬜     |
| later   | SCORM 2004 sequencing, only if the 0.6.0 spike fails | 6b | ⬜     |

Order notes: after 0.3.0, the cmi5, SCORM 2004, H5P, and LTI work depends only
on the shared pipeline and can run in parallel; the order above is a default,
not a constraint. LTI depends only on the schema (PR 2).

## 0.1.0 — Foundation ✅

- Design spec, technology stack, implementation plan
- MIT license, README, CHANGELOG, funding metadata

## 0.2.0 — Scaffold, contracts, schema

**Delivers**

- Bun workspace with eight packages: `shared`, `persistence`, `core`, `nest`,
  `player`, `admin`, `standalone-api`, `standalone-web`
- `docs/STANDARDS.md` pinning exact spec versions
- `@richardmcquiston01/reactive-lms-shared`: enums, DTOs, `LmsError`, `ContentRuntime`,
  `IdentityAdapter`, `CapabilityAdapter`, `BlobStorageAdapter`, `CacheAdapter`
- Optional `@richardmcquiston01/error-log-adapter` support as the operational
  error sink (see [Adopted packages](#adopted-packages))
- `@richardmcquiston01/reactive-lms-persistence`: LIS-shaped TypeORM entities, `0001` migration,
  `createPersistenceDataSource`

**Done when:** migrations apply to an empty Postgres and the unique
constraints exist; another package can import from `@richardmcquiston01/reactive-lms-shared`.

**Guardrail:** dump the database and get an explicit OK before running
migrations against any shared database.

## 0.3.0 — Course container + HTML5

**Delivers:** package import (ZIP limits, antivirus hook), filesystem storage
outside the web root, course sections and modules, enrolment (`manual`,
`self`, `group`), launch, the HTML5 `postMessage` contract, event log, and
the first Angular player.

**Admin library (D2):** the first `@richardmcquiston01/reactive-lms-admin` screens ship here:
package upload, section and module placement, enrolment, and a basic section
progress view. The extension points (navigation token, replaceable screens,
content-projection slots, wrappable API client, `CapabilityAdapter`
permissions) exist from this release so they are exercised before more
formats arrive. `standalone-web` is a thin app composing `admin` and `player`.

**Module structure and conditions (D5, option B):** modules form a tree
through an optional `parent_module_id` (chapters or blocks), and
`availability_json` is a versioned condition list, for example
`{ version: 1, all: [...] }` with `any` also allowed. Condition types: previous
module complete, date window, minimum score, group membership. Conditions are
evaluated at launch, and the admin screens show the module tree. If 0.3.0
grows, the chapter tree may slip to 0.9.0; the condition list stays.

**Done when:** a section with one HTML5 module that posts `complete` marks the
module and section `completed`; a two-module section requires both; a module
with an unmet condition refuses to launch; and the
same flow works end to end through the admin screens in `standalone-web`; and
the filesystem `BlobStorageAdapter` passes the shared adapter conformance
suite (D3).

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

## 0.6.0 — SCORM 2004 (CMI, navigation, sequencing spike)

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
- Packaged Angular libraries (`provideReactiveLms`, `provideReactiveLmsAdmin`),
  both theme-free
- Admin screens extended for every implemented format, plus reports and
  transcripts
- Standalone Angular + Tailwind demo (Tailwind lives only here)
- Progress stream (SSE), accessibility pass on the player
- Completion events (D6, option B): `registration.completed`, module
  completion, and similar events delivered to the host through an injected
  event hook, so a host can issue its own certificates
- GDPR export/forget, section export, section report and transcript endpoints

**Done when:** a fresh clone can `bun install`, start standalone, and import
one package of each implemented type; a host app can add the Nest module and
Angular player without forking.

## 1.0.0 — First stable release

- Publish strategy executed: stable 1.0.0 published as `latest` (D4)
- S3-compatible `BlobStorageAdapter` (S3, MinIO, R2, Spaces), passing the
  shared adapter conformance suite (D3)
- Conformance fixtures green for every claimed format
- Security review: ZIP handling, token scoping, LTI key handling
- Docs: embedding guide, adapter guide, upgrade notes

## 1.1.0 — Portability

- Additional TypeORM drivers (D8) and `RedisCacheAdapter`
- Per-driver integration tests behind env flags

## 1.2.0 — Learning paths (D5, option C)

**Delivers:** a reusable, versioned `learning_path` entity with
`learning_path_item` rows, attached to `course_template`. The item structure
is the module tree and condition list from 0.3.0, extracted. A section either
links to a path version or keeps ad-hoc modules as before.

- Nullable `learning_path_id` (and pinned version) on `course_section`, so
  sections built in 0.3.0 keep working untouched
- Path API, admin screens, and section-to-path linking
- Intentional post-1.0 scope addition: GROK_PLAN listed learning paths as a
  non-goal for v1

**Done when:** one path is linked to two sections; editing the path publishes
a new version that sections can adopt; unlinked sections are unchanged.

## 1.3.0 — Built-in certificates (D6, option C)

**Delivers:** a certificate template per course or offering, issued on
completion, with a unique verification code and a public verification
endpoint. Optional expiry. Files stored through `BlobStorageAdapter`; admin
screens for templates; PDF output with a lightweight library such as
`pdf-lib` rather than a headless browser.

- GDPR: the learner's name on a certificate is PII, so "forget" must
  anonymise or revoke issued certificates; designed up front
- Intentional post-1.0 scope addition: certificates were a v1 non-goal

**Done when:** completing a section issues a certificate whose code verifies
at the public endpoint, and forgetting the learner anonymises it.

## 1.4.0 — Open Badges 3.0 credentials (D6, option D)

**Delivers:** signed, verifiable credentials built on the 1.3.0 issuing flow,
using the 1EdTech Open Badges 3.0 standard: issuer key management, credential
signing, and a verification path. Extends C; it does not replace it.

## Later

- SCORM 2004 sequencing, only if the 0.6.0 spike fails ADL conformance (own
  plan; no commercial engine unless the owner decides otherwise)

## Non-goals (v1)

Native quizzes/QTI, forums/assignments/calendar/chat, competencies,
content bank, plugin themes/blocks/formats, authoring, marketplace/e-commerce,
social/gamification, built-in IdP, LIS SOAP/LDAP, LTI 1.1, LTI dynamic
registration/proctoring/Caliper, acting as an LTI Tool, Moodle `.mbz`,
multi-tenant billing, native mobile apps, AICC.

## Open design decisions

Recommendations are defaults, not agreements. Each blocks the milestone shown.

| #  | Decision | Blocks | Recommendation |
| -- | -------- | ------ | -------------- |
| D7 | **Redis in standalone:** inject only, or bundled. | 1.1.0 | Inject only. |
| D8 | **Second database:** MySQL/MariaDB then SQLite, or another order. | 1.1.0 | MySQL/MariaDB, then SQLite for tests. |

### Decided

- **D11 — Own `BlobStorageAdapter`** (decided 2026-10-20). Package files
  (ZIPs, extracted trees, H5P libraries) go through a ReactiveLMS-owned
  streaming binary interface in `@richardmcquiston01/reactive-lms-shared`.
  `@richardmcquiston01/storage-adapters` is used only for small key-value
  state behind `CacheAdapter`. Revisit if that package gains a binary/stream
  adapter.
- **D12 — `error-log-adapter` is an optional dependency** (decided
  2026-10-20). `core` and `nest` code against an `ErrorLogAdapter` interface
  and run without the package installed, falling back to a built-in console
  logger. Hosts that want other sinks install the package and inject an
  adapter. Open detail: which sink standalone-api defaults to once the package
  is present (suggest console plus a rotating JSON file).
- **D13 — Start gate** (decided 2026-10-20). ReactiveLMS implementation
  (0.2.0) starts once both `@richardmcquiston01/storage-adapters` and
  `@richardmcquiston01/error-log-adapter` have stable 1.0 releases (currently
  0.20.0 and 0.15.0). No pre-1.0 version pinning or wrapping is needed as a
  result; depend on released 1.x versions.
- **D10 — Git workflow** (decided 2026-10-20, per the owner's git-workflow
  skill). Long-lived branches: `main` (production) and `dev` (development);
  there is no `staging` branch. New work goes on `feature/<name>` off `dev`
  and merges back to `dev` by PR; `dev` reaches `main` by PR. Fixes use
  `hotfix/<name>` off the affected branch and merge back to it; a hotfix off
  `main` is also merged into `dev`. PRs merge with a merge commit (no squash
  or rebase), `dev` is fast-forwarded to `main` after a promotion, and
  branches are not deleted after merging. Commits use Conventional Commits
  with a subject of 50 characters or fewer and a body that explains why.
  Supersedes the "after confirmation" wording in GROK_PLAN.md.
- **D1 — Standards support** (decided 2026-10-20). One `ContentRuntime`
  interface per format, mixing libraries with our own code. The server never
  trusts the browser for scoring or completion; it re-validates every commit.

  | Standard | Browser side | Server side (ours) |
  | -------- | ------------ | ------------------ |
  | SCORM 1.2 | `scorm-again` (MIT) | CMI validation and persistence |
  | SCORM 2004 | `scorm-again`, including its sequencing | Manifest parser feeding the activity tree and sequencing rules; CMI persistence |
  | xAPI | `@xapi/xapi` (MIT) | Own LRS |
  | cmi5 | Own launch and token flow, `@xapi/xapi` | `cmi5.xml` import, statement guard, `moveOn` |
  | H5P | `h5p-standalone` (MIT) | `.h5p` import; events forwarded to the LRS |
  | LTI 1.3 | Own platform | `jose` (MIT) for JWT/OIDC; own AGS, NRPS, Deep Linking |
  | HTML5 | Own `postMessage` contract | Own |

  Rules that follow from it:
  - `scorm-again` sits behind a thin wrapper in `core` (single-maintainer
    dependency; limits the blast radius).
  - No format is called supported until its fixture test is green; SCORM 1.2
    and 2004 also pass ADL conformance before release.
  - The 0.6.0 spike checks `scorm-again`'s sequencing against the ADL suite.
    If it fails, 2004 CMI and linear navigation still ship and sequencing
    moves to "Later".
  - H5P uses `h5p-standalone` only. `@lumieducation/h5p-server` is
    GPL-3.0-or-later and is excluded because this project is MIT.
  - Supersedes GROK_PLAN §13 question 3 and its reference to
    `feature/lms-foundation`, a branch that does not exist in this repo.
- **D2 — Admin UI as a reusable package** (decided 2026-10-20).
  `@richardmcquiston01/reactive-lms-admin` is an Angular 18+ library of admin screens, usable
  as-is or extended inside a larger app. It is theme-free: styling uses CSS
  custom properties, and Tailwind stays in `standalone-web` only. First
  screens ship in 0.3.0; later formats extend them. Extension points:
  - a navigation injection token to add or hide menu items
  - screens as standalone components that a host can replace through a token
  - content-projection slots (extra report columns, extra course tabs)
  - a typed API client service a host can wrap, for example to add auth
    headers
  - screen and action visibility through `CapabilityAdapter`
  Hosts embed it with `reactiveLmsAdminRoutes` and
  `provideReactiveLmsAdmin(config)`.
- **D9 — Portable column types** (decided 2026-10-20). Entities use
  TypeORM's portable column types: `json` / `simple-json` in place of
  `jsonb`, and `blob` in place of `bytea`. Native Postgres types (`jsonb`,
  `bytea`, UUID defaults) appear only in the Postgres migration. This keeps
  the entity set usable by the later MySQL/MariaDB and SQLite drivers (D8) and
  overrides the `jsonb` / `bytea` in GROK_PLAN §4.1.
- **D3 — Object storage** (decided 2026-10-20). Filesystem
  `BlobStorageAdapter` ships first; an S3-compatible adapter is a committed
  1.0.0 deliverable. Constraints that follow:
  - The contract is stream-based and key-based with prefix listing, and
    exposes no local file paths, so a second adapter drops in.
  - A shared adapter conformance suite ships with the filesystem adapter
    (0.3.0) and is the pass bar for S3.
  - SCORM and cmi5 content must be served from our origin, so the content
    controller streams objects through the API; no redirects to presigned
    URLs.
  - Extraction to S3 batches uploads, and serving caches small files, since
    packages are often hundreds of small objects.
- **D4 — Publish strategy** (decided 2026-10-20). Packages are published to
  public npm under the `@richardmcquiston01` scope, the same scope as
  `storage-adapters` and `error-log-adapter`. Names replace the
  `@reactive-lms/*` names used in GROK_PLAN.md:

  | Workspace package | npm name |
  | ----------------- | -------- |
  | `shared` | `@richardmcquiston01/reactive-lms-shared` |
  | `persistence` | `@richardmcquiston01/reactive-lms-persistence` |
  | `core` | `@richardmcquiston01/reactive-lms-core` |
  | `nest` | `@richardmcquiston01/reactive-lms-nest` |
  | `player` | `@richardmcquiston01/reactive-lms-player` |
  | `admin` | `@richardmcquiston01/reactive-lms-admin` |

  `standalone-api` and `standalone-web` are apps and stay private. Names for
  the six libraries were unused on npm when checked. Proposed, not yet
  confirmed: workspace path references through 0.2.0, `next`-tagged
  prereleases from 0.3.0, and 1.0.0 as the first `latest`, with independent
  per-package versioning (for example Changesets) and releases tagged from
  `main`.
- **D5 — Learning paths** (decided 2026-10-20). Build option B in 0.3.0,
  then option C in 1.2.0.
  - **B (0.3.0):** `parent_module_id` tree plus a versioned, all/any
    `availability_json` condition list; no path entity.
  - **C (1.2.0):** reusable `learning_path` entity, extracted from B's
    structure so nothing is discarded.
  - **Reuse semantics:** a section links live to a pinned path version, not a
    copy. Editing a path creates a new version; sections adopt it explicitly.
  - Overrides GROK_PLAN §13 question 8 and its "no separate path entity"
    default.
- **D6 — Certificates** (decided 2026-10-20). Staged path B, then C, then D.
  - **B (0.9.0):** completion events and transcript data for the host to
    issue its own certificates.
  - **C (1.3.0):** built-in certificates with verification codes, a public
    verification endpoint, and GDPR handling designed up front.
  - **D (1.4.0):** Open Badges 3.0 signed credentials, extending C.
  - Overrides GROK_PLAN §13 question 7 ("v1.1, not v1") and moves
    certificates and badges out of the v1 non-goals.

AICC is closed as out of scope. Angular version is closed by
`docs/TECHNOLOGY.md` (18+, standalone APIs).
