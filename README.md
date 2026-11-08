# ReactiveLMS

- Author: [Richard McQuiston](mailto:richard.mcquiston@gmail.com)
- Website: https://richardmcquiston.com/

## Table of Contents

| [Overview](#overview) | [Getting Started](#getting-started) | [Features](#features) | [Tech Stack](#tech-stack) | [More Information](#more-information) | [Buy Me a Coffee](#buy-me-a-coffee) | [License](#license) | [Copyright](#copyright) |

## Overview

ReactiveLMS is a learning management system (LMS) written in TypeScript. It can run on its own, or it can plug into an existing NestJS and Angular app. It is for developers who want to add courses, tracking, and reports to their own software.

**Status: pre-alpha, version 0.2.0.** You can import, launch, and track HTML5 and Sharable Content Object Reference Model (SCORM) 1.2 courses. Other formats are planned. See [ROADMAP.md](./ROADMAP.md).

There are two ways to use it:

| Mode | What you run | When to use it |
| --- | --- | --- |
| **Standalone** | `@richardmcquiston01/reactive-lms-standalone-api` | A demo, an evaluation, or a self-contained LMS |
| **Embed** | `@richardmcquiston01/reactive-lms-nest` in your NestJS app and `@richardmcquiston01/reactive-lms-player` in your Angular app | Your app already handles users, sign-in, and the page layout |

[Back to Top](#table-of-contents)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh), which installs packages and runs the scripts. Do not use npm.
- Postgres 13 or later, to run the API or the database tests. The CI checks use Postgres 16.

### Installation

```bash
git clone https://github.com/RichardMcQuiston01/reactive-lms.git
cd reactive-lms
bun install
```

### Usage

Run the same four checks that CI runs on every pull request:

```bash
bun run typecheck
bun run lint
bun run format:check
bun test
```

Run `bun run format` to fix formatting problems. The database tests are skipped unless `RLMS_TEST_DATABASE_URL` points at an empty Postgres database. See [Configuration](./docs/CONFIGURATION.md).

Start the standalone API. It sets up an empty database on the first start:

```bash
export RLMS_DATABASE_URL=postgres://user:password@localhost:5432/rlms
bun run --cwd packages/standalone-api start
```

The API listens on port 3000. Open `http://localhost:3000/health` to check that it is running, and `http://localhost:3000/docs` to browse the routes. The standalone API has one demo learner and open admin routes, so use it for evaluation only. See [Authorization](./docs/AUTHORIZATION.md).

### Examples

Zip a sample SCORM 1.2 course, then upload it:

```bash
cd packages/core/test-fixtures/scorm12/simple-sco
zip -r ~/simple-sco.zip .
cd -
curl -F "file=@$HOME/simple-sco.zip" http://localhost:3000/lms/packages
```

The reply names the new package and its type:

```json
{"packageId":"…","activityNodeId":"…","packageType":"scorm_12","id":"…"}
```

List the packages you have imported:

```bash
curl http://localhost:3000/lms/packages
```

[Back to Top](#table-of-contents)

## Features

Working today:

- Import of HTML5 and SCORM 1.2 ZIP files. A broken SCORM manifest is refused with a message that names the problem.
- Launch in a frame, with SCORM 1.2 bookmarks, scores, pass marks, quiz answers, and assets tracked.
- Course sections with modules, nested blocks, and rules for when a module opens.
- Enrolment by the `manual`, `self`, or `group` method.
- Progress and completion for each person and section.
- Admin screens for modules, sections, packages, upload, placement, enrolments, progress, quiz answers, and availability rules.
- Automated SCORM 1.2 checks. These are not a certification. See [SCORM 1.2 conformance](./docs/SCORM_1_2_CONFORMANCE.md).

Planned:

- SCORM 2004, xAPI, cmi5, H5P, and Learning Tools Interoperability (LTI) 1.3.
- Aviation Industry Computer-Based Training Committee (AICC) packages.
- Support for more databases, and Redis caching.

[Back to Top](#table-of-contents)

## Tech Stack

- TypeScript, NestJS, and TypeORM, with Postgres first.
- Angular 18 or later, and RxJS.
- Bun workspaces.

TailwindCSS is planned for the demo UI. See [TECHNOLOGY.md](./docs/TECHNOLOGY.md).

[Back to Top](#table-of-contents)

## More Information

- [Packages](./docs/PACKAGES.md): what each package does and how the pieces fit.
- [Configuration](./docs/CONFIGURATION.md): environment variables and migrations.
- [Authorization](./docs/AUTHORIZATION.md): how the host decides who can do what.
- [SCORM 1.2 conformance](./docs/SCORM_1_2_CONFORMANCE.md): what was checked and what was not.
- [ROADMAP.md](./ROADMAP.md): the release plan.
- [CHANGELOG.md](./CHANGELOG.md): the release history.
- [GROK_PLAN.md](./GROK_PLAN.md): the implementation plan.
- [Design considerations](./docs/DESIGN_CONSIDERATIONS.md): product and standards requirements.

[Back to Top](#table-of-contents)

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P1V529Z7ZP)

[Back to Top](#table-of-contents)

## License

MIT. See [LICENSE](./LICENSE).

[Back to Top](#table-of-contents)

## Copyright

(c)2026 Richard McQuiston. All rights reserved. See [COPYRIGHT](./COPYRIGHT).

[Back to Top](#table-of-contents)
