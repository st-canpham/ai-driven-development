// Runs scripts/check-plan.sh against throwaway git repos.
//   node --test scripts/test/*.test.mjs
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-plan.sh');

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

// Repo with a base commit, then one commit that adds `files`. Returns { dir, base }.
const repoWith = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-plan-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'README.md'), '# r\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), `// ${f}\n`);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'change');
  return { dir, base };
};

const check = (files, labels) => {
  const { dir, base } = repoWith(files);
  const r = spawnSync('bash', [SCRIPT, base], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CHECK_PLAN_LABELS: labels },
  });
  return { status: r.status, out: r.stdout + r.stderr };
};

const cases = [
  // [name, files, labels, expected exit, output pattern]
  ['docs only + tier-0 + type:docs', ['README.md', 'docs/guide.md'], 'plan:tier-0,type:docs', 0, /documentation only/],
  ['docs only + tier-0 only', ['README.md'], 'plan:tier-0', 1, /needs plan:tier-0 and type:docs/],
  ['docs only + no label', ['docs/guide.md'], '', 1, /needs plan:tier-0 and type:docs/],
  ['apps/web/CLAUDE.md is not docs', ['apps/web/CLAUDE.md'], 'plan:tier-0,type:docs', 1, /type:docs, but/],
  ['.claude/ markdown is not docs', ['.claude/BACKLOG.md'], 'plan:tier-0', 0, /plan:tier-0/],
  ['CLAUDE.md + tier-0', ['CLAUDE.md'], 'plan:tier-0', 0, /plan:tier-0/],
  ['control plane, no label', ['.github/workflows/ci.yml'], '', 1, /every change needs/],
  ['control plane + tier-0', ['.claude/hooks/x.mjs', '.devcontainer/devcontainer.json'], 'plan:tier-0', 0, /plan:tier-0/],
  ['type:docs on a code change', ['README.md', 'scripts/x.sh'], 'plan:tier-0,type:docs', 1, /type:docs, but/],
  ['service + tier-0', ['apps/api/src/rooms/rooms.service.ts'], 'plan:tier-0', 0, /plan:tier-0/],
  ['service, no label', ['apps/api/src/rooms/rooms.service.ts'], '', 1, /every change needs/],
  ['tests only + tier-0', ['apps/api/src/rooms/rooms.service.spec.ts'], 'plan:tier-0', 0, /plan:tier-0/],
  ['controller + tier-0', ['apps/api/src/rooms/rooms.controller.ts'], 'plan:tier-0', 1, /interface files/],
  ['controller spec + tier-0 (test, not interface)', ['apps/api/src/rooms/rooms.controller.spec.ts'], 'plan:tier-0', 0, /plan:tier-0/],
  ['DTO + tier-0', ['apps/api/src/rooms/dto/create-room.dto.ts'], 'plan:tier-0', 1, /interface files/],
  ['migration + tier-0', ['apps/api/src/database/migrations/1-Rooms.ts'], 'plan:tier-0', 1, /interface files/],
  ['web endpoint + tier-0', ['apps/web/src/config/endpoint.ts'], 'plan:tier-0', 1, /interface files/],
  ['plan + approved', ['openspec/changes/add-x/proposal.md', 'apps/api/src/rooms/rooms.controller.ts'], 'plan:approved', 0, /plan approved/],
  ['plan + review', ['openspec/changes/add-x/proposal.md'], 'plan:review', 1, /needs plan:approved/],
  ['plan + approved + review', ['openspec/changes/add-x/proposal.md'], 'plan:approved,plan:review', 1, /needs plan:approved/],
  ['archived plan + approved', ['openspec/changes/archive/2026-11-25-add-x/proposal.md', 'openspec/specs/x/spec.md'], 'plan:approved', 0, /plan approved/],
  ['old label name tier-0', ['apps/api/src/x.ts'], 'tier-0', 1, /every change needs/],
];

describe('check-plan.sh', () => {
  for (const [name, files, labels, want, pattern] of cases) {
    it(`${name} -> exit ${want}`, () => {
      const r = check(files, labels);
      assert.equal(r.status, want, r.out);
      assert.match(r.out, pattern);
    });
  }
  it('nothing changed -> exit 0', () => {
    const r = check([], '');
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /nothing changed/);
  });
});
