# Configuration

[Back to README](../README.md)

| [Environment Variables](#environment-variables) | [Database Migrations](#database-migrations) | [Tests](#tests) |

The standalone API reads its settings from environment variables.

## Environment Variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `RLMS_DATABASE_URL` (or `DATABASE_URL`) | built from the `DATABASE_*` parts below | Postgres connection address |
| `DATABASE_HOST` | `localhost` | Used only when no URL is set |
| `DATABASE_PORT` | `5432` | Used only when no URL is set |
| `DATABASE_USER` | `rlms` | Used only when no URL is set |
| `DATABASE_PASSWORD` | `rlms` | Used only when no URL is set |
| `DATABASE_NAME` | `rlms` | Used only when no URL is set |
| `RLMS_DATAROOT` (or `DATAROOT`) | `./data` | Folder for uploaded and unpacked packages, kept outside the web root |
| `RLMS_RUN_MIGRATIONS` | `true` | Run pending migrations on start |
| `PORT` | `3000` | HTTP port |

The default data folder is relative to the folder you start the API from.

[Back to Top](#configuration)

## Database Migrations

The standalone API owns its database. A new, empty database is set up on the first start.

Set `RLMS_RUN_MIGRATIONS` to `false`, `0`, `no`, or `off` if you apply migrations yourself. The values `true`, `1`, `yes`, and `on` turn it on. Any other value stops the process with a message that names the variable.

If you run several API processes against one database, start one of them first. That way two processes do not migrate at the same time.

[Back to Top](#configuration)

## Tests

The database tests run only when `RLMS_TEST_DATABASE_URL` points at an empty Postgres 13 or later database. Without it, those tests are skipped. The continuous integration (CI) checks run them against Postgres 16.

[Back to Top](#configuration)

---

[Back to README](../README.md)
