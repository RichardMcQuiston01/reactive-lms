# CHANGELOG

## Unreleased

### Changed

- Roadmap: decided to keep an own `BlobStorageAdapter` for package files (D11).
- Roadmap: `error-log-adapter` is optional (D12); implementation starts once
  `storage-adapters` and `error-log-adapter` reach stable 1.0 (D13).
- Roadmap: decided the git workflow (D10).
- Roadmap: decided the standards-support approach (D1).
- Roadmap: decided the reusable `@reactive-lms/admin` package, first screens in
  0.3.0 (D2).
- Roadmap: decided portable TypeORM column types in entities (D9).
- Roadmap: decided filesystem blob storage first and S3-compatible storage
  in 1.0.0 (D3).
- Roadmap: decided to publish under the `@richardmcquiston01` npm scope (D4).
- Roadmap: decided learning paths: module tree and conditions in 0.3.0, reusable
  path entity in 1.2.0 (D5).
- Roadmap: decided certificates: completion events in 0.9.0, built-in
  certificates in 1.3.0, Open Badges 3.0 in 1.4.0 (D6).
- Roadmap: decided Redis in standalone: in-memory through 1.0, opt-in Redis in
  1.1.0 (D7).
- Roadmap: decided MySQL/MariaDB then SQLite, behind an extensible dialect
  contract hosts can override (D8).

### Added

- `ROADMAP.md` with milestones, exit criteria, and open design decisions.
- Roadmap adopts `@richardmcquiston01/error-log-adapter` and
  `@richardmcquiston01/storage-adapters`.

## 0.1.0 - 2026-10-20

### Added

- Root `package.json` (v0.1.0) with `funding` link.
- `donate.svg` QR code and "Buy Me a Coffee" README section.

### Changed

- Rewrote `README.md`.
- Locked the stack in `docs/TECHNOLOGY.md`: NestJS + TypeORM for the
  API; Angular 18+ + TailwindCSS + RxJS for the demo. Angular Material
  is no longer a required demo dependency.

