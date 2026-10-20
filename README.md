# ReactiveLMS

A TypeScript learning management system that runs standalone or embeds into
an existing NestJS + TypeORM API and Angular frontend.

> **Status:** pre-alpha (v0.1.0). The repository currently contains the
> product spec and implementation plan; code lands in later releases.

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
| Shared    | Interfaces and DTOs (`@reactive-lms/shared`)    |
| Tooling   | bun workspaces                                  |
| Caching   | Redis later, behind a `CacheAdapter`            |

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

[**Donate via Stripe**](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800), or scan:

[![Donate via Stripe](./donate.svg)](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800)
