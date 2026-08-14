# ReactiveLMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript LMS that can run standalone or embed into an existing NestJS + TypeORM backend and Angular frontend, with first-class support for SCORM 1.2, SCORM 2004, xAPI, cmi5, HTML5 bundles, H5P, and LTI 1.3.

**Architecture:** A bun workspace monorepo. Domain contracts (interfaces, DTOs, enums) live in a shared library consumed by both backend and frontend. A course is a container of modules (Moodle/Chamilo/ILIAS model); imported packages are reusable content placed into those modules. Package-format adapters implement a common `ContentRuntime` contract so every format launches, tracks, and reports through one progress model. A NestJS module exposes REST + OpenAPI and can be imported into a host API. An Angular library provides the player, progress subscription, and launch surface.

**Tech Stack:** bun, TypeScript, NestJS, TypeORM, PostgreSQL first (multi-database later), Angular 18+ (standalone, RxJS), TailwindCSS + Angular Material for the demo UI, OpenAPI. Redis is a later cache backend behind a `CacheAdapter`, not a v1 dependency.

## Global Constraints

- Use `bun`, not `npm`, unless a specific tool cannot run under bun.
- 2-space indent, LF endings, trailing commas, soft margin 80.
- Document all public methods, types, and interfaces with JSDoc.
- Keep `*.test.ts` next to the file under test.
- Shared DTOs and interfaces live in `@reactive-lms/shared` — never duplicate them in API or Angular packages.
- REST URLs, JSON bodies, specific HTTP status codes, OpenAPI on every endpoint.
- TypeORM entities: singular PascalCase class names; singular `snake_case` tables; UUID primary keys; `created_at` and `updated_at` on every table; `created_by_user_id` and `updated_by_user_id` on user-modifiable tables.
- Multi-step writes run inside a database transaction.
- Conventional Commits (`type(scope): summary`), 50-character subject, body explains why.
- Feature work branches from `dev` as `feature/...` after user confirmation.
- Never commit `.env` files or secrets.
- Update `CHANGELOG.md` and `README.md` with every feature addition.
- Dump the database and check with the user before running migrations.
- Do not invent LMS features that are not required for standards conformance or host integration (no marketplace, e-commerce, social feed, or gamification in v1).
- Backend is TypeScript + NestJS + TypeORM (`docs/TECHNOLOGY.md`).
- Persistence v1 targets PostgreSQL. Do not write Postgres-only SQL into entities (no `pgcrypto`, no `jsonb`-only APIs in TypeScript). Driver-specific SQL belongs in the Postgres migration only. A later phase adds other TypeORM drivers (MySQL / MariaDB / SQLite) behind `createPersistenceDataSource`.
- Do not take a Redis dependency in v1. Cache through a `CacheAdapter` so Redis can be plugged in later.
- Standalone demo UI is Angular 18+, TailwindCSS, Angular Material, RxJS. `@reactive-lms/player` stays framework-thin (standalone components + RxJS) so a host Angular 18+ app can import it without pulling the demo theme.
- Shared Interfaces and DTOs live only in `@reactive-lms/shared` and must be usable from both frontend and backend.

---

## 1. Project understanding

The repo is greenfield. `docs/DESIGN_CONSIDERATIONS.md` is the product/standards spec. `docs/TECHNOLOGY.md` is the stack spec. `README.md` states the product intent: a fully fledged TypeScript LMS that runs standalone or integrates into another TypeScript project via shared library or HTTP.

The design doc requires all of the following at once:

1. **Dual deployment.** Standalone process *and* a NestJS module that drops into an existing TypeORM API.
2. **Angular launch surface.** The host frontend is Angular, so launch, runtime APIs, and progress updates must be consumable as an Angular library, not only as a standalone SPA.
3. **1EdTech / IMS Global alignment.** Domain language and interoperability follow 1EdTech specs (LTI, LIS concepts), not a one-off course schema.
4. **Multiple package types** through one import/launch/progress pipeline.
5. **Shared contracts.** Interfaces, models, and services that both frontend and backend can import.
6. **TypeORM migrations** that can be applied to an existing host database.

The Docebo checklist linked from the design doc is a *vendor selection* list (social, marketplace, white-label, e-commerce). Those items are out of scope for v1 unless they are implied by the six requirements above. What *is* in scope from that list: standards playback (SCORM / xAPI / cmi5), content import/export, progress analytics, accessibility of the player, and integration via API.

### 1.1 How the linked standards map onto this product

| Standard | Role in ReactiveLMS | What we must implement |
| --- | --- | --- |
| **SCORM 1.2** | Packaged web content | Import ZIP + `imsmanifest.xml`; launch one SCO in a browser frame; expose `window.API` with `LMSInitialize` / `LMSGetValue` / `LMSSetValue` / `LMSCommit` / `LMSFinish`; persist CMI `cmi.core.*` data |
| **SCORM 2004** | Packaged web content + sequencing | Same packaging shape; expose `window.API_1484_11` with `Initialize` / `GetValue` / `SetValue` / `Commit` / `Terminate`; persist `cmi.*` (completion and success are separate); apply Sequencing and Navigation (SN) rules from the manifest |
| **xAPI 1.0.3** | Learning record transport | An LRS: Statement, State, Activity, Agent, Agent Profile, Activity Profile, About resources; JSON statements are immutable except via voiding |
| **cmi5 Quartz** | xAPI profile for LMS-launched courses | Import `cmi5.xml` course structure; launch AU with `endpoint`, `fetch`, `actor`, `registration`, `activityId`; one-time auth-token fetch; LMS-issued `launched` / `abandoned` / `waived` / `satisfied` statements; AU-issued `initialized` / `completed` / `passed` / `failed` / `terminated`; LMS **is** an LRS |
| **HTML5 bundle** | Non-standard static package | ZIP of static assets + optional `index.html`; launch in a sandboxed frame; optional `postMessage` progress contract documented by us |
| **H5P** | Interactive HTML5 content | Import `.h5p` (ZIP) with `h5p.json`, `content/content.json`, and library folders; run an H5P player; map H5P xAPI events onto our LRS / progress model |
| **LTI 1.3 + Advantage** | Remote tool launch | This product is an **LTI Platform**: OIDC third-party-initiated login, JWT resource launch, Deep Linking 2.0, Assignment and Grade Services 2.0, Names and Role Provisioning 2.0 |
| **LIS 2.0.1** | People / courses / memberships / outcomes | Adopt LIS *information model* as our domain (Person, Group, Membership, CourseTemplate / CourseOffering / CourseSection, LineItem / Result). Expose it as REST + TypeORM, not SOAP/WSDL, in v1 |

### 1.2 Dual-mode implication

The host already has users, auth, and likely its own `user` table. ReactiveLMS must not own identity. It consumes a `LearnerRef` (external user id + display name + optional account homepage) supplied by the host. Standalone mode ships a thin identity adapter so the product can run without a host.

### 1.3 Why a shared library is the integration spine

DESIGN_CONSIDERATIONS says interfaces, models, and services belong in a shared library. That is the correct cut:

- The Angular player needs the same `Attempt`, `LaunchSession`, `NormalizedProgress`, and package-type enums the API persists.
- A host NestJS app needs TypeORM entities and a `ReactiveLmsModule.register(...)` that reuses those types.
- A host that only wants HTTP still talks the same DTO shapes documented in OpenAPI, generated from the shared types.

### 1.4 Lessons from PHP open-source LMS platforms

The design doc is standards-first. Mature PHP LMS projects show what else has to exist around those standards or the product is not usable as an LMS. These were reviewed: **Moodle** (plugin architecture, roles, gradebook, completion), **Chamilo** (sessions, learning paths, SIS API, cmi5/LTI/SCORM), **ILIAS** (repository objects, SCORM 1.2/2004, xAPI/cmi5, QTI, LOM), and **Forma LMS** (corporate catalog, certificates, rule-based enrolment). Gibbon/RosarioSIS were set aside: they are school information systems with some learning bolted on, not LMS engines.

What every one of them does, and we must do too:

