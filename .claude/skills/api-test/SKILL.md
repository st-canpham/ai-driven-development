---
name: api-test
description: Write Jest unit or e2e (supertest) tests for apps/api endpoints. Use when adding tests for a service or HTTP endpoint.
---
1. Unit tests: next to the file as `*.spec.ts`; mock the repository with `getRepositoryToken(Entity)`.
2. e2e tests: `apps/api/test/<domain>.e2e-spec.ts`, boot `AppModule`, apply `setGlobalPrefix('api')`, hit `/api/...`.
3. Name tests after the behaviour (from L6 on, prefix with the criterion ID, e.g. `BK-03: rejects overlapping booking`).
4. Assert status code AND body; avoid asserts that only check "defined".
5. Run `pnpm --filter api test` (unit) or `test:e2e` (needs `pnpm db:up`).
