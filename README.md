# Room Booking — AI-Driven Development lab

NestJS + React + MySQL project used to practise the AI-Driven Development playbook, level 1 to level 6.

## First-time setup

Copy the env templates, then fill in the DB name and passwords (any values you like for local use):

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

| File | Fill in | Used by |
|---|---|---|
| `.env` | `DB_NAME`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DB_RO_PASSWORD` | docker-compose and `scripts/mcp-mysql.sh` |
| `apps/api/.env` | `DB_NAME`, `DB_PASSWORD` (same values as in `.env`) | NestJS API and TypeORM migrations |
| `apps/web/.env` | nothing | Vite |

All three are gitignored; never put the DB name or a password in a committed file.

```bash
pnpm install
pnpm db:up
pnpm dev:api   # http://localhost:3100/api
pnpm dev:web   # http://localhost:5173
```

See `CLAUDE.md` for conventions.

## Dev Container (recommended)

Create the `.env` files above first, then open the folder in VS Code → "Reopen in Container". It starts MySQL, installs dependencies and Claude Code inside the container. Stop any host-side `pnpm db:up` first so port 3306 is free.

MCP servers are defined in `.mcp.json`: a read-only MySQL server (user `booking_ro`, started by `scripts/mcp-mysql.sh` with the password from `.env`) and Context7 docs. The read-only user is created by `docker/mysql/init/01-readonly-user.sh` when the MySQL volume is first created.