| Idea | Where it shows up | What it means for ReactiveLMS |
| --- | --- | --- |
| **Course is a container, not a package** | Moodle `course_modules`; Chamilo learning path items; ILIAS repository objects | A `course_section` holds many `course_module` rows. A SCORM ZIP, an H5P, an LTI tool, and an HTML5 bundle can sit in the same course. A package is *reusable content*, not the course itself. |
| **Identity and SIS live next door** | Moodle auth/enrol plugins; Chamilo HR/SIS/ERP API; AOSA Moodle chapter | We already inject `IdentityAdapter`. Add `EnrolmentAdapter` so a host SIS can push/pull memberships. Do not become a student information system. |
| **Enrolment is a method, not a row** | Moodle `enrol_*` plugins; Forma rule-based enrolment; Chamilo sessions | Support at least `manual`, `self`, `group` (LIS Group), and `host_sync`. The `membership` / `registration` row is the *result* of a method. |
| **Roles are contextual** | Moodle contexts (system → category → course → module) + capabilities | Host RBAC is the source of truth. Expose a `CapabilityAdapter` (`can(learner, action, resource)`). Standalone ships a small role set: administrator, instructor, learner. |
| **Completion ≠ grade** | Moodle activity completion vs gradebook; SCORM 2004 split | Keep `completion_status` and `success_status` separate (already planned). Course completion is a *rule* over module completions, not “the package said completed”. |
| **Conditional access** | Moodle availability conditions; Chamilo learning-path prerequisites | Each `course_module` can require a previous module completed, a date window, and optionally a minimum score. |
| **Sessions / offerings reuse a course** | Chamilo sessions; LIS CourseOffering; Forma catalogs | Keep `course_template` + `course_offering`. An offering is a dated run of the same structure with its own enrolments and transcripts. |
| **Files live outside the app and the DB** | Moodle `$CFG->dataroot`; Chamilo `var/` | `StorageAdapter` writes under a dataroot that is **not** web-served except through an authorized content controller. Antivirus hook on upload. ZIP bomb limits. |
| **Everything important is an event** | Moodle logstore; Chamilo analytics/audit | `rlms_event_log` for import, launch, commit, grade, enrol, waive, delete. Reports and GDPR export read this. |
| **Backup / migrate courses** | Moodle `.mbz`; Chamilo course export + Moodle import | v1: export/import a section as JSON + the original packages. Full Moodle-compatible backup is out of scope. |
| **Table prefix in a shared database** | Moodle `mdl_`; every embeddable PHP LMS | Already decided: `rlms_`. |

What they all have that we still treat as later (not v1), because DESIGN_CONSIDERATIONS does not require a full campus VLE:

- Native quiz / QTI question bank (Chamilo 20+ types, ILIAS tests, Moodle `qtype`)
- Forums, assignments, attendance, surveys, calendar, chat
- Certificates, badges, competencies / learning plans (Forma, Chamilo, Moodle CBE)
- Content bank as a site-wide reusable library (Moodle 3.9+ H5P bank)
- Themes, blocks, course formats as plugin types
- Social, e-commerce, marketplace, gamification

**Architectural correction vs the first draft of this plan:** do not map `course_section` 1:1 to a `content_package`. That is how a content *player* is built, not how Moodle, Chamilo, or ILIAS model a course. Import still produces a package + activity tree. An instructor (or the host) then *places* that package — or one of its nodes — into a section as a `course_module`. A one-package course is just a section with a single module.

### 1.5 Constraints from `docs/TECHNOLOGY.md`

That file is short and binding. It does not add LMS features; it locks the stack.

| TECHNOLOGY.md | How the plan treats it |
| --- | --- |
| TypeScript backend, NestJS or similar, TypeORM | NestJS is the backend. `@reactive-lms/nest` is the embeddable module; `@reactive-lms/standalone-api` boots it. |
| Postgres to start, multiple database types later | v1 DataSource is Postgres. Entities stay driver-agnostic. Postgres-specific DDL (UUID default, `jsonb`) lives only in `0001-initial-schema.ts`. Later: additional TypeORM drivers selected by connection URL / `type` option. Do not sprinkle `pg` types through core. |
| Redis caching down the line | v1 is correct without Redis. Introduce `CacheAdapter` (`get` / `set` / `del` / `setNx`) with an in-memory implementation. Redis becomes a second adapter when the host needs shared cache (LTI nonces, cmi5 one-time tokens, CMI commit coalescing, LRS query cache). |
| Angular 18+ demo | `@reactive-lms/standalone-web` and `@reactive-lms/player` target Angular **18 or newer**, standalone APIs. No NgModule compatibility layer unless a host asks. Open question 1 is closed. |
| TailwindCSS + Google Material | Demo chrome only (`standalone-web`): layout, catalog, enrol, reports. Player chrome may use Tailwind utility classes; do not force Angular Material into a host app that imports `@reactive-lms/player`. |
| RxJS | `ReactiveLmsProgressService.watch()` returns `Observable<NormalizedProgress>`. No Zone-free rewrite in v1. |
| Shared interfaces / DTOs useful on frontend and backend | Already the monorepo spine. `@reactive-lms/shared` must stay free of Nest, TypeORM, Angular, Redis, and Tailwind. |

---

## 2. Recommended approach

Three approaches were considered:

**A. Thin wrapper around a commercial engine (Rustici Engine, SCORM Cloud).** Fastest SCORM/xAPI conformance, but it fights the “TypeScript package we own and can embed in our NestJS API” requirement, adds a runtime dependency we do not control, and does not give us a shared TypeORM schema.

**B. One monolith that reimplements every standard from scratch, including SCORM 2004 sequencing and a full LRS.** Highest control, but SCORM sequencing is measured in developer-years. Shipping nothing until SN is complete delays every other format.

**C. Shared-contract monorepo with adapters, and borrow only the hard, well-tested runtimes.** Own the domain, persistence, launch orchestration, NestJS module, and Angular player. Use a battle-tested open SCORM runtime (for example `scorm-again`) behind our `ContentRuntime` interface. Implement the LRS and cmi5 ourselves (they are REST + JSON and map cleanly to TypeORM). Use an H5P player (for example `@lumieducation/h5p-webcomponents` / `h5p-standalone`) behind the same interface. Implement LTI 1.3 as Platform ourselves with `jose` for JWT/OIDC.

**Recommendation: C.** It matches the design doc, keeps the shared library honest, and sequences risk: HTML5 and SCORM 1.2 prove the pipeline before cmi5, H5P, LTI, and SCORM 2004 sequencing.

---

## 3. Repository layout

```
reactive-lms/
  package.json                 # bun workspaces root
  bun.lock
  tsconfig.base.json
  .env.example
  CHANGELOG.md
  README.md
  GROK_PLAN.md
  docs/
    DESIGN_CONSIDERATIONS.md
    STANDARDS.md               # short map of spec versions we implement
  packages/
    shared/                    # @reactive-lms/shared
      src/
        index.ts
        enums/
        dto/
        models/
        errors/
        contracts/             # ContentRuntime, ProgressSink, IdentityAdapter
    persistence/               # @reactive-lms/persistence
      src/
        entities/
        migrations/
        repositories/
    core/                      # @reactive-lms/core
      src/
        import/
        launch/
        progress/
        runtimes/              # one folder per package type
        lrs/
        lti/
        lis/
    nest/                      # @reactive-lms/nest
      src/
        reactive-lms.module.ts
        controllers/
        guards/
    player/                    # @reactive-lms/player (Angular library)
      src/
        launch/
        runtimes/
        progress/
    standalone-api/            # @reactive-lms/standalone-api
      src/
        main.ts
        app.module.ts
        identity/              # local user adapter for standalone mode
    standalone-web/            # @reactive-lms/standalone-web (Angular app)
      src/
        app/
```

Responsibilities:

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `shared` | Enums, DTOs, error codes, `ContentRuntime` contract, LIS-shaped models. No Nest, no Angular, no TypeORM. | nothing |
| `persistence` | TypeORM entities, repositories, migrations | `shared` |
| `core` | Import, launch, progress rollup, LRS, LTI platform, runtimes | `shared`, `persistence` |
| `nest` | NestJS Dynamic Module, controllers, OpenAPI, guards that call the host `IdentityAdapter` | `core` |
| `player` | Angular standalone components + services that launch content and stream progress | `shared` |
| `standalone-api` | Bootstraps `ReactiveLmsModule` with a local identity adapter and local file storage | `nest` |
| `standalone-web` | Demo Angular app that imports `@reactive-lms/player` | `player` |

Files that change together stay together: each runtime (`scorm12`, `scorm2004`, `xapi`, `cmi5`, `html5`, `h5p`, `lti`) has a `core` adapter and a `player` counterpart that share types from `shared`.

---

## 4. Domain model

The domain follows LIS 2.0.1 names so a later SOAP/OneRoster adapter has somewhere to land. Persistence uses the database conventions in section Global Constraints.

### 4.1 Core entities

