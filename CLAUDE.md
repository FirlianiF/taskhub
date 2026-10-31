# TaskHub
Multi-tenant task API. Node.js 22, Express, built-in node:sqlite, node:test + supertest.

## Rules
- Every table with user data MUST have a tenant_id column.
- Every query MUST filter by tenant_id. No exceptions.
- Write a test for every new endpoint, including a test that
  tenant A cannot read tenant B's data.
- Run `npm test` before saying a task is done. Show the output.
- Prefer built-in Node modules. Do not add a dependency without explaining why.