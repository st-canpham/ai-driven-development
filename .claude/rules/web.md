---
paths: ["apps/web/**"]
---
# Web rules
- Follow `apps/web/CLAUDE.md` (team boilerplate st-fe-rd/b-react-vite-ts) and use the `frontend` skill.
- Build UI with Ant Design (antd) components; SCSS only for layout and pages. Change antd's look through `ANTD_THEME` tokens (`src/app/core/modules/antd/antd-theme.ts`), never by overriding `.ant-*` classes.
- Forms: React Hook Form + Zod (`zodResolver`); each antd control inside RHF's `Controller` in a `Form.Item` without `name`. Never antd's `Form.useForm` / `Form.Item name` / `rules`.
- `message` / `notification` / `modal` only from `App.useApp()`, never the static antd APIs.
- Call the API only through services in `src/app/shared/services/` via `ApiService`; endpoints live in `src/config/endpoint.ts` (relative to `/api/`).
- Run `pnpm --filter web lint` (max-warnings 0) and `pnpm --filter web format` before finishing.
- Add or update a colocated `*.test.tsx` for every component/hook/service you change; run `pnpm --filter web test`.