```
person                  # host-mapped learner/instructor; we do not store passwords
  id uuid pk
  external_id text unique not null   # host user id
  display_name text
  account_homepage text              # xAPI Agent account.homePage
  account_name text                  # xAPI Agent account.name (defaults to external_id)
  email text
  created_at / updated_at
  created_by_user_id / updated_by_user_id

group                   # LIS Group; org unit or cohort
  id, code, title, parent_group_id
  created_at / updated_at / audit columns

membership              # person <-> group or person <-> course_section
  id, person_id, collection_type, collection_id, role
  # role: learner | instructor | administrator | content_developer
  created_at / updated_at / audit columns

course_template         # LIS CourseTemplate — the catalog item
  id, code, title, description
  created_at / updated_at / audit columns

course_offering         # a scheduled instance of a template
  id, course_template_id, title, starts_at, ends_at
  created_at / updated_at / audit columns

course_category         # catalog grouping (Moodle category / Forma catalog)
  id, parent_id, title, sort_order
  created_at / updated_at / audit columns

course_section          # enrollable unit (Chamilo session class / LIS CourseSection)
  id, course_offering_id, course_category_id, title
  completion_rule jsonb
    # { allModules: true } | { anyOf: [moduleId…] } | { minCompleted: n }
  created_at / updated_at / audit columns

course_module           # one activity placed in a section (Moodle course_modules)
  id
  course_section_id
  content_package_id              # reusable imported package
  activity_node_id                # null = launch package entry; else a specific SCO/AU
  title text                      # override of package/node title
  sort_order int
  availability_json jsonb         # { afterModuleId, availableFrom, availableUntil, minScore }
  created_at / updated_at / audit columns

enrolment_method        # how people get into the section (Moodle enrol plugins)
  id, course_section_id
  method text                     # manual | self | group | host_sync
  config_json jsonb               # e.g. { groupId, openFrom, openUntil, requiresKey }
  is_enabled boolean
  created_at / updated_at / audit columns

content_package
  id uuid pk
  package_type text not null
    # scorm_12 | scorm_2004 | xapi | cmi5 | html5 | h5p | lti
  title text not null
  version text
  entry_href text                 # relative path or remote URL (LTI)
  storage_key text not null       # original ZIP / .h5p location
  extracted_key text              # extracted static root
  manifest_json jsonb not null    # parsed, format-specific tree
  checksum_sha256 text
  created_at / updated_at / audit columns

activity_node           # flattened activity tree (SCO / AU / H5P item / LTI resource)
  id
  content_package_id
  parent_id
  publisher_id text               # cmi5 publisherId or SCORM item identifier
  activity_iri text               # LMS-generated IRI used at runtime
  title text
  href text
  sort_order int
  metadata_json jsonb             # moveOn, masteryScore, launchMethod, sequencing
  created_at / updated_at

registration            # one person enrolled on one course_section
  id
  person_id
  course_section_id
  enrolment_method_id
  status text                     # not_started | in_progress | completed | passed | failed | waived
  score_scaled numeric
  duration_iso8601 text
  created_at / updated_at / audit columns
  unique (person_id, course_section_id)

attempt                 # one launch session against one course_module
  id
  registration_id
  course_module_id
  activity_node_id
  session_id text unique          # cmi5 session id; also used by SCORM
  launch_mode text                # Normal | Browse | Review
  started_at timestamptz
  ended_at timestamptz
  termination text                # terminated | abandoned | still_open
  created_at / updated_at

normalized_progress     # rolled-up per module (and node) per registration
  id
  registration_id
  course_module_id
  activity_node_id
  completion_status text          # unknown | not_attempted | incomplete | completed
  success_status text             # unknown | passed | failed
  score_scaled numeric
  score_raw numeric
  score_min numeric
  score_max numeric
  progress_measure numeric        # 0..1
  location text                   # bookmark
  total_time_iso8601 text
  suspend_data text
  extras_json jsonb               # raw CMI / xAPI leftovers
  updated_at

line_item               # LIS / LTI AGS gradebook column
  id, course_section_id, course_module_id, activity_node_id, label, score_maximum, resource_id, tag
  created_at / updated_at / audit columns

result                  # LIS / LTI AGS score for a person on a line_item
  id, line_item_id, person_id, score_given, score_maximum, activity_progress, grading_progress
  created_at / updated_at / audit columns

xapi_statement          # LRS
  id uuid pk                      # statement id, immutable
  registration_id
  attempt_id
  actor_json jsonb
  verb_iri text
  object_json jsonb
  result_json jsonb
  context_json jsonb
  timestamp timestamptz
  stored_at timestamptz
  authority_json jsonb
  voided boolean default false
  raw_json jsonb not null
  created_at

xapi_document           # State / Agent Profile / Activity Profile
  id
  document_kind text              # state | agent_profile | activity_profile
  activity_iri text
  agent_json jsonb
  registration_id
  state_id text
  profile_id text
  content_type text
  body bytea
  etag text
  updated_at
  unique document key per xAPI rules

lti_platform_deployment
  id, issuer, client_id, deployment_id
  auth_login_url, auth_token_url, jwks_url
  tool_jwks_json, platform_key_id
  created_at / updated_at / audit columns

lti_launch_nonce
  id, nonce, expires_at            # replay protection

event_log                 # Moodle logstore / Chamilo audit
  id
  person_id
  action text                     # package.imported | launch.started | ...
  subject_type text
  subject_id uuid
  payload_json jsonb
  created_at
```

### 4.2 Shared TypeScript contracts

These live in `packages/shared` and are the only types the Angular player and a host app are allowed to depend on.

```ts
export type PackageType =
  | 'scorm_12'
  | 'scorm_2004'
  | 'xapi'
  | 'cmi5'
  | 'html5'
  | 'h5p'
  | 'lti';

export interface LearnerRef {
  externalId: string;
  displayName: string;
  accountHomepage?: string;
  accountName?: string;
  email?: string;
}

export interface IdentityAdapter {
  resolveLearner(request: unknown): Promise<LearnerRef>;
}

export type LmsAction =
  | 'package.import'
  | 'package.delete'
  | 'section.manage'
  | 'module.manage'
  | 'enrol.manage'
  | 'launch'
  | 'grade.view'
  | 'grade.override'
  | 'report.view'
  | 'lti.manage';

export interface CapabilityAdapter {
  can(
    learner: LearnerRef,
    action: LmsAction,
    resource: { type: string; id: string },
  ): Promise<boolean>;
}

export interface EnrolmentAdapter {
  /**
   * Host SIS may create, update, or deactivate memberships.
   * Return null to let ReactiveLMS own enrolment itself.
   */
  syncSection?(sectionId: string): Promise<void>;
}

export interface StorageAdapter {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  getPublicUrl(key: string): Promise<string>;
  extractZip(key: string, destPrefix: string): Promise<string[]>;
}

export interface CacheAdapter {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic set-if-not-exists. Used later for cmi5 one-time tokens and LTI nonces. */
  setNx(key: string, value: string, ttlMs?: number): Promise<boolean>;
}

export interface NormalizedProgress {
  registrationId: string;
  courseModuleId: string;
  activityNodeId: string;
  completionStatus: 'unknown' | 'not_attempted' | 'incomplete' | 'completed';
  successStatus: 'unknown' | 'passed' | 'failed';
  scoreScaled?: number;
  scoreRaw?: number;
  scoreMin?: number;
  scoreMax?: number;
  progressMeasure?: number;
  location?: string;
  totalTime?: string;
  suspendData?: string;
}

export interface LaunchRequest {
  registrationId: string;
  courseModuleId: string;
  activityNodeId?: string;
  learner: LearnerRef;
  launchMode: 'Normal' | 'Browse' | 'Review';
}

export interface LaunchDescriptor {
  attemptId: string;
  sessionId: string;
  packageType: PackageType;
  playerKind:
    | 'iframe'
    | 'scorm-frame'
    | 'h5p'
    | 'lti-redirect'
    | 'xapi-au';
  contentUrl: string;
  runtimeConfig: Record<string, unknown>;
}

export interface ContentRuntime {
  readonly packageType: PackageType;
  detect(files: PackageFileIndex): Promise<boolean>;
  parse(files: PackageFileIndex): Promise<ParsedPackage>;
  createLaunch(request: LaunchRequest): Promise<LaunchDescriptor>;
}

export interface ProgressSink {
  upsert(progress: NormalizedProgress): Promise<void>;
}
```

Every runtime writes progress only through `ProgressSink`. That is how SCORM CMI, cmi5 statements, H5P xAPI events, HTML5 `postMessage`, and LTI AGS scores become one registration status.

---

## 5. Runtime architecture

### 5.1 Import pipeline

```
upload ZIP / .h5p / cmi5.xml / LTI tool URL
        │
        ▼
  detect() across runtimes in priority order
  (cmi5.xml → cmi5; imsmanifest.xml + schemaversion → SCORM;
   tincan.xml → xapi; h5p.json → h5p; index.html → html5;
   explicit LTI registration → lti)
        │
        ▼
  parse() → ContentPackage + ActivityNode tree
        │
        ▼
  store original + extracted files via StorageAdapter
        │
        ▼
  persist entities in one transaction
```

Detection must be deterministic. A cmi5 package is a ZIP whose root contains `cmi5.xml`. A SCORM package is a ZIP whose root contains `imsmanifest.xml`. Schema version in the manifest distinguishes 1.2 (`1.2`) from 2004 (`CAM 1.3` / `2004 3rd Edition` / `2004 4th Edition`). An xAPI-only package often ships `tincan.xml`. H5P is a ZIP (extension `.h5p`) with `h5p.json`. HTML5 is the fallback when `index.html` exists and no other marker does.

