# TaskHub

A small multi-tenant task API: Node.js 22, Express 5, the built-in `node:sqlite`, and `node:test` + supertest.

Many organizations (tenants) share one server and one database. The main job of a multi-tenant API is **tenant isolation**: a client must never read or change another tenant's data. One missing `WHERE tenant_id = ?` is enough to leak every customer's data, so this project treats isolation as the main requirement. The tenant comes from the API key, never from the client. Every query is scoped by `tenant_id`, and the list and update endpoints have tests proving cross-tenant access fails.

## Endpoints

| Method | Path         | Description                                      |
|--------|--------------|--------------------------------------------------|
| POST   | `/tasks`     | Create a task: `{ "title": "...", "done": false }` |
| GET    | `/tasks`     | List the caller's tasks                          |
| PATCH  | `/tasks/:id` | Update `title` and/or `done`                     |

All requests require `Authorization: Bearer <api key>`.

## Setup (Windows PowerShell)

Requires Node.js 22.13 or later.

```powershell
git clone https://github.com/FirlianiF/taskhub.git
cd taskhub
npm ci
npm start                 # http://localhost:3000, database in .\taskhub.db
```

Optional: `$env:PORT = "4000"` and `$env:DB_PATH = "C:\path\to\other.db"` before `npm start`.

## API keys

Create a key (the tenant is created if it doesn't exist). The key is printed **once**; only its hash is stored.

```powershell
node scripts/create-key.js acme "Acme Inc"
# API key for tenant "acme" (store it now, it will not be shown again):
# th_...
```

Revoke a key by tenant and its 8-character prefix (the first 8 characters of the key, also shown in logs):

```powershell
node scripts/revoke-key.js acme th_AbCdE
```

The script refuses to revoke, and exits with code 1, if the prefix matches no active key or more than one.

### Example request

```powershell
$key = "th_..."   # from create-key.js
$headers = @{ Authorization = "Bearer $key" }

Invoke-RestMethod http://localhost:3000/tasks -Method Post -Headers $headers `
  -ContentType "application/json" -Body '{"title":"Write README"}'

Invoke-RestMethod http://localhost:3000/tasks -Headers $headers
```

## Tests

```powershell
npm test
```

The same command runs in GitHub Actions ([.github/workflows/test.yml](.github/workflows/test.yml)) on every push and pull request to `main`. Each test uses a fresh in-memory database, and logging is captured, so the output stays clean.

What the key tests prove:

- **Isolation.** Tenant A cannot list tenant B's tasks, and tenant B cannot update tenant A's task: it gets a 404, and A's task stays unchanged. A tenant also cannot revoke another tenant's key.
- **The tenant comes from the key only.** Requests with only `X-Tenant-ID` get a 401. Sending `X-Tenant-ID: tenant-b` together with tenant A's key still returns only tenant A's data.
- **Auth.** Requests with a missing, malformed, unknown or revoked key get a 401.
- **Key storage.** The database contains the key's SHA-256 hash and a display prefix, never the key itself.
- **Logs.** Several requests each carry a secret: a valid key, an unknown key, a non-key token, a malformed header, a key in the query string, and a forced 500. No log line contains any of those secrets or the `Authorization` header. 500s log a stack trace, and the client only sees a generic error.

## Security decisions

- **API-key auth instead of `X-Tenant-ID`.** The first version took the tenant from an `X-Tenant-ID` header. Clients control their headers, so any client could read any tenant's data by changing it. Now the server derives the tenant from the API key, and `X-Tenant-ID` is ignored.
- **Hashed keys.** Keys are `th_` plus 32 random bytes, encoded as base64url. Only `sha256(key)` is stored. A fast hash is enough here because these are 256-bit random secrets, not passwords. There's nothing to brute-force, and the hash can be looked up directly through a unique index. The one query that isn't filtered by `tenant_id` is this key lookup, because it's the query that finds the tenant. It is documented as the only allowed exception in [CLAUDE.md](CLAUDE.md).
- **404 instead of 403.** Another tenant's task returns the same `404 Task not found` as a task that doesn't exist. A 403 would confirm that the ID exists for someone else.
- **Logs never contain keys.** Each request logs one JSON line. The logger is hand-written and uses only built-ins. It writes an explicit list of fields (time, request ID, method, path without query string, status, duration, tenant, key prefix) and never reads headers or bodies. As a safety net, anything shaped like a full key is replaced with `[REDACTED]` before writing.

## How I worked

I built this with Claude Code, guided by rules in CLAUDE.md.
For important changes I asked for a plan first, then made the
decisions (e.g. API-key auth, and a hand-written logger after
checking pino-http's docs).

Verification:
- Ran every test suite myself instead of trusting the agent's report.
- Mutation checks on tenant isolation, key revocation and log
  redaction: I broke the code on purpose and confirmed the right
  test failed.
- Caught an agent claim that was out of date (it said my branch was
  `master` after I had renamed it to `main`).
- Ran two agents in parallel with git worktrees, splitting files so
  they could not conflict.
