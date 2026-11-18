# Room Booking — AI-Driven Development lab

NestJS + React + MySQL project used to practise the AI-Driven Development playbook, level 1 to level 6.

```bash
pnpm install
pnpm db:up
cp .env.example apps/api/.env
pnpm dev:api   # http://localhost:3100/api
pnpm dev:web   # http://localhost:5173
```

See `CLAUDE.md` for conventions.

## Dev Container (recommended)

Open the folder in VS Code → "Reopen in Container". It starts MySQL, installs dependencies and Claude Code inside the container. Stop any host-side `pnpm db:up` first so port 3306 is free.

MCP servers are defined in `.mcp.json`: a read-only MySQL server (`booking_ro`) and Context7 docs. If your MySQL volume existed before L2, create the read-only user once:

```bash
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < docker/mysql/init/01-readonly-user.sql
```