### 5.2 Launch pipeline

1. Host (or standalone web) calls `POST /registrations/:id/launches` with a `courseModuleId` (and optional `activityNodeId` for a specific SCO/AU).
2. Core loads registration, `course_module`, package, and activity node. Refuse launch if `availability_json` is not satisfied.
3. If a previous attempt for that registration is still open, the runtime closes it (`abandoned` for cmi5; `cmi.exit = time-out` semantics for SCORM).
4. Runtime creates an `attempt` + `session_id` and returns a `LaunchDescriptor`.
5. Angular `@reactive-lms/player` renders the matching player:
   - **SCORM:** parent window installs `window.API` or `window.API_1484_11`, then loads the SCO in an iframe. The SCO walks `window.parent` / `window.top` to find the API (standard findAPI algorithm).
   - **cmi5 / xAPI AU:** redirect or iframe the AU URL with the required query string; AU POSTs to `fetch` for the one-time token, then talks to the LRS.
   - **H5P:** H5P player web component, `xAPI` events forwarded to `ProgressSink` and optionally the LRS.
   - **HTML5:** sandboxed iframe; listen for a documented `postMessage` schema.
   - **LTI:** browser POST/redirect through OIDC login initiation to the tool.

### 5.3 Progress rollup

`registration.status` is derived from **course completion rules** over `course_module` progress, never written by a runtime directly. A single package saying `completed` only completes that module. The section completes when `completion_rule` is satisfied (default: every required module completed, and success if every module that reports success has passed).

| Source event | completion | success | registration.status |
| --- | --- | --- | --- |
| SCORM 1.2 `cmi.core.lesson_status=completed` | completed | unchanged | `completed` unless score implies pass/fail |
| SCORM 1.2 `passed` / `failed` | completed | passed/failed | `passed` / `failed` |
| SCORM 2004 `cmi.completion_status` + `cmi.success_status` | as reported | as reported | success wins if present |
| cmi5 `completed` | completed | — | `completed` until passed/failed |
| cmi5 `passed` / `failed` | — | passed/failed | per AU `moveOn` |
| cmi5 `waived` | treated as satisfied | — | `waived` |
| H5P `answered` / `completed` xAPI | from result.completion | from result.success | same as xAPI |
| LTI AGS score | from `activityProgress` | from `gradingProgress` + score | mapped to LIS Result |

cmi5 `moveOn` values (`Passed`, `Completed`, `CompletedAndPassed`, `CompletedOrPassed`, `NotApplicable`) are applied in `core/progress/move-on.ts` and are what set `registration.status` to a satisfied state. The LMS then emits a `satisfied` statement for the AU and walks parent blocks.

### 5.4 SCORM runtime notes

- SCORM 1.2 API object name: `API`. Methods: `LMSInitialize`, `LMSFinish`, `LMSGetValue`, `LMSSetValue`, `LMSCommit`, `LMSGetLastError`, `LMSGetErrorString`, `LMSGetDiagnostic`.
- SCORM 2004 API object name: `API_1484_11`. Methods: `Initialize`, `Terminate`, `GetValue`, `SetValue`, `Commit`, `GetLastError`, `GetErrorString`, `GetDiagnostic`.
- Only one SCO is launched at a time.
- `Commit` is debounced to the server (every successful `SetValue` of status/score/location/suspend_data should eventually persist; do not write the DB on every character of `cmi.suspend_data`).
- SCORM 2004 sequencing (prerequisites, rollup, choice/flow, randomize, remediation) is a later phase. v1 of 2004 support is: parse the activity tree, launch a single SCO, persist the 2004 CMI model, honor simple `imsld`/`adlseq` flow = true linear next/previous. Full SN is Phase 6.

### 5.5 xAPI LRS notes

Implement xAPI 1.0.3 resources under `/xapi`:

| Resource | Methods |
| --- | --- |
| `/xapi/statements` | PUT, POST, GET, HEAD |
| `/xapi/activities/state` | PUT, POST, GET, DELETE, HEAD |
| `/xapi/agents` | GET, HEAD |
| `/xapi/activities` | GET, HEAD |
| `/xapi/agents/profile` | PUT, POST, GET, DELETE, HEAD |
| `/xapi/activities/profile` | PUT, POST, GET, DELETE, HEAD |
| `/xapi/about` | GET, HEAD |

Statements are immutable. Voiding inserts a new statement with verb `http://adlnet.gov/expapi/verbs/voided` and sets `voided = true` on the target. cmi5 AUs MUST NOT be given credentials that can void.

Concurrency on documents uses `If-Match` / `If-None-Match` etags.

cmi5 launch `fetch` URL is **not** an xAPI resource. It is `POST /cmi5/sessions/:sessionId/token`, one-time, returns `{ "auth-token": "..." }` or `{ "error-code": "1"|"2"|"3", "error-text": "..." }`.

### 5.6 LTI 1.3 platform notes

ReactiveLMS is the Platform, not the Tool.

Minimum viable LTI Advantage:

1. Manual tool registration (issuer, client_id, deployment_id, URLs, JWKS).
2. OIDC third-party-initiated login.
3. Resource link launch JWT (`https://purl.imsglobal.org/spec/lti/claim/message_type` = `LtiResourceLinkRequest`).
4. Deep Linking 2.0 so an instructor can pick a tool resource and store the returned `url` as an `activity_node.href`.
5. AGS 2.0 so the tool can create line items and post scores into `line_item` / `result`.
6. NRPS 2.0 so the tool can list memberships of a `course_section`.

Dynamic Registration, Submission Review, Proctoring, and Caliper are out of v1.

### 5.7 Angular player and standalone demo

`@reactive-lms/player` (Angular **18+**, standalone APIs, RxJS) exports:

- `provideReactiveLms({ apiBaseUrl, getAccessToken })`
- `<rlms-player [registrationId] [courseModuleId] />`
- `ReactiveLmsProgressService.watch(registrationId): Observable<NormalizedProgress>`

The player never talks to TypeORM. It only uses the REST API and the shared DTOs. It must not import Tailwind config or Angular Material so a host app can theme it.

`@reactive-lms/standalone-web` is the demo app from `docs/TECHNOLOGY.md`: Angular 18+, TailwindCSS, Angular Material. It owns catalog, enrol, and report chrome. The player is embedded inside it.

Launch for SCORM must happen from a real browsing context that can set `window.API` on the parent of the SCO iframe. That component lives in the Angular library, not in the NestJS API.

### 5.8 NestJS embedding

```ts
ReactiveLmsModule.registerAsync({
  imports: [AuthModule],
  useFactory: (auth: HostAuthService) => ({
    identityAdapter: {
      resolveLearner: (req) => auth.toLearnerRef(req),
    },
    capabilityAdapter: {
      can: (learner, action, resource) =>
        auth.can(learner, action, resource),
    },
    storageAdapter: new FilesystemStorageAdapter(process.env.RLMS_STORAGE),
    cacheAdapter: new MemoryCacheAdapter(),
    routePrefix: 'lms',
  }),
  inject: [HostAuthService],
});
```

The module:

- registers TypeORM entities with the host `TypeOrmModule.forRoot` via `forFeature`
- ships migrations in `packages/persistence/src/migrations` that the host runs with its existing DataSource
- mounts controllers under the configured prefix
- does not register its own Passport strategy; it calls `IdentityAdapter`

Standalone mode is the same module plus a local JWT identity adapter and a local `user` table that is **not** part of the embeddable migration set.

---

## 6. File map (first implementation cut)

Create these files. Later tasks fill them; do not invent parallel trees.

**shared**

- `packages/shared/src/enums/package-type.ts`
- `packages/shared/src/enums/registration-status.ts`
- `packages/shared/src/models/learner-ref.ts`
- `packages/shared/src/models/normalized-progress.ts`
- `packages/shared/src/models/launch.ts`
- `packages/shared/src/contracts/content-runtime.ts`
- `packages/shared/src/contracts/identity-adapter.ts`
- `packages/shared/src/contracts/capability-adapter.ts`
- `packages/shared/src/contracts/enrolment-adapter.ts`
- `packages/shared/src/contracts/storage-adapter.ts`
- `packages/shared/src/contracts/cache-adapter.ts`
- `packages/shared/src/dto/content-package.dto.ts`
- `packages/shared/src/dto/registration.dto.ts`
- `packages/shared/src/dto/launch.dto.ts`
- `packages/shared/src/errors/lms-error.ts`
- `packages/shared/src/index.ts`

**persistence**

