---
name: nest-module
description: Create a new NestJS domain module (entity, DTOs, service, controller, unit test) in apps/api. Use when adding a new resource such as rooms or bookings.
---
1. Create `apps/api/src/<domain>/` with `<domain>.entity.ts`, `dto/create-<domain>.dto.ts`, `dto/update-<domain>.dto.ts`, `<domain>.service.ts`, `<domain>.controller.ts`, `<domain>.module.ts`.
2. Follow `.claude/rules/api.md` and `.claude/rules/db.md`.
3. Register with `TypeOrmModule.forFeature([Entity])` and import the module in `app.module.ts`.
4. Add `<domain>.service.spec.ts` covering the happy path and one error path.
5. Use the `db-migration` skill for the new table.
6. Run `pnpm --filter api build && pnpm --filter api test` before finishing.
