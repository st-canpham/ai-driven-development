# apps/web — React Vite TS (team boilerplate b-react-vite-ts)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

A React 19 + Vite 6 + TypeScript boilerplate using Context API for global state, React Router 7 through a custom routing layer, Axios via a service class, i18next for translations, Ant Design (antd v6) for UI components, React Hook Form + Zod for forms, and global SCSS for layout and pages.

## Commands

```sh
pnpm run dev       # start Vite dev server
pnpm run build     # vite build --emptyOutDir
pnpm run lint      # eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
pnpm run format    # prettier --write . && eslint . --fix
pnpm run preview   # preview the production build
pnpm run test      # vitest run (jsdom + Testing Library)
pnpm run test:watch
pnpm run test:cov  # coverage (v8)
```

## Architecture

### Path aliases

Code under `src/app` is imported via aliases, not deep relative paths: `@app/*`, `@core/*` → `src/app/core/*`, `@shared/*` → `src/app/shared/*`, `@config/*` → `src/config/*`, `@stylesheet/*` → `src/stylesheet/*`, `@assets/*` → `src/assets/*`. Defined in both `vite.config.ts` and `tsconfig.json` — keep them in sync if adding a new alias.

### Top-level split

```
src/app/core/    # infrastructure & cross-cutting concerns, routing wiring, the auth feature
src/app/pages/   # route entries — one subfolder per feature (containers, hooks, components, routes)
src/app/shared/  # reusable UI, contexts, HOCs, domain services, models
src/config/      # environment + API endpoint config
src/stylesheet/  # global SCSS, organized into base/layout/modules/pages/state
```

## Data flow

Two patterns are in use:

1. **Feature hook (default for read data)**: `container → pages/<feature>/hooks/use<Feature>() → shared/services/<feature>.service.ts → core/services/api.service.ts`. The container renders loading/error/content states from the hook's return. See `articles` for the reference implementation.
2. **Direct service call in container (forms/one-off actions)**: e.g. login — the container owns the event handler, local loading state, and redirect/error behavior, calling a `shared/services/`/`core/services/` class directly.

Services in `shared/services/` and `core/services/` are classes with three conceptual layers: raw HTTP + raw→domain mapping (private), pure business rules (public, no API calls), and public use-case methods that orchestrate the two. Services never import React or router APIs.

## Routing

A custom layer sits on top of `react-router-dom` — always check `core/modules/custom-router-dom/` (`PageRoute` type, `PrivateRoute` guard, `RouterOutlet` renderer) before changing routing behavior. Each feature exports a `PageRoute[]` of lazy-loaded containers from its own `<feature>.routes.ts`; these aggregate bottom-up into `pages/page.routes.ts` (wrapped in the `Page` shell: Header + `<Outlet/>` + Footer) and then `src/app/app.routes.ts`, which combines page routes with `core/auth/auth.routes.ts` (wrapped in the separate `Auth` shell: HeaderBasic + `<Outlet/>` + FooterBasic). Route protection is declarative via `isProtected: true` on a `PageRoute`.

## i18n

Locale JSON lives under `src/assets/i18n/<lang>/<namespace>.json` (`en`/`ja`; namespaces currently `common`, `auth`, `home`, `articles`). Use `useTranslation(namespace)`; add new keys to every locale. Prefer a new feature namespace over dumping text into `common`.

## UI components (Ant Design)

- Build UI with antd components; do not hand-build a control antd provides, and do not add another UI kit. New code does not use the legacy `shared/components/partials` `Button`/`Input`.
- `core/modules/antd/AntdProvider.tsx` wraps the app (inside `I18nextProvider`, outside `AuthProvider`): `ConfigProvider` with `ANTD_THEME` (`antd-theme.ts`, mirrors `base/_variables.scss`; change both together) and the antd locale for the i18n language (`en_US` / `ja_JP`), plus antd's `<App component={false}>` (no `.ant-app` wrapper div, so the base SCSS font size and colour still apply).
- `message`, `notification` and `modal` come from `App.useApp()`, never the static `message.*` / `Modal.confirm` APIs (those render outside the theme and locale).
- `@ant-design/icons` and a direct `dayjs` (for Japanese date pickers) are not installed yet; add them when a screen first needs them.

## Forms

React Hook Form owns form state and validation (Zod schema through `zodResolver`); antd provides only layout and controls. Wrap each antd control in RHF's `Controller` inside a `Form.Item` **without** `name`, mapping `fieldState.error` to `validateStatus`/`help` and linking the label with `htmlFor` on `Form.Item` plus the same `id` on the control (antd does not link them without `name`); submit with `<Form onFinish={handleSubmit(onSubmit)}>`. Never use antd's `Form.useForm`, `Form.Item name` or `rules`. Example in the `frontend` skill (`references/antd-components.md`).

## Styling

SCSS only for layout and pages (app shells, page structure, spacing between blocks); antd components get their look from theme tokens, never from SCSS overrides of `.ant-*` classes. No CSS Modules and no app-level CSS-in-JS (antd's internal CSS-in-JS is configured only through `ConfigProvider`). Global SCSS is entry-imported as `@stylesheet/styles.scss` and organized into `base/`, `layout/`, `modules/`, `pages/`, `state/`, each with an `_all.scss` aggregator that new partials must be registered in.

## Conventions

- Function components only, typed as `const ComponentName = (props: ComponentNameProps) => ...`; avoid `React.FC`. Route-target containers keep the PascalCase const internally but end with `export default` for `React.lazy`.
- Hooks are camelCase and start with `use`; event handler props use `on...`, implementations use `handle...`; booleans use `is`/`has`/`can`/`should`; constants are `SCREAMING_SNAKE_CASE`.
- Presentational components (`shared/components/`) take data/callbacks via props only — no fetching, no importing infra services.
- ESLint (flat config, `eslint.config.mjs`) enforces `eslint:recommended` + `@typescript-eslint/recommended` + Prettier, with `--max-warnings 0` in CI/lint script — treat warnings as build-breaking. Prettier config: single quotes, semicolons, trailing commas, 80-col width (double quotes for `.scss`/`.css`).

## Development Workflows

- Always run `pnpm run lint` before committing code.
- Tests: colocate as `<File>.test.ts(x)` next to the source; query by role/label with Testing Library, assert behaviour not markup. Setup in `src/test/setup.ts`, config in `vitest.config.ts` (reuses `vite.config.ts`).
- Use the `frontend` skill when touching pages, routes, layouts, hooks, services, shared components, antd components, forms, i18n content, or SCSS.