- `packages/persistence/src/entities/person.entity.ts`
- `packages/persistence/src/entities/group.entity.ts`
- `packages/persistence/src/entities/membership.entity.ts`
- `packages/persistence/src/entities/course-template.entity.ts`
- `packages/persistence/src/entities/course-offering.entity.ts`
- `packages/persistence/src/entities/course-category.entity.ts`
- `packages/persistence/src/entities/course-section.entity.ts`
- `packages/persistence/src/entities/course-module.entity.ts`
- `packages/persistence/src/entities/enrolment-method.entity.ts`
- `packages/persistence/src/entities/event-log.entity.ts`
- `packages/persistence/src/entities/content-package.entity.ts`
- `packages/persistence/src/entities/activity-node.entity.ts`
- `packages/persistence/src/entities/registration.entity.ts`
- `packages/persistence/src/entities/attempt.entity.ts`
- `packages/persistence/src/entities/normalized-progress.entity.ts`
- `packages/persistence/src/entities/line-item.entity.ts`
- `packages/persistence/src/entities/result.entity.ts`
- `packages/persistence/src/entities/xapi-statement.entity.ts`
- `packages/persistence/src/entities/xapi-document.entity.ts`
- `packages/persistence/src/entities/lti-platform-deployment.entity.ts`
- `packages/persistence/src/entities/lti-launch-nonce.entity.ts`
- `packages/persistence/src/migrations/0001-initial-schema.ts`
- `packages/persistence/src/data-source.ts`

**core**

- `packages/core/src/import/package-importer.ts`
- `packages/core/src/import/detect-package-type.ts`
- `packages/core/src/launch/launch-service.ts`
- `packages/core/src/launch/availability.ts`
- `packages/core/src/enrolment/enrolment-service.ts`
- `packages/core/src/progress/progress-sink.ts`
- `packages/core/src/progress/course-completion.ts`
- `packages/core/src/progress/move-on.ts`
- `packages/core/src/audit/event-log.service.ts`
- `packages/core/src/runtimes/html5/html5-runtime.ts`
- `packages/core/src/runtimes/scorm/parse-imsmanifest.ts`
- `packages/core/src/runtimes/scorm/scorm-12-runtime.ts`
- `packages/core/src/runtimes/scorm/scorm-2004-runtime.ts`
- `packages/core/src/runtimes/scorm/cmi-store.ts`
- `packages/core/src/runtimes/xapi/lrs-service.ts`
- `packages/core/src/runtimes/cmi5/parse-cmi5-xml.ts`
- `packages/core/src/runtimes/cmi5/cmi5-runtime.ts`
- `packages/core/src/runtimes/cmi5/cmi5-statement-guard.ts`
- `packages/core/src/runtimes/h5p/h5p-runtime.ts`
- `packages/core/src/runtimes/lti/lti-platform.ts`
- `packages/core/src/storage/filesystem-storage.adapter.ts`

**nest**

- `packages/nest/src/reactive-lms.module.ts`
- `packages/nest/src/controllers/packages.controller.ts`
- `packages/nest/src/controllers/courses.controller.ts`
- `packages/nest/src/controllers/modules.controller.ts`
- `packages/nest/src/controllers/enrolments.controller.ts`
- `packages/nest/src/controllers/registrations.controller.ts`
- `packages/nest/src/controllers/launches.controller.ts`
- `packages/nest/src/controllers/progress.controller.ts`
- `packages/nest/src/controllers/xapi.controller.ts`
- `packages/nest/src/controllers/cmi5.controller.ts`
- `packages/nest/src/controllers/lti.controller.ts`
- `packages/nest/src/controllers/scorm-runtime.controller.ts`

**player**

- `packages/player/src/provide-reactive-lms.ts`
- `packages/player/src/launch/rlms-player.component.ts`
- `packages/player/src/runtimes/scorm/scorm-api-bridge.ts`
- `packages/player/src/runtimes/scorm/scorm-frame.component.ts`
- `packages/player/src/runtimes/html5/html5-frame.component.ts`
- `packages/player/src/runtimes/h5p/h5p-frame.component.ts`
- `packages/player/src/runtimes/cmi5/cmi5-frame.component.ts`
- `packages/player/src/runtimes/lti/lti-launch.component.ts`
- `packages/player/src/progress/progress.service.ts`

---

## 7. Phased work

Each phase produces working, testable software. Do not start a later phase until the previous phase’s automated tests pass and the CHANGELOG / README are updated.

This is one product, but the subsystems are independent enough that each phase should be its own feature branch off `dev` and its own PR.

### Phase 0 — Scaffold the monorepo

**Files:** root `package.json`, `tsconfig.base.json`, workspace package.json files, `.env.example`, `docs/STANDARDS.md`, empty `CHANGELOG.md` structure.

- [ ] **Step 1:** Initialize bun workspaces with the seven packages listed in section 3. Each package has `"type": "module"`, a `src/` tree, and a `tsconfig.json` that extends the base.
- [ ] **Step 2:** Add root scripts: `bun run typecheck`, `bun run test`, `bun run test:file`, `bun run lint`, `bun run lint:file`.
- [ ] **Step 3:** Write `docs/STANDARDS.md` listing the exact spec versions: SCORM 1.2, SCORM 2004 4th Edition (CAM 1.3), xAPI 1.0.3, cmi5 Quartz 1st Edition, LTI 1.3 + AGS 2.0 + NRPS 2.0 + DL 2.0, H5P package spec, LIS 2.0.1 as the information model.
- [ ] **Step 4:** Update `README.md` with the monorepo map and dual-mode story. Commit `chore(repo): scaffold bun workspace`.

**Done when:** `bun run typecheck` succeeds on empty package entrypoints.

### Phase 1 — Shared contracts and error model

**Files:** everything under `packages/shared/src` in section 6.

- [ ] **Step 1:** Write tests for `PackageType` detection helpers and `LmsError` HTTP mapping (`packages/shared/src/errors/lms-error.test.ts`).
- [ ] **Step 2:** Implement the types and contracts in section 4.2. `LmsError` carries `{ status: number; code: string; message: string; details?: unknown }`. Public codes are anonymized integers only if a later security review requires it; start with readable codes (`PACKAGE_NOT_DETECTED`, `LAUNCH_SESSION_OPEN`, `CMI5_TOKEN_USED`).
- [ ] **Step 3:** Export a single `packages/shared/src/index.ts`. No runtime Nest/Angular imports.
- [ ] **Step 4:** Commit `feat(shared): add LMS contracts and DTOs`.

**Done when:** another package can `import { ContentRuntime, LearnerRef } from '@reactive-lms/shared'`.

### Phase 2 — Persistence and migrations

**Files:** `packages/persistence/**`.

- [ ] **Step 1:** Add TypeORM entities matching section 4.1. Table names are singular snake_case via `@Entity({ name: 'content_package' })`. Columns use `@Column({ name: 'external_id' })`.
- [ ] **Step 2:** Generate `0001-initial-schema.ts`. Do **not** run it against any shared or production database without an explicit user OK and a dump.
- [ ] **Step 3:** Provide `createPersistenceDataSource({ url, type?: 'postgres', migrationsRun? })` so a host app can register the same entities and migrations. v1 implements `postgres` only.
- [ ] **Step 4:** Add a repository test against a disposable Postgres (Testcontainers or a local `docker compose` service named `rlms_test`). Cover: unique `(person_id, course_section_id)` on `registration`; a section can hold two `course_module` rows pointing at the same `content_package`; statement immutability is enforced by having no update repository method.
- [ ] **Step 5:** Commit `feat(persistence): add LIS-shaped schema`.

**Done when:** migrations apply on an empty Postgres and the unique constraints exist.

### Phase 3 — Course container, enrolment, HTML5 (proves the pipeline)

HTML5 is the simplest format. This phase also fixes the Moodle/Chamilo/ILIAS lesson: import creates a *package*, a section holds *modules*, enrolment creates a *registration*, launch targets a *module*.

**Files:** importer, `html5-runtime`, course/module/enrolment controllers, `html5-frame.component`.

**Interfaces:**

- Consumes: `ContentRuntime`, `StorageAdapter`, `ProgressSink`, `LaunchRequest`, `CapabilityAdapter`
- Produces: `content_package` + `activity_node` + `course_module` + `LaunchDescriptor` with `playerKind: 'iframe'`

- [ ] **Step 1:** Write `detect-package-type.test.ts` with fixtures: a ZIP containing only `index.html`; a ZIP containing `imsmanifest.xml`; a ZIP containing `cmi5.xml`; a ZIP containing `h5p.json`.
- [ ] **Step 2:** Implement detection and `Html5Runtime.parse` (entry = `index.html` or the first html file; single `activity_node`).
- [ ] **Step 3:** Implement `FilesystemStorageAdapter` (dataroot outside the web root) and `PackageImporter.import(buffer)` with uncompressed-size and file-count limits plus an optional `antivirusScan(buffer)` hook.
- [ ] **Step 4:** Implement section + module APIs: create a section, `POST /course-sections/:id/modules` to place the imported package, reorder modules, set `availability_json`.
- [ ] **Step 5:** Implement `EnrolmentService`: `manual` (instructor adds a person), `self` (learner joins if the method is open), `group` (membership in a LIS Group). Creating a membership creates a `registration`.
- [ ] **Step 6:** Implement `LaunchService.launch` for html5 (checks capability + availability, creates attempt, returns content URL under `/lms/content/:packageId/...`).
- [ ] **Step 7:** Write `course-completion.test.ts`: one section, two modules; completing only the first leaves registration `in_progress`; completing both with `completion_rule.allModules` sets `completed`.
- [ ] **Step 8:** Document and implement the HTML5 `postMessage` contract:

