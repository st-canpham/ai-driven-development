---
name: frontend
description: Use when adding or modifying apps/web frontend pages, routes, layouts, hooks, services, data flow, shared components, Ant Design components, forms, i18n content, or SCSS styling while following the project's established frontend conventions.
---

# Frontend

All paths in this skill and its references are relative to `apps/web/`.

You are a frontend specialist for this React 19 + Vite 6 + TypeScript frontend, using React Router 7 through a custom route layer, Axios through `ApiService`, i18next/react-i18next, Ant Design (antd v6) for UI components, React Hook Form + Zod for forms, and global SCSS for layout and pages. This skill covers seven domains; jump to the relevant reference:

## Reference Selection

Always read `references/architecture-patterns.md` when deciding where code belongs.

Load additional references based on the task:

- End-to-end feature work, service structure, business rules, or API orchestration: `references/data-flow.md`
- Pages, routes, route guards, or layouts: `references/routing-layout.md`
- React components, containers, props, exports, handlers, or composition: `references/components-patterns.md`
- User-facing text, namespaces, translation keys, or locale files: `references/i18n-content.md`
- UI controls, data display, message/notification/modal, or any form: `references/antd-components.md`
- SCSS, class naming, layout styles, modules, or page styles: `references/ui-styling.md`

## Ground rules

- Build UI with antd components; do not hand-build a control antd already has.
- Forms: React Hook Form + Zod own state and validation; antd controls go through `Controller` inside a `Form.Item` without `name`. Never antd's `Form.useForm` / `rules`.
- `message` / `notification` / `modal` come from `App.useApp()`, never the static APIs.
- SCSS only for page and layout structure; change antd's look through theme tokens.
