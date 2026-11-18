---
paths: ["apps/web/**"]
---
# Web rules
- Follow `apps/web/CLAUDE.md` (team boilerplate st-fe-rd/b-react-vite-ts) and use the `frontend` skill.
- Call the API only through services in `src/app/shared/services/` via `ApiService`; endpoints live in `src/config/endpoint.ts` (relative to `/api/`).
- Run `pnpm --filter web lint` (max-warnings 0) and `pnpm --filter web format` before finishing.
- Add or update a colocated `*.test.tsx` for every component/hook/service you change; run `pnpm --filter web test`.
