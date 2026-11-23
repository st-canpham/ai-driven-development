// Runs .githooks/pre-commit in throwaway git repos with stub gitleaks and pnpm.
//   node --test scripts/test/*.test.mjs
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.githooks', 'pre-commit');

// PATH with only the tools the hook needs, so a gitleaks installed on this
// machine never leaks in. Stubs log their arguments and fail on demand.
const toolsDir = (withGitleaks) => {
  const bin = mkdtempSync(join(tmpdir(), 'pre-commit-bin-'));
  for (const t of ['bash', 'git', 'grep', 'sed']) {
    symlinkSync(execFileSync('bash', ['-c', `command -v ${t}`], { encoding: 'utf8' }).trim(), join(bin, t));
  }
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/bash\necho "${name} \${PWD##*/} $*" >> "$STUB_LOG"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  if (withGitleaks) stub('gitleaks', '[ -z "$GITLEAKS_FAIL" ]');
  stub('pnpm', '[ "$2" != "$PNPM_FAIL" ]');
  return bin;
};

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'ignore' });

// Repo with a base commit holding `base` files, then `stage` written and staged.
const repo = ({ base = [], stage = [], modules = ['api', 'web'] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'pre-commit-'));
  git(dir, 'init', '-q', '-b', 'feat/x');
  const write = (f, text) => {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  };
  write('README.md', '# r\n');
  for (const f of base) write(f, 'base\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  for (const f of stage) write(f, 'staged\n');
  if (stage.length) git(dir, 'add', '-A');
  for (const app of modules) mkdirSync(join(dir, 'apps', app, 'node_modules'), { recursive: true });
  return dir;
};

const hook = (dir, { gitleaks = true, env = {} } = {}) => {
  const log = join(dir, '.stub.log');
  const bin = toolsDir(gitleaks);
  const r = spawnSync(join(bin, 'bash'), [HOOK], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: bin, HOME: dir, STUB_LOG: log, ...env },
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { status: r.status, out: r.stdout + r.stderr, calls };
};

describe('pre-commit', () => {
  it('gitleaks missing -> blocked', () => {
    const r = hook(repo({ stage: ['docs/a.md'] }), { gitleaks: false });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /gitleaks is missing/);
  });

  it('docs only -> gitleaks on the staged changes, no pnpm', () => {
    const r = hook(repo({ stage: ['docs/a.md'] }));
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /pre-commit: OK/);
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['gitleaks']);
    assert.match(r.calls[0], /git --pre-commit --staged --redact/);
  });

  it('gitleaks finds a secret -> blocked', () => {
    const r = hook(repo({ stage: ['docs/a.md'] }), { env: { GITLEAKS_FAIL: '1' } });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /found a secret/);
  });

  it('api source -> Prettier and ESLint on that file, from apps/api', () => {
    const r = hook(repo({ stage: ['apps/api/src/rooms/x.service.ts'] }));
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(r.calls.slice(1), [
      'pnpm api exec prettier --check --ignore-unknown --log-level warn src/rooms/x.service.ts',
      'pnpm api exec eslint --max-warnings 0 --no-warn-ignored src/rooms/x.service.ts',
    ]);
  });

  it('api file outside src/test -> Prettier only', () => {
    const r = hook(repo({ stage: ['apps/api/package.json'] }));
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(r.calls.slice(1), ['pnpm api exec prettier --check --ignore-unknown --log-level warn package.json']);
  });

  it('web tsx and scss -> Prettier on both, ESLint on the tsx', () => {
    const r = hook(repo({ stage: ['apps/web/src/App.tsx', 'apps/web/src/a.scss'] }));
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(r.calls.slice(1), [
      'pnpm web exec prettier --check --ignore-unknown --log-level warn src/App.tsx src/a.scss',
      'pnpm web exec eslint --max-warnings 0 --no-warn-ignored src/App.tsx',
    ]);
  });

  it('Prettier fails -> blocked', () => {
    const r = hook(repo({ stage: ['apps/web/src/App.tsx'] }), { env: { PNPM_FAIL: 'prettier' } });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /Prettier: format the files/);
  });

  it('ESLint fails -> blocked', () => {
    const r = hook(repo({ stage: ['apps/api/test/a.e2e-spec.ts'] }), { env: { PNPM_FAIL: 'eslint' } });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ESLint found problems in apps\/api/);
  });

  it('node_modules missing -> blocked', () => {
    const r = hook(repo({ stage: ['apps/api/src/x.ts'], modules: [] }));
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /apps\/api\/node_modules is missing/);
  });

  it('deleted file -> not checked', () => {
    const dir = repo({ base: ['apps/api/src/old.ts'] });
    rmSync(join(dir, 'apps/api/src/old.ts'));
    git(dir, 'add', '-A');
    const r = hook(dir);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['gitleaks']);
  });

  it('partly staged file -> says the working copy was checked', () => {
    const dir = repo({ stage: ['apps/api/src/x.ts'] });
    writeFileSync(join(dir, 'apps/api/src/x.ts'), 'changed after staging\n');
    const r = hook(dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /unstaged changes; the working copy was checked:\n {2}apps\/api\/src\/x\.ts/);
  });
});
