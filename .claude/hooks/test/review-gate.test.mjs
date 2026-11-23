import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HOOKS } from './harness.mjs';

const HOOK = join(HOOKS, 'review-gate.mjs');

// A repo whose `main` has one app file, then a feature branch.
const repo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-gate-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...a], { cwd: dir, stdio: 'ignore' });
  write(dir, 'apps/api/src/a.ts', 'a\n');
  write(dir, 'README.md', 'r\n');
  writeFileSync(join(dir, '.gitignore'), '.claude/state/\n');
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('switch', '-q', '-c', 'feat/x');
  return { dir, g };
};
const write = (dir, f, text) => {
  mkdirSync(dirname(join(dir, f)), { recursive: true });
  writeFileSync(join(dir, f), text);
};
const gate = (dir, ...args) => {
  const r = spawnSync(process.execPath, [HOOK, ...args], { cwd: dir, input: args.length ? '' : JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  return { blocked: r.stdout.startsWith('{') && JSON.parse(r.stdout).decision === 'block', out: r.stdout, err: r.stderr, status: r.status };
};
const stopActive = (dir) => spawnSync(process.execPath, [HOOK], { cwd: dir, input: JSON.stringify({ stop_hook_active: true }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } }).stdout;

describe('review-gate', () => {
  it('no change under apps/ -> passes', () => {
    const { dir } = repo();
    write(dir, 'README.md', 'changed docs\n');
    assert.equal(gate(dir).blocked, false);
  });

  it('uncommitted app change -> blocks once, names the file, then passes', () => {
    const { dir } = repo();
    write(dir, 'apps/api/src/a.ts', 'changed\n');
    const first = gate(dir);
    assert.equal(first.blocked, true);
    assert.match(JSON.parse(first.out).reason, /apps\/api\/src\/a\.ts/);
    assert.match(JSON.parse(first.out).reason, /\/review-loop/);
    assert.equal(gate(dir).blocked, false, 'second stop on the same state passes');
  });

  it('a new untracked file and a committed change count too', () => {
    const { dir, g } = repo();
    write(dir, 'apps/web/src/new.tsx', 'x\n');
    assert.equal(gate(dir).blocked, true);
    const { dir: d2, g: g2 } = repo();
    write(d2, 'apps/api/src/b.ts', 'b\n');
    g2('add', '-A');
    g2('commit', '-qm', 'b');
    assert.equal(gate(d2).blocked, true);
    void g;
  });

  it('--mark records the state; the stop passes; a later edit blocks again', () => {
    const { dir } = repo();
    write(dir, 'apps/api/src/a.ts', 'changed\n');
    assert.match(gate(dir, '--mark').out, /recorded a clean review of 1 file/);
    assert.equal(gate(dir).blocked, false);
    write(dir, 'apps/api/src/a.ts', 'changed again\n');
    assert.equal(gate(dir).blocked, true);
  });

  it('editing an untracked file changes the fingerprint', () => {
    const { dir } = repo();
    write(dir, 'apps/api/src/new.ts', 'v1\n');
    gate(dir, '--mark');
    write(dir, 'apps/api/src/new.ts', 'v2\n');
    assert.equal(gate(dir).blocked, true);
  });

  it('stop_hook_active -> passes without recording a warning', () => {
    const { dir } = repo();
    write(dir, 'apps/api/src/a.ts', 'changed\n');
    assert.equal(stopActive(dir), '');
    assert.equal(gate(dir).blocked, true, 'the real first stop still blocks');
  });

  it('state is per worktree, under .claude/state/', () => {
    const { dir } = repo();
    write(dir, 'apps/api/src/a.ts', 'changed\n');
    gate(dir, '--mark');
    const state = JSON.parse(readFileSync(join(dir, '.claude/state/review-gate.json'), 'utf8'));
    assert.match(state.reviewed, /^[0-9a-f]{16}$/);
    assert.deepEqual(state.files, ['apps/api/src/a.ts']);
    assert.match(gate(dir, '--status').out, /"current"/);
  });

  it('not a git repo -> does not block, says why', () => {
    const dir = mkdtempSync(join(tmpdir(), 'review-gate-nogit-'));
    const r = gate(dir);
    assert.equal(r.blocked, false);
    assert.match(r.err, /cannot read git state/);
    assert.equal(r.status, 0);
  });
});
