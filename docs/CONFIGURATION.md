# Configuration

[Back to README](../README.md)

| [Environment Variables](#environment-variables) | [Database Migrations](#database-migrations) | [AICC Callback Address](#aicc-callback-address) | [Tests](#tests) |

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

## AICC Callback Address

Aviation Industry Computer-Based Training Committee (AICC) content calls the LMS from the learner's browser. At launch the LMS tells the content where, as an address that starts with `http://` or `https://`. The launch route builds it from the request: the scheme and host of the request, plus the route prefix, plus `/aicc/hacp`.

Behind a proxy, the API may see a different host or scheme than the browser does. Set the `publicBaseUrl` option of `ReactiveLmsModule` to the scheme, host, and port that browsers use, such as `https://lms.example.com`, with no path. The route prefix is still added for you.

A host that calls `LaunchService.launch` itself must pass `callbackBaseUrl`, the full API root such as `https://lms.example.com/lms`. An AICC launch without it is refused with a message that names it.

The route that content calls, `/aicc/hacp`, does not use the host's sign-in or permission checks. Content identifies itself with the session id from the launch, which works only while that launch is open.

[Back to Top](#configuration)

## Tests

The database tests run only when `RLMS_TEST_DATABASE_URL` points at an empty Postgres 13 or later database. Without it, those tests are skipped. The continuous integration (CI) checks run them against Postgres 16.

[Back to Top](#configuration)

---

[Back to README](../README.md)
