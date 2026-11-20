# Room Booking — AI-Driven Development lab

NestJS + React + MySQL project used to practise the AI-Driven Development playbook, level 1 to level 6.

- `apps/api` — NestJS 11, TypeORM, MySQL 8.4
- `apps/web` — React 19 + Vite 6 (team boilerplate `st-fe-rd/b-react-vite-ts`)
- Conventions for people and agents: [`CLAUDE.md`](CLAUDE.md)

## Getting started

### 1. Install the prerequisites

| Tool | Needed for |
|---|---|
| Git | Everything |
| Docker Desktop (give it 6–8 GB RAM, keep 15 GB+ disk free) | MySQL, Dev Container |
| VS Code + **Dev Containers** extension | Option A |
| Dev Container CLI: `pnpm add -g @devcontainers/cli` | Option B |
| Node 24 + pnpm (`corepack enable`) | Option C |

### 2. Clone the repo

```bash
git clone https://github.com/st-canpham/ai-driven-development.git
cd ai-driven-development
```

### 3. Create the env files

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

| File | Fill in | Used by |
|---|---|---|
| `.env` | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DB_RO_USER`, `DB_RO_PASSWORD` | docker-compose, `scripts/mcp-mysql.sh` |
| `apps/api/.env` | `DB_NAME`, `DB_USER`, `DB_PASSWORD` — **same values as in `.env`** | NestJS API, TypeORM migrations |
| `apps/web/.env` | nothing | Vite |

All three files are gitignored. Never put the DB name, a user or a password in a committed file.

### 4. Start the project — pick one option

Every option serves the app on the same host ports: **3306** (MySQL), **3100** (API) and **5173** (web). Run only one option at a time; if a port is already taken, stop whatever is using it first.

#### Option A — Dev Container in VS Code (recommended)

1. Open the repo folder in VS Code and choose **Reopen in Container**.
   The first run takes a few minutes: it starts MySQL (creating the DB, the app user and the read-only user from `.env`), installs Node 24, pnpm and Claude Code, then runs `pnpm install`.
2. In the VS Code terminal (already inside the container), run each in its own tab:
   ```bash
   pnpm dev:api
   ```
   ```bash
   pnpm dev:web
   ```
3. Open http://localhost:5173 (web) or http://localhost:3100/api (API) in your browser.

#### Option B — Dev Container from the CLI

```bash
devcontainer up --workspace-folder .                               # build and start
devcontainer exec --workspace-folder . bash                        # shell inside (user node, repo folder)
devcontainer up --workspace-folder . --remove-existing-container   # rebuild after changing .devcontainer/
```

Inside the container, run `pnpm dev:api` and `pnpm dev:web` (each in its own shell), then open http://localhost:5173 or http://localhost:3100/api in your browser.

To stop it:

```bash
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.devcontainer.yml stop
```

#### Option C — Directly on your machine

```bash
pnpm install
pnpm db:up
```

Then, each in its own terminal:

```bash
pnpm dev:api   # http://localhost:3100/api
```
```bash
pnpm dev:web   # http://localhost:5173
```

### 5. Check that everything works

```bash
pnpm build && pnpm lint && pnpm test
pnpm --filter api test:e2e   # needs MySQL running
```

### 6. Use Claude Code

Run `claude` in the repo — inside the container for options A and B. From a host terminal you can also open a running container directly:

```bash
pnpm dc:shell    # bash inside the container
pnpm dc:claude   # Claude Code inside the container
```

On the first run:

1. **Log in.** Inside a container Claude prints a link: open it in your host browser and paste the code back.
2. **Approve the project MCP servers** from `.mcp.json`:
   - `mysql` — read-only (user `DB_RO_USER`, started by `scripts/mcp-mysql.sh` with credentials from `.env`)
   - `context7` — library docs
3. Read [`CLAUDE.md`](CLAUDE.md). Feature work starts with `/opsx:propose "..."` (OpenSpec).

## Working on a task (one worktree per task)

Every task gets its own git worktree, branch, ports and MySQL schema, so several tasks can run side by side without touching each other. Run these **inside the Dev Container**, from the main checkout:

```bash
pnpm task:new add-room-management        # worktree .worktrees/add-room-management
cd .worktrees/add-room-management
claude                                   # one Claude session per task
```

`task:new` prints what the task got:

| | Main checkout | Task in slot *n* (1–9) |
|---|---|---|
| Branch | `main` | from the change id: `add-room-management` → `feat/room-management` |
| API | http://localhost:3100/api | http://localhost:310*n*/api |
| Web | http://localhost:5173 | http://localhost:517(3+*n*) |
| MySQL schema | `DB_NAME` | `DB_NAME_add_room_management` (migrations applied) |

Run `pnpm dev:api` / `pnpm dev:web` inside the worktree to use its ports. After the PR is merged:

```bash
pnpm task:clean add-room-management      # add --force for a squash-merged branch
```

It stops processes still running in the worktree, drops its schema, removes the worktree and deletes the branch once its commits are in `origin/main`. Without `--force` it refuses a worktree with uncommitted changes and keeps an unmerged branch.

> Worktrees store container paths. Create, remove and prune them only inside the Dev Container — never with `git worktree` on the host.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `set DB_... in .env` | Step 3 was skipped or a value is empty |
| `port 3306 / 3100 / 5173 is already allocated` | Another option or app is using it: stop it (`pnpm db:down`, stop the Dev Container, or stop host dev servers). For MySQL you can also change `DB_PORT` in both `.env` files |
| API says `Access denied` | `apps/api/.env` does not match `.env`, or the MySQL volume was created earlier with other values |
| MCP `mysql` fails to connect | MySQL was not running when Claude started: start it, then reconnect it in `/mcp` |
| `.env` changes have no effect on MySQL | Users and passwords are only created when the `mysql-data` volume is first created. Change them with `ALTER USER`, or delete the volume with `docker compose down -v` (**deletes all DB data**) |
| Docker hangs | Free disk space and give Docker more RAM, then restart Docker Desktop |
| Claude asks to log in again after a container rebuild | Known limitation: the login lives inside the container and is lost on rebuild |
| `run this inside the Dev Container` from `task:new` / `task:clean` | Open a container shell first: `pnpm dc:shell` |
| `all 9 port slots are in use` | Clean finished tasks with `pnpm task:clean <change-id>` |
| `git worktree list` on the host shows a task as prunable | Expected: the path only exists inside the container. Do not prune it on the host |

## How MySQL is initialised

`docker-compose.yml` mounts `docker/mysql/init/` into the container's `/docker-entrypoint-initdb.d`. On the **first** start with an empty `mysql-data` volume, the MySQL image creates `DB_NAME` and `DB_USER`, then runs `01-readonly-user.sh`, which creates `DB_RO_USER` with `SELECT` access only. Later starts skip this step.