```ts
// content → player
{ source: 'reactive-lms', type: 'progress', payload: Partial<NormalizedProgress> }
{ source: 'reactive-lms', type: 'complete' }
```

- [ ] **Step 9:** Nest controllers + OpenAPI for packages, sections, modules, enrolments, launches, progress.
- [ ] **Step 10:** Angular `RlmsPlayerComponent` that iframes `contentUrl` and posts progress to the API. The host (or standalone web) renders the module list; the player launches one module.
- [ ] **Step 11:** Standalone API + web can upload a ZIP, place it in a section, self-enrol, launch, and show module + section progress.
- [ ] **Step 12:** Write an `event_log` row for import, enrol, launch, and progress commit.
- [ ] **Step 13:** Commit `feat(html5): course modules, enrolment, and HTML5 playback`.

**Done when:** a section with one HTML5 module that posts `complete` marks that module and the section `completed`; a section with two modules requires both.

### Phase 4 — SCORM 1.2

**Files:** `parse-imsmanifest.ts`, `scorm-12-runtime.ts`, `cmi-store.ts`, `scorm-runtime.controller.ts`, `scorm-api-bridge.ts`, `scorm-frame.component.ts`.

**CMI elements to persist in v1 (required for interoperability):**

```
cmi.core.student_id
cmi.core.student_name
cmi.core.lesson_location
cmi.core.credit
cmi.core.lesson_status
cmi.core.entry
cmi.core.score.raw
cmi.core.score.min
cmi.core.score.max
cmi.core.total_time
cmi.core.lesson_mode
cmi.core.exit
cmi.core.session_time
cmi.suspend_data
cmi.launch_data
cmi.comments
cmi.objectives.*   (id, score, status) — store as extras_json if full tree is large
```

- [ ] **Step 1:** Fixture tests with a real SCORM 1.2 golf / Rustici sample package (store under `packages/core/src/runtimes/scorm/fixtures/`, respect the sample license).
- [ ] **Step 2:** Parse `imsmanifest.xml` into an activity tree (`organizations/organization/item` + `resources/resource@href`).
- [ ] **Step 3:** Implement the CMI store: GetValue/SetValue validation, error codes (`0`, `101`, `201`, `301`, `351`, `391`, `401`, `402`, `403`, `404`), `LMSInitialize` / `LMSFinish` session rules.
- [ ] **Step 4:** HTTP pair: `GET /scorm/attempts/:id/cmi` and `PUT /scorm/attempts/:id/cmi` used by the browser bridge on Commit/Finish. Debounce 500 ms on the client.
- [ ] **Step 5:** Angular `ScormApiBridge` installs `window.API` on the player window **before** the SCO iframe loads, implements the standard findAPI-visible object, and maps CMI writes onto `ProgressSink` (`lesson_status` → completion/success, `score.raw` → score).
- [ ] **Step 6:** Commit `feat(scorm): support SCORM 1.2 packages`.

**Done when:** a known-good SCORM 1.2 sample launches, bookmarks, scores, and completes, and a page refresh resumes `lesson_location` / `suspend_data`.

### Phase 5 — xAPI LRS + cmi5

cmi5 requires an LRS. Build the LRS first, then the cmi5 profile on top.

**Files:** `lrs-service.ts`, `xapi.controller.ts`, `parse-cmi5-xml.ts`, `cmi5-runtime.ts`, `cmi5-statement-guard.ts`, `cmi5.controller.ts`, `cmi5-frame.component.ts`.

- [ ] **Step 1:** LRS statement tests: PUT by id, POST batch, GET with `statementId` / `voidedStatementId` / `agent` / `verb` / `activity` / `registration` / `since` / `until` / `limit` / `more` cursor. Reject updates to an existing id with a different body (`409`).
- [ ] **Step 2:** Implement document resources with etag concurrency (`412` on mismatch).
- [ ] **Step 3:** `/xapi/about` returns `{ version: ['1.0.3'] }`.
- [ ] **Step 4:** Parse `cmi5.xml` into course + blocks + AUs (`moveOn`, `masteryScore`, `launchMethod`, `launchParameters`, `entitlementKey`). Support > 1000 AUs (cmi5 LMS requirement) by inserting activity nodes in batches inside one transaction.
- [ ] **Step 5:** Launch builds the AU URL:

```
{auUrl}?endpoint={lrs}&fetch={tokenUrl}&actor={json}&registration={uuid}&activityId={lmsGeneratedIri}
```

`activityId` MUST NOT equal the publisher id from the XML. Reuse the same generated IRI for the AU across launches of the same registration.

- [ ] **Step 6:** Before redirect, the LMS writes a `launched` statement and the State document `LMS.LaunchData` (`contextTemplate`, `launchMode`, `launchParameters`, `masteryScore`, `moveOn`, `returnURL`).
- [ ] **Step 7:** `POST /cmi5/sessions/:id/token` is one-time. Second call returns `error-code: "1"`. Token is scoped to that session and cannot void statements.
- [ ] **Step 8:** `cmi5-statement-guard` enforces AU verb order: `initialized` first, `terminated` last, no duplicate defined verbs, at most one of `{passed, failed}` per session, `failed` cannot follow `passed` on the registration. Illegal defined statements are rejected (`400`); if they slip through they are voided.
- [ ] **Step 9:** On a new launch while a session is open, write `abandoned` on behalf of the AU and refuse further statements for the old session.
- [ ] **Step 10:** Apply `moveOn` and emit LMS `satisfied` statements for AU / block / course.
- [ ] **Step 11:** Commit `feat(cmi5): add LRS and cmi5 launch profile`.

**Done when:** a cmi5 sample AU can initialize, pass, terminate, and the registration satisfies according to `moveOn=Passed`.

### Phase 6 — SCORM 2004 (CMI first, sequencing second)

- [ ] **Step 1:** Parse 2004 manifests (`schemaversion` contains `2004` or `CAM 1.3`). Expose `window.API_1484_11`.
- [ ] **Step 2:** Persist the 2004 CMI set used by real content: `cmi.completion_status`, `cmi.success_status`, `cmi.score.scaled`, `cmi.location`, `cmi.suspend_data`, `cmi.session_time`, `cmi.total_time`, `cmi.progress_measure`, `cmi.objectives.*`, `cmi.interactions.*` (interactions may live in `extras_json`).
- [ ] **Step 3:** Linear navigation only: `flow=true` next/previous from the activity tree. Player shows Next / Previous / TOC based on `hideLMSUI` when present.
- [ ] **Step 4:** Separate PR: Sequencing and Navigation engine (rollup, pre/post conditions, choice, randomize, attempt limits, objective maps). Treat this as its own plan if it exceeds one PR.
- [ ] **Step 5:** Commit `feat(scorm): support SCORM 2004 CMI and linear nav`.

**Done when:** a SCORM 2004 3rd/4th Edition sample that does not depend on complex SN completes and reports `completion_status` + `success_status` independently.

### Phase 7 — H5P

- [ ] **Step 1:** Parse `.h5p`: require `h5p.json` (`title`, `mainLibrary`, `language`, `preloadedDependencies`) and `content/content.json`.
- [ ] **Step 2:** Store libraries by `machineName-major.minor` so two packages can share library bits on disk.
- [ ] **Step 3:** Player uses a dedicated H5P runtime in an iframe. Forward H5P `xAPI` events into the LRS (as cmi5-*allowed* style statements, not cmi5-defined) and into `ProgressSink`.
- [ ] **Step 4:** Score from `result.score.scaled` / `result.success` / `result.completion`.
- [ ] **Step 5:** Commit `feat(h5p): import and play H5P packages`.

**Done when:** an official H5P multiple-choice sample records a score on the registration.

### Phase 8 — LTI 1.3 Platform + Advantage

- [ ] **Step 1:** Persist `lti_platform_deployment`. Generate a platform RSA keypair at startup if none exists (store PEM in an env-backed secret, never in git).
- [ ] **Step 2:** Implement OIDC login initiation + resource link launch. Nonces expire and are single-use.
- [ ] **Step 3:** Deep Linking response handler creates `activity_node` rows from returned `ltiResourceLink` items.
- [ ] **Step 4:** AGS: `/lti/ags/sections/:id/lineitems` and scores map to `line_item` / `result` and then `ProgressSink`.
- [ ] **Step 5:** NRPS: `/lti/nrps/sections/:id/memberships` lists `membership` rows for that section.
- [ ] **Step 6:** Player `LtiLaunchComponent` performs the browser redirect/POST.
- [ ] **Step 7:** Commit `feat(lti): add LTI 1.3 platform launches`.

