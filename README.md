# ReactiveLMS

## Overview

Fully fledged TypeScript LMS that can run **standalone** or **embed** into an existing NestJS + TypeORM backend and Angular frontend. Domain contracts live in a shared library consumed by both sides; package-format adapters implement one progress model for SCORM, xAPI, cmi5, HTML5, H5P, and LTI.

## Dual mode

| Mode | What you run | When to use it |
| --- | --- | --- |
| **Standalone** | `@reactive-lms/standalone-api` + `@reactive-lms/standalone-web` | Demo, evaluation, or a self-contained LMS process |
| **Embed** | Import `@reactive-lms/nest` into a host NestJS app and `@reactive-lms/player` into a host Angular app | Host already owns identity, auth, and UI shell |

Standalone boots the same Nest module and Angular player with thin local adapters (identity, storage). Embed reuses TypeORM entities/migrations and shared DTOs without owning host users.

A course section is a container of modules. Place an imported package with `ModuleService.place`, enrol via `EnrolmentService` (`manual`, `self`, or `group`), then `LaunchService.launch` for HTML5 (`playerKind: 'iframe'`). Module availability (`afterModuleId`, date window, `minScore`) is enforced at launch. Progress writes go through `ProgressSinkService`, which rolls up `registration.status` from the section completion rule (default: every module completed).

Those services are also exposed over HTTP by `@reactive-lms/nest` (`ReactiveLmsModule.registerAsync`, default prefix `/lms`). `@reactive-lms/player` ships `provideReactiveLms` and `<rlms-player>` which launches a module, iframes `contentUrl`, and posts HTML5 `postMessage` progress.

## Monorepo map

Package manager: **[bun](https://bun.sh)** (workspaces). Do not use npm for install or scripts.

| Package | Name | Responsibility |
| --- | --- | --- |
| `packages/shared` | `@reactive-lms/shared` | Enums, DTOs, adapter contracts, launch/progress models, `LmsError` (no Nest/Angular/TypeORM) |
| `packages/persistence` | `@reactive-lms/persistence` | LIS-shaped TypeORM `rlms_*` entities, `createPersistenceDataSource` factory, and `0001-initial-schema` migration |
| `packages/core` | `@reactive-lms/core` | Import, launch, progress, LRS, LTI, content runtimes. HTML5 ZIP import (`PackageImporter`, `Html5Runtime`, `FilesystemStorageAdapter`), module placement (`ModuleService`), enrolment (`manual` / `self` / `group`), HTML5 iframe launch, and course-completion rollup are implemented; other formats are detected but not yet parsed. |
| `packages/nest` | `@reactive-lms/nest` | Embeddable NestJS module, REST + OpenAPI over the 3b services, `LmsError` JSON filter |
| `packages/player` | `@reactive-lms/player` | Angular standalone `RlmsPlayerComponent`, `provideReactiveLms`, HTML5 postMessage mapper |
| `packages/standalone-api` | `@reactive-lms/standalone-api` | Nest bootstrap, filesystem dataroot, demo identity, `/health`, `/lms/content/**` |
| `packages/standalone-web` | `@reactive-lms/standalone-web` | Thin demo entry that re-exports the Angular player |

## Tech stack

- **Backend:** TypeScript, NestJS, TypeORM, PostgreSQL first
- **Frontend demo:** Angular 18+, TailwindCSS, Google Material, RxJS
- **Shared:** interfaces and DTOs used by frontend and backend

Standards and editions are listed in [docs/STANDARDS.md](docs/STANDARDS.md).

## Scripts

From the repo root (after `bun install`):

```bash
bun run typecheck
bun run test
bun run test:file -- path/to/file.test.ts
bun run lint
bun run lint:file -- path/to/file.ts
```

## Standalone API

Copy `.env.example` to `.env` (never commit `.env`). Dataroot is `RLMS_DATAROOT` or `DATAROOT` (default `./data`). Postgres is `RLMS_DATABASE_URL` or the `DATABASE_*` parts. This slice does **not** run migrations; apply `0001-initial-schema` yourself after a dump and an explicit OK.

```bash
bun --filter @reactive-lms/standalone-api start
```

- Process listens on `PORT` (default `3000`)
- OpenAPI UI: `http://localhost:3000/docs`
- Liveness: `GET /health`
- LMS routes live under `/lms`
- Extracted HTML5 files: `GET /lms/content/**` (authz stub: any request that resolves a learner)
- Identity: fixed demo learner `externalId=standalone-demo-learner` (`DemoIdentityAdapter`) until standalone auth exists

### Launch and progress

```http
POST /lms/packages
Content-Type: multipart/form-data
# field "file" = ZIP

POST /lms/course-templates          { "title": "Demo" }
POST /lms/course-offerings          { "courseTemplateId", "title" }
POST /lms/course-sections           { "courseOfferingId", "title" }
POST /lms/course-sections/:id/modules
{ "contentPackageId": "…" }

POST /lms/course-sections/:id/enrolment-methods
{ "method": "self" }
POST /lms/course-sections/:id/self-enrol
{ "key": "optional" }

POST /lms/registrations/:id/launches
{ "courseModuleId": "…", "activityNodeId": "…" }

GET  /lms/registrations/:id/progress
POST /lms/registrations/:id/progress
```

Errors are `{ "code": "PACKAGE_NOT_FOUND", "message": "…" }` with the HTTP status from `LmsError.status`.

### Angular player

```ts
import {
  provideReactiveLms,
  RlmsPlayerComponent,
} from '@reactive-lms/player';

provideReactiveLms({
  apiBaseUrl: 'http://localhost:3000/lms',
  getAccessToken: () => '',
});
```

```html
<rlms-player
  [registrationId]="registrationId"
  [courseModuleId]="courseModuleId"
/>
```

HTML5 content posts:

```ts
{ source: 'reactive-lms', type: 'progress', payload: Partial<NormalizedProgress> }
{ source: 'reactive-lms', type: 'complete' }
```

The player maps those messages and `POST`s `/registrations/:id/progress`.

### Host embed

```ts
ReactiveLmsModule.registerAsync({
  routePrefix: 'lms',
  imports: [AuthModule],
  inject: [HostAuthService],
  useFactory: (auth: HostAuthService) => ({
    identityAdapter: { resolveLearner: (req) => auth.toLearnerRef(req) },
    dataSource: hostDataSource,
    dataRoot: process.env.RLMS_DATAROOT,
  }),
});
```

## Support

If this library saved you some reverse-engineering, consider [buying me a coffee](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800). ☕

## License

MIT

## Copyright

(c)2026 Richard McQuiston. All rights reserved.
