# Packages

[Back to README](../README.md)

| [Workspace](#workspace) | [Package Map](#package-map) | [How the Pieces Fit](#how-the-pieces-fit) |

ReactiveLMS is a Bun workspace. Each package lives in the `packages` folder.

## Workspace

Use [Bun](https://bun.sh) to install and to run scripts. Do not use npm for either one. Run every command from the repository root unless a step says otherwise.

[Back to Top](#packages)

## Package Map

| Package | Name | What it does |
| --- | --- | --- |
| `packages/shared` | `@richardmcquiston01/reactive-lms-shared` | Enums, data transfer objects (DTOs), adapter contracts, launch and progress models, and `LmsError`. It has no Nest, Angular, or TypeORM code. |
| `packages/persistence` | `@richardmcquiston01/reactive-lms-persistence` | The `rlms_*` TypeORM entities, the `createPersistenceDataSource` factory, and the Postgres migrations. |
| `packages/core` | `@richardmcquiston01/reactive-lms-core` | Import, launch, and progress. It holds the HTML5, Sharable Content Object Reference Model (SCORM) 1.2, and Aviation Industry Computer-Based Training Committee (AICC) runtimes, the SCORM 1.2 data store, module placement, enrolment, and course completion. |
| `packages/nest` | `@richardmcquiston01/reactive-lms-nest` | An embeddable NestJS module with web routes and OpenAPI docs. |
| `packages/player` | `@richardmcquiston01/reactive-lms-player` | The Angular player, `provideReactiveLms`, the HTML5 `postMessage` mapper, and the SCORM `window.API` bridge. |
| `packages/admin` | `@richardmcquiston01/reactive-lms-admin` | Angular admin screens that a host can mount or replace. |
| `packages/standalone-api` | `@richardmcquiston01/reactive-lms-standalone-api` | A ready-to-run Nest app with a data folder, a demo learner, and `/health`. |
| `packages/standalone-web` | `@richardmcquiston01/reactive-lms-standalone-web` | A thin demo entry that re-exports the Angular player. |

Every package is private for now. Nothing is published to a package registry yet.

[Back to Top](#packages)

## How the Pieces Fit

A course section holds modules. Place an imported package in a section with `ModuleService.place`. Enrol a person with `EnrolmentService`, using the `manual`, `self`, or `group` method. Then call `LaunchService.launch`. It returns a player of kind `iframe` for HTML5 or `scorm-frame` for SCORM 1.2.

A module can have rules that must be met before it opens. A rule is a condition, and conditions are grouped with `all` or `any`. The condition types are `module_completed`, `date_window`, `min_score`, and `group_member`. The rules are checked at launch. The rules of a block also apply to every module inside it.

Progress is written through `ProgressSinkService`. It works out the status of each registration from the completion rule of the section. By default, every module must be completed. For SCORM 1.2, the `cmi.core.lesson_status` and `cmi.core.score.raw` values feed the same service.

`@richardmcquiston01/reactive-lms-nest` exposes these services over the web. Register it with `ReactiveLmsModule.registerAsync`. Its routes start with `/lms` unless you change the prefix. The player package provides `provideReactiveLms` and the `<rlms-player>` component. The component launches a module, loads `contentUrl` in a frame, and receives HTML5 progress messages.

AICC content reports to the LMS itself. A launch gives it a session id and the address of the `/aicc/hacp` route, and the content calls that route. The route keeps the values in the SCORM 1.2 data store. SCORM 2004, xAPI, cmi5, and H5P packages are detected when you upload them, but they cannot be imported yet.

[Back to Top](#packages)

---

[Back to README](../README.md)
