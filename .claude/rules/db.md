---
paths: ["apps/api/src/database/**", "apps/api/src/**/*.entity.ts"]
---
# Database rules
- Table and column names are snake_case; entity properties camelCase (set `name` explicitly).
- Every entity has `id`, `created_at`, `updated_at`.
- Migrations are generated, then read and trimmed by hand; never edit a migration that is already merged.
- Add an index for every column used in a WHERE on a hot path (e.g. booking `room_id`, `start_at`).
