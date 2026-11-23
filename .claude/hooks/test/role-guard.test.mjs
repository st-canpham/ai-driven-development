import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HOOKS, REPO } from './harness.mjs';
import { decide, isAppCode, isTestFile } from '../role-guard.mjs';

process.env.CLAUDE_PROJECT_DIR = REPO;
const edit = (role, path, tool = 'Edit') => decide({ tool_name: tool, tool_input: { file_path: path.startsWith('/') ? path : join(REPO, path) }, cwd: REPO }, role)?.decision ?? null;
const bash = (role, command) => decide({ tool_name: 'Bash', tool_input: { command }, cwd: REPO }, role)?.decision ?? null;

describe('role-guard: file classes', () => {
  for (const p of ['apps/api/src/rooms/rooms.service.spec.ts', 'apps/api/test/rooms.e2e-spec.ts', 'apps/api/test/helpers/db.ts', 'apps/web/src/app/x/Button.test.tsx', 'apps/web/src/test/setup.ts']) {
    it(`${p} is a test file`, () => assert.equal(isTestFile(p), true));
  }
  for (const p of ['apps/api/src/rooms/rooms.service.ts', 'apps/api/src/database/migrations/1-Rooms.ts', 'apps/web/src/app/x/Button.tsx']) {
    it(`${p} is app code`, () => assert.equal(isAppCode(p), true));
  }
  for (const p of ['apps/api/package.json', 'apps/api/test/jest-e2e.json', 'openspec/changes/x/tasks.md']) {
    it(`${p} is not app code`, () => assert.equal(isAppCode(p), false));
  }
});

describe('role-guard: edits', () => {
  const cases = [
    // [role, path, want]
    ['test-writer', 'apps/api/src/rooms/rooms.service.spec.ts', null],
    ['test-writer', 'apps/api/test/rooms.e2e-spec.ts', null],
    ['test-writer', 'apps/web/src/app/x/Button.test.tsx', null],
    ['test-writer', 'apps/api/src/rooms/rooms.service.ts', 'deny'],
    ['test-writer', 'openspec/changes/x/tasks.md', 'deny'],
    ['test-writer', 'apps/api/package.json', 'deny'],
    ['code-writer', 'apps/api/src/rooms/rooms.service.ts', null],
    ['code-writer', 'apps/api/src/database/migrations/1-Rooms.ts', null],
    ['code-writer', 'apps/web/src/app/x/Button.tsx', null],
    ['code-writer', 'apps/api/src/rooms/rooms.service.spec.ts', 'deny'],
    ['code-writer', 'apps/api/test/rooms.e2e-spec.ts', 'deny'],
    ['code-writer', 'apps/api/package.json', 'deny'],
    ['code-writer', 'CLAUDE.md', 'deny'],
    ['reviewer', 'apps/api/src/rooms/rooms.service.ts', 'deny'],
    ['reviewer', 'apps/api/src/rooms/rooms.service.spec.ts', 'deny'],
    ['advisor', 'openspec/changes/x/design.md', 'deny'],
  ];
  for (const [role, path, want] of cases) {
    it(`${role} edits ${path} -> ${want ?? 'no decision'}`, () => assert.equal(edit(role, path), want));
  }
  it('Write is treated like Edit', () => assert.equal(edit('code-writer', 'apps/api/src/x.spec.ts', 'Write'), 'deny'));
  it('a temp file is fine for every role', () => assert.equal(edit('reviewer', '/tmp/probe/x.ts'), null));
  it('a file outside the repo is denied', () => assert.equal(edit('code-writer', '/Users/x/elsewhere.ts'), 'deny'));
});

describe('role-guard: Bash', () => {
  const cases = [
    // reading and running tests is fine for everyone
    ['reviewer', 'git diff origin/main...HEAD -- apps', null],
    ['reviewer', 'git log --oneline -5', null],
    ['reviewer', 'git status --porcelain', null],
    ['reviewer', 'pnpm --filter api test -- rooms', null],
    ['reviewer', 'pnpm --filter api test:e2e', null],
    ['reviewer', 'cat apps/api/src/rooms/rooms.service.ts', null],
    ['reviewer', 'pnpm exec jest -t "a => b"', null],
    ['reviewer', 'pnpm test 2>&1 | tail -20', null],
    ['reviewer', 'cp -r apps /tmp/probe && sed -i s/a/b/ /tmp/probe/x.ts', null],
    // reviewer writes nothing in the repo
    ['reviewer', 'echo x > apps/api/src/x.ts', 'deny'],
    ['reviewer', "sed -i '' s/a/b/ apps/api/src/x.ts", 'deny'],
    ['reviewer', 'rm apps/api/src/x.ts', 'deny'],
    ['reviewer', 'touch apps/api/src/new.ts', 'deny'],
    ['reviewer', 'git commit -m x', 'deny'],
    ['reviewer', 'git stash', 'deny'],
    ['reviewer', 'git checkout -- apps', 'deny'],
    ['reviewer', 'pnpm --filter api lint:fix', 'deny'],
    ['reviewer', 'pnpm --filter web format', 'deny'],
    ['reviewer', 'pnpm exec prettier --write src/x.ts', 'deny'],
    ['reviewer', 'pnpm exec eslint --fix src/x.ts', 'deny'],
    ['reviewer', 'echo x > $F', 'deny'],
    ['reviewer', 'echo "unterminated', 'deny'],
    // writers: Bash writes only inside their own scope, no git writes
    ['test-writer', 'echo "x" >> apps/api/src/x.spec.ts', null],
    ['test-writer', 'echo "x" >> apps/api/src/x.ts', 'deny'],
    ['test-writer', 'pnpm --filter api test -- x.spec', null],
    ['test-writer', 'git add apps/api/src/x.spec.ts', 'deny'],
    ['code-writer', 'mv apps/api/src/a.ts apps/api/src/b.ts', null],
    ['code-writer', 'rm apps/api/src/x.spec.ts', 'deny'],
    ['code-writer', "sed -i '' s/a/b/ apps/api/test/x.e2e-spec.ts", 'deny'],
    ['code-writer', 'pnpm --filter api add lodash', 'deny'],
    ['code-writer', 'pnpm install --frozen-lockfile', null],
    ['code-writer', 'git commit -am x', 'deny'],
    ['code-writer', 'git branch', null],
  ];
  for (const [role, cmd, want] of cases) {
    it(`${role}: ${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bash(role, cmd), want));
  }
});

describe('role-guard: as a hook process', () => {
  const runAs = (args, stdin) => spawnSync(process.execPath, [join(HOOKS, 'role-guard.mjs'), ...args], { input: stdin, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: REPO } });
  const payload = (path) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(REPO, path) }, cwd: REPO });
  it('denies through stdout JSON', () => {
    const r = runAs(['code-writer'], payload('apps/api/src/x.spec.ts'));
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });
  it('no decision -> empty stdout, exit 0', () => {
    const r = runAs(['code-writer'], payload('apps/api/src/x.ts'));
    assert.equal(r.stdout, '');
    assert.equal(r.status, 0);
  });
  it('unknown or missing role -> deny', () => {
    assert.equal(JSON.parse(runAs(['boss'], payload('apps/api/src/x.ts')).stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(JSON.parse(runAs([], payload('apps/api/src/x.ts')).stdout).hookSpecificOutput.permissionDecision, 'deny');
  });
  it('malformed payload -> deny', () => {
    assert.equal(JSON.parse(runAs(['reviewer'], '{oops').stdout).hookSpecificOutput.permissionDecision, 'deny');
  });
});