**Done when:** a public LTI 1.3 reference tool (1EdTech RI or a local tool) launches and can post a grade that appears on the registration.

### Phase 9 — NestJS host integration and standalone polish

- [ ] **Step 1:** Document `ReactiveLmsModule.registerAsync` in README with a copy-paste host example (existing NestJS + TypeORM + Angular).
- [ ] **Step 2:** Split migrations: `packages/persistence/src/migrations` (embeddable) vs `packages/standalone-api/src/migrations` (local users only).
- [ ] **Step 3:** OpenAPI complete for every controller; export the spec from `@reactive-lms/shared` or generate it at build.
- [ ] **Step 4:** Angular 18+ library packaged so a host app can `import { RlmsPlayerComponent, provideReactiveLms } from '@reactive-lms/player'`.
- [ ] **Step 5:** `standalone-web` is a real Angular 18+ app: TailwindCSS + Angular Material chrome around the player (course list, enrol, launch, section report). Player package stays Material-free.
- [ ] **Step 6:** Progress events: `GET /registrations/:id/progress` plus an optional SSE endpoint `GET /registrations/:id/progress/stream` so the host UI can update without polling. Use RxJS on the client.
- [ ] **Step 7:** Accessibility pass on the player chrome (keyboard Next/Previous, iframe title, focus return on terminate). Follow the ui-design skill when that UI is built.
- [ ] **Step 8:** GDPR-shaped `GET /people/:id/export` that returns the person’s registrations, progress, statements they originated, and event log. `DELETE /people/:id/forget` anonymises PII on `person` and actor JSON but keeps aggregates (Chamilo GDPR export lesson).
- [ ] **Step 9:** Section export: `GET /course-sections/:id/export` returns JSON structure + package checksums so a host can migrate a course without Moodle `.mbz`.
- [ ] **Step 10:** Ship `MemoryCacheAdapter`. Wire cmi5 fetch tokens and LTI nonces through `CacheAdapter` so a later Redis adapter is a drop-in.
- [ ] **Step 11:** Commit `feat(nest): ship embeddable Nest module and Angular player`.

**Done when:** a fresh clone can `bun install`, start standalone, import one package of each implemented type, and a host app can add the Nest module + Angular player without forking this repo.

### Phase 10 — Reporting that the host actually needs

Keep this small. DESIGN_CONSIDERATIONS asks to record course progress into NestJS, not to build a BI suite.

- [ ] **Step 1:** `GET /course-sections/:id/report` — per-person status, score, duration, last activity.
- [ ] **Step 2:** `GET /registrations/:id/transcript` — attempt list + normalized progress + (optional) xAPI statement ids.
- [ ] **Step 3:** Commit `feat(report): add section and transcript endpoints`.

### Phase 11 — Multi-database drivers and Redis cache (after v1)

Required by `docs/TECHNOLOGY.md`, not by the first shippable LMS slice.

- [ ] **Step 1:** Extend `createPersistenceDataSource({ url, type?, migrationsRun? })` so `type` can be `postgres` | `mysql` | `mariadb` | `better-sqlite3`. Keep one entity set. Per-driver migration folders (`migrations/postgres`, `migrations/mysql`, …) or TypeORM driver-neutral migrations if they stay portable.
- [ ] **Step 2:** Integration tests per driver behind env flags (`RLMS_TEST_DATABASE_URL`, `RLMS_TEST_MYSQL_URL`). Skip when unset.
- [ ] **Step 3:** `RedisCacheAdapter` implementing `CacheAdapter` (`ioredis` or `redis`). Default remains `MemoryCacheAdapter`.
- [ ] **Step 4:** Document when to turn Redis on (multi-instance standalone-api, shared cmi5 tokens / LTI nonces).
- [ ] **Step 5:** Commit `feat(persist): add extra TypeORM drivers and Redis cache`.

**Done when:** the same entities boot on Postgres and at least one other driver, and swapping `cacheAdapter` to Redis does not change call sites.

---

## 8. API surface (v1)

Prefix is configurable (`/lms` default). All write bodies are JSON. All error bodies:

