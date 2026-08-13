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

## Monorepo map

Package manager: **[bun](https://bun.sh)** (workspaces). Do not use npm for install or scripts.

| Package | Name | Responsibility |
| --- | --- | --- |
| `packages/shared` | `@reactive-lms/shared` | Enums, DTOs, adapter contracts, launch/progress models, `LmsError` (no Nest/Angular/TypeORM) |
| `packages/persistence` | `@reactive-lms/persistence` | LIS-shaped TypeORM `rlms_*` entities, `createPersistenceDataSource` factory, and `0001-initial-schema` migration |
| `packages/core` | `@reactive-lms/core` | Import, launch, progress, LRS, LTI, content runtimes. HTML5 ZIP import (`PackageImporter`, `Html5Runtime`, `FilesystemStorageAdapter`), module placement (`ModuleService`), enrolment (`manual` / `self` / `group`), HTML5 iframe launch, and course-completion rollup are implemented; other formats are detected but not yet parsed. |
| `packages/nest` | `@reactive-lms/nest` | Embeddable NestJS module, REST controllers, OpenAPI |
| `packages/player` | `@reactive-lms/player` | Angular library: launch surface and progress subscription |
| `packages/standalone-api` | `@reactive-lms/standalone-api` | Standalone Nest bootstrap + local identity adapter |
| `packages/standalone-web` | `@reactive-lms/standalone-web` | Demo Angular app consuming the player |

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

## Support

If this library saved you some reverse-engineering, consider [buying me a coffee](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800). ☕

## License

MIT

## Copyright

(c)2026 Richard McQuiston. All rights reserved.
