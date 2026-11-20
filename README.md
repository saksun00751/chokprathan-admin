# chokprathan-admin

The back office of โชคประทาน, split out of the member site (`../chokprathan`). Same MariaDB database,
separate app, DB user, cookie (`__Host-cpa_session`) and deploy. Every page needs an employee
session except `/login`.

## Environment

Copy `.env.example` to `.env.local` (development) or `.env.production.local` (deploy).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MariaDB, as the `chok_admin` user (see `scripts/grants.sql`). Same database as the member site. |
| `DATABASE_POOL_SIZE` | Connection pool size (default 20). |
| `DATABASE_SSL`, `DATABASE_SSL_INSECURE` | `true` to use TLS / to skip certificate checks. |
| `DB_AUTO_MIGRATE` | `false` stops the admin migrations from running at startup. |
| `SCHEDULER` | `off` keeps this instance from running background work (while the old app still owns it). |
| `MONGODB_URL`, `MONGODB_DB` | Optional; same MongoDB as the member site (media, stats, audit copy). |
| `NEXT_PUBLIC_SITE_URL` | Public URL of this app. |
| `TRUST_PROXY` | `1` behind the bundled nginx (client IP from `X-Real-IP`). |
| `TEST_DATABASE_URL` | Disposable MariaDB for DB tests (wiped on every run). It needs the member schema: run the member repo's `npm run db -- migrate` against it first. Unset, DB tests are skipped. |

## Database commands

`npm run db -- <command>` (reads `.env.local`):

- `status`: admin schema version, number of employees and roles.
- `migrate`: apply the admin migrations. Admin owns only `employee_*`, `audit_log` and its own version table `schema_migrations_admin`; it never creates or changes member tables.
- `import-staff [--refresh]`: copy staff accounts and roles from the member app's `users` / `staff_roles`, keeping ids. `--refresh` overwrites rows already copied (use once, in the maintenance window).
- `create-owner --username U --password P [--name N]`: create the first owner (adds the owner role if missing). Employee password rules apply; the account must change its password at first sign-in. Refuses if the username exists.

## Database users

`scripts/grants.sql` creates `chok_admin` (only the tables and verbs this code uses; full rights on the
admin-owned tables) and `chok_member` (DML on the member tables, nothing on `employee_*` / `audit_log`).
Run it as a MariaDB administrator after replacing the database name and passwords.

- `node scripts/check-grants.mjs [--matrix]`: no database; fails if grants.sql and the SQL in `src/`
  disagree (a granted table the code does not use, a table or verb the code uses without a grant, or
  an admin table granted to the member). Run it after any change to SQL in `src/`.
- `src/server/db/isolation.test.ts`: checks the grants on a real, disposable server (instructions in
  the file). Skipped in a normal `npm test`.

## Rules

- **Parity.** Money logic lives in two repos. The pure `src/domain` files (money, pricing, match,
  numbers, adjust, schedule, parity test) must be byte-identical to the member repo: run
  `scripts/check-parity.sh [member-repo-path]` (CI runs it). Change both repos together.
- **Employee data is edited only in this app after the switch.** Employees, roles, their sessions and
  the audit log belong to the admin app; the member app no longer writes them.
- **This repo never receives AMB secrets.** Game-provider (AMB) credentials stay with the member app;
  do not add them to any env file, deploy config or code here.

## Checks

```sh
npx next typegen && npm run typecheck
npx eslint src scripts
npm test
node scripts/check-grants.mjs
scripts/check-parity.sh
```
