---
name: db-migration
description: Generate, review and run a TypeORM migration after entity changes in apps/api. Use whenever an entity is added or changed.
---
1. Make sure MySQL is up: `pnpm db:up`.
2. `pnpm --filter api migration:generate src/database/migrations/<PascalCaseName>`.
3. Read the generated file: remove unrelated changes, check indexes and `down()` reverses `up()`.
4. `pnpm --filter api migration:run`, then `migration:revert` and `migration:run` again to prove `down()` works.
5. Only run migrations against the local Docker DB.