```json
{ "code": "PACKAGE_NOT_DETECTED", "message": "No supported package marker found." }
```

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/packages` | multipart upload; detect + import |
| GET | `/packages/:id` | package + activity tree |
| DELETE | `/packages/:id` | delete package and extracted files |
| POST | `/course-templates` | create catalog item |
| POST | `/course-offerings` | create offering |
| POST | `/course-sections` | create section |
| POST | `/course-sections/:id/modules` | place a package (or node) as a module |
| PATCH | `/course-modules/:id` | title, order, availability |
| DELETE | `/course-modules/:id` | remove placement (package remains) |
| POST | `/course-sections/:id/enrolment-methods` | enable manual / self / group / host_sync |
| POST | `/course-sections/:id/memberships` | enrol a person (LIS Membership → registration) |
| POST | `/course-sections/:id/self-enrol` | learner joins via a `self` method |
| GET | `/registrations/:id` | registration + per-module rollup |
| POST | `/registrations/:id/launches` | body `{ courseModuleId, activityNodeId? }` |
| POST | `/registrations/:id/waive` | LMS `waived` (cmi5) for a module |
| GET | `/registrations/:id/progress` | NormalizedProgress list |
| GET | `/course-sections/:id/export` | section structure + package checksums |
| GET | `/people/:id/export` | GDPR-shaped personal data dump |
| PUT | `/scorm/attempts/:id/cmi` | SCORM commit |
| GET | `/scorm/attempts/:id/cmi` | SCORM hydrate |
| * | `/xapi/*` | LRS |
| POST | `/cmi5/sessions/:id/token` | one-time auth-token |
| GET | `/lti/oidc/login` | OIDC login initiation |
| POST | `/lti/launch` | resource link / deep linking launch |
| * | `/lti/ags/*` | Assignment and Grade Services |
| GET | `/lti/nrps/sections/:id/memberships` | Names and Role Provisioning |
| GET | `/course-sections/:id/report` | section report |
| GET | `/health` | liveness |

Authn is the host’s problem. The Nest module receives the already-authenticated request and asks `IdentityAdapter` who the learner is. Standalone API uses a local JWT.

---

## 9. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Unit | bun test / vitest, colocated `*.test.ts` | detectors, CMI validators, cmi5 verb guard, moveOn, LTI nonce, statement immutability |
| Integration | Testcontainers Postgres | repositories, importer transaction, LRS GET filters |
| Contract | OpenAPI + HTTP tests against standalone-api | every row in section 8 |
| Fixture | committed sample packages (SCORM golf, cmi5 AU, H5P MCQ, HTML5 zip) | launch + progress golden paths |
| Player | Angular component tests + one Playwright smoke in standalone-web | findAPI works, iframe loads, progress appears |

Do not claim a format is “supported” until its fixture test is green.

SCORM 2004 full sequencing gets its own conformance fixtures (ADL test suite) in the SN follow-up plan, not in Phase 6 CMI.

---

## 10. Explicit non-goals (v1)

These appeared in PHP LMS feature lists or vendor checklists and are **not** required by DESIGN_CONSIDERATIONS for v1:

- Native quiz / QTI question bank (Moodle `qtype`, Chamilo 20+ types, ILIAS tests)
- Forums, assignments, attendance, surveys, calendar, chat, videoconference
- Certificates, badges, competencies / learning plans (Forma, Chamilo, Moodle CBE)
- Site-wide content bank (Moodle 3.9+ H5P bank)
- Themes, blocks, and course-format plugins
- Content authoring / AI authoring
- Content marketplace and e-commerce
- Social feed, gamification, leaderboards
- Built-in SSO IdP (host provides identity; standalone has local login only)
- LIS SOAP/WSDL and LDAP bindings
- LTI 1.1 / OAuth 1.0a
- LTI Dynamic Registration, Proctoring, Submission Review, Caliper
- Being an LTI *Tool* (we are the Platform)
- Moodle `.mbz` import/export
- Multi-tenant SaaS billing
- Mobile native apps (responsive web player only)
- Replacing the host gradebook UI

---

## 11. Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| SCORM 2004 sequencing | Historically “developer-years”; easy to claim support and fail real packages | Ship CMI + linear nav first; SN is a follow-up plan |
| Cross-origin SCO / AU | Content often lives on another origin; `window.API` will not be visible | Always serve extracted packages from our origin in v1; remote AUs use cmi5/xAPI, not SCORM |
| Third-party cookies and LTI | LTI iframe launches break without OIDC + postMessage workarounds | Prefer top-level redirects for LTI; follow 1EdTech OIDC + postMessage notes only if iframe is required |
| Host schema collisions | Host may already have `person`, `group`, `registration` | All tables prefixed `rlms_` via a TypeORM naming strategy (`rlms_person`, …) — **override section 4.1 names with this prefix** |
| Package ZIP bombs | Import is an untrusted ZIP | Limit uncompressed size and file count in `PackageImporter` |
| PII in xAPI actor | cmi5 says LMS SHOULD avoid sensitive PII in `actor` | Default actor is `{ account: { homePage, name: externalId } }` with no email |

The `rlms_` table prefix is a hard decision: it is the only safe way to ship migrations into an unknown host database.

---

## 12. Key decisions

1. **Monorepo with a shared contract package** — required by the design doc and by Angular + Nest sharing DTOs.
2. **Adapter per package type behind `ContentRuntime`** — one import/launch/progress pipeline, seven formats.
3. **Course is a container of modules; a package is reusable content** — Moodle `course_modules`, Chamilo learning paths, ILIAS repository objects. Do not 1:1 a section to a ZIP.
4. **Enrolment methods produce memberships** — `manual` / `self` / `group` / `host_sync`, same split Moodle uses between enrol plugins and the enrolment row.
5. **LIS information model, REST binding** — we conform to 1EdTech *concepts* without taking a SOAP dependency in v1. Chamilo “session” = our `course_offering`.
6. **LMS is an LRS** — required by cmi5; also serves raw xAPI and H5P events.
7. **This product is an LTI Platform, not a Tool.**
8. **Identity and authorization are injected** — `IdentityAdapter` + `CapabilityAdapter`; we never own passwords in the embeddable schema.
9. **Tables prefixed `rlms_`** — host-safe migrations (Moodle `mdl_` lesson).
10. **Dataroot is not the web root** — Moodle `$CFG->dataroot` / Chamilo `var/`.
11. **SCORM 2004 sequencing is not in the first SCORM PR.**
12. **HTML5 + course container first** — proves the spine before the hard standards.
13. **Own the domain; borrow only SCORM/H5P player engines** — do not wrap a commercial LMS engine.
14. **Do not become a campus VLE** — no native quiz, forum, assignment, or certificate engine in v1. Those are why Moodle is a million-line PHP app.
15. **Stack is `docs/TECHNOLOGY.md`** — NestJS + TypeORM, Angular 18+ / RxJS, shared DTOs in `@reactive-lms/shared`.
16. **Postgres first, TypeORM drivers later** — entities stay portable; Postgres DDL stays in the Postgres migration.
17. **Cache behind `CacheAdapter`** — in-memory in v1, Redis when we need a shared cache. No Redis client in v1 lockfile.
18. **Demo UI is Tailwind + Angular Material; the player library is not** — hosts must not inherit the demo theme.

---

## 13. Open questions

These do not block Phase 0–3. They should be answered before the named phase.

1. **Host Angular version?** Closed by `docs/TECHNOLOGY.md`: Angular **18+**, standalone APIs. No NgModule wrapper unless a host asks.
2. **Object storage?** v1 filesystem adapter is enough. Confirm if the host already has S3/MinIO that we should implement as a second `StorageAdapter` in Phase 9.
3. **SCORM engine:** implement CMI ourselves (more code, no license surprise) vs. wrap `scorm-again` (faster, MIT). Recommendation: wrap `scorm-again` for the in-browser API object, keep persistence in our CMI store. Confirm before Phase 4. Implementation on `feature/lms-foundation` already owns CMI in `@reactive-lms/shared` — treat that as the chosen path unless we later wrap only the in-browser API object.
4. **Publish strategy:** private workspace consumed via path references, or publish `@reactive-lms/*` to a registry (see npm-registry skill) for the host apps?
5. **Should standalone mode include a minimal admin UI** (upload, place modules, enrol, report) or only API + a thin demo player?
6. **AICC?** The Docebo article mentions it. DESIGN_CONSIDERATIONS does not. Treat as out of scope unless requested.
7. **Certificates?** Every PHP corporate LMS (Forma, Chamilo) treats a completion certificate as a first-class artefact. DESIGN_CONSIDERATIONS does not mention them. Default: v1.1, not v1.
8. **Native learning path vs SCORM org only?** Chamilo learning paths sequence mixed activities without SCORM SN. Our `course_module.sort_order` + `availability_json` is that feature. Confirm that is enough (no separate path entity).
9. **Which second database after Postgres?** TECHNOLOGY.md says “eventually.” Default candidate: MySQL/MariaDB (common host stacks) then SQLite for tests. Confirm before Phase 11.
10. **Redis in standalone-api or only when the host injects it?** Recommendation: inject only. Standalone stays in-memory until someone runs more than one API process.

---

## 14. PR plan

Work on `feature/...` branches from `dev`. One phase per PR unless a phase is too large (then split as noted).

| PR | Title | Depends on | Delivers |
| --- | --- | --- | --- |
| 0 | `chore(repo): scaffold bun workspace` | — | packages, scripts, STANDARDS.md |
| 1 | `feat(shared): add LMS contracts and DTOs` | 0 | `@reactive-lms/shared` |
| 2 | `feat(persistence): add LIS-shaped schema` | 1 | entities, `rlms_*` migrations |
| 3 | `feat(html5): course modules, enrolment, and HTML5 playback` | 2 | course container + first vertical slice |
| 4 | `feat(scorm): support SCORM 1.2 packages` | 3 | SCORM 1.2 |
| 5 | `feat(cmi5): add LRS and cmi5 launch profile` | 3 | xAPI LRS + cmi5 |
| 6a | `feat(scorm): support SCORM 2004 CMI and linear nav` | 4 | SCORM 2004 without full SN |
| 6b | `feat(scorm): add SCORM 2004 sequencing engine` | 6a | SN (own plan if large) |
| 7 | `feat(h5p): import and play H5P packages` | 5 | H5P |
| 8 | `feat(lti): add LTI 1.3 platform launches` | 2 | LTI Advantage |
| 9 | `feat(nest): ship embeddable Nest module and Angular player` | 3–8 | integration story + Angular 18/Tailwind/Material demo |
| 10 | `feat(report): add section and transcript endpoints` | 3 | host-facing progress API |
| 11 | `feat(persist): add extra TypeORM drivers and Redis cache` | 2, 9 | TECHNOLOGY.md “later” items |

PRs 5, 6a, 7, and 8 can proceed in parallel after PR 3, because each runtime only depends on the shared pipeline.

---

## 15. First concrete task (Phase 0, Task 1)

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** Write the root workspace manifest so `bun install` links every package.
- [ ] **Step 2:** Run `bun install` and `bun run typecheck`.
- [ ] **Step 3:** Expected: typecheck passes with empty exports.
- [ ] **Step 4:** Commit only after the user confirms the `feature/` branch name.

Do not start Phase 0 in this session unless asked. This document is the plan, not the implementation.

---

## 16. Sources read

- `docs/DESIGN_CONSIDERATIONS.md`
- `docs/TECHNOLOGY.md` — NestJS, TypeORM, Postgres first / multi-DB later, Redis later, Angular 18+, TailwindCSS, Angular Material, RxJS, shared DTOs
- `README.md`, `CHANGELOG.md`
- [LTI (1EdTech)](https://www.1edtech.org/standards/lti) — LTI 1.3, AGS 2.0, NRPS 2.0, Deep Linking 2.0
- [LIS overview](https://www.imsglobal.org/1edtech-learning-information-services-overview) and [LIS 2.0.1](https://www.imsglobal.org/lis/lisv2p0p1/LISSpecificationv2p0p1.html)
- [Technical SCORM](https://scorm.com/scorm-explained/technical-scorm/) — CAM, RTE, SN
- [xAPI specification](https://github.com/adlnet/xAPI-Spec) 1.0.3
- [cmi5 Quartz](https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md)
- [H5P package spec](https://h5p.org/documentation/developers/h5p-specification)
- [Docebo LMS requirements](https://www.docebo.com/learning-network/blog/lms-requirements/) — used only to separate must-have standards from vendor extras
- [Moodle plugin types](https://moodledev.io/docs/5.3/apis/plugintypes) — activity modules, enrolment, availability, gradebook
- [Architecture of Open Source Applications: Moodle](https://aosabook.org/en/v2/moodle.html) — contexts/roles, dataroot, table prefix, fat core + typed plugins
- [Chamilo LMS](https://github.com/chamilo/chamilo-lms) — sessions, learning paths, SCORM/LTI/xAPI/cmi5, SIS API, GDPR export
- [ILIAS](https://www.ilias.de/en/about-ilias/) — repository objects, SCORM 1.2/2004, xAPI/cmi5, QTI, LOM
- [Forma LMS](https://www.formalms.org/) — corporate catalog, certificates, rule-based enrolment (v1 takes catalog + enrolment ideas only)
