import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { homedir } from 'node:os';
import { bash, run, runRaw, REPO } from './harness.mjs';

const H = 'access-guard.mjs';

describe('access-guard: files', () => {
  const cases = [
    ['Read', '.env', 'deny'],
    ['Read', 'apps/api/.env', 'deny'],
    ['Edit', 'apps/web/.env', 'deny'],
    ['Write', '.worktrees/add-x/.env', 'deny'],
    ['Read', '.env.local', 'deny'],
    ['Read', `${homedir()}/.ssh/id_ed25519`, 'deny'],
    ['Read', `${homedir()}/.config/gh/hosts.yml`, 'deny'],
    ['Read', 'certs/server.pem', 'deny'],
    ['Read', '.env.example', null],
    ['Read', 'apps/api/.env.example', null],
    ['Read', 'apps/api/src/app.service.ts', null],
    ['Read', '/etc/hosts', 'ask'],
    ['Read', `${homedir()}/Desktop/other-project/README.md`, 'ask'],
    ['Read', '/tmp/scratch.txt', null],
    ['Read', `${homedir()}/.claude/projects/x/memory/MEMORY.md`, null],
  ];
  for (const [tool, path, want] of cases) {
    it(`${tool} ${path} -> ${want ?? 'no decision'}`, () => {
      assert.equal(run(H, tool, { file_path: path.startsWith('/') ? path : `${REPO}/${path}` }).decision, want);
    });
  }
  it('Grep in a secret dir is denied', () => {
    assert.equal(run(H, 'Grep', { pattern: 'x', path: `${homedir()}/.aws` }).decision, 'deny');
  });
  it('Glob without a path stays in the repo', () => {
    assert.equal(run(H, 'Glob', { pattern: '**/*.ts' }).decision, null);
  });
});

describe('access-guard: bash', () => {
  const cases = [
    ['cat .env', 'deny'],
    ['source ./apps/api/.env && pnpm dev:api', 'deny'],
    ['grep DB_PASSWORD apps/api/.env', 'deny'],
    ['echo "$(cat .env)"', 'deny'],
    ['bash -c "cat apps/web/.env"', 'deny'],
    ['DOTENV_CONFIG_PATH=.env node x.js', 'deny'],
    ['gh auth token', 'deny'],
    ['gh auth status --show-token', 'deny'],
    ['git credential fill', 'deny'],
    ['cat ~/.ssh/id_rsa', 'deny'],
    ['cat .env.example', null],
    ['cp .env.example .env.example.bak', null],
    ['grep -r "process.env" apps/api/src', null],
    ['gh auth status', null],
    ['pnpm test', null],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bash(H, cmd).decision, want));
  }
  it('unparseable command that names .env is denied', () => {
    assert.equal(bash(H, 'cat .env "unterminated').decision, 'deny');
  });
});

describe('access-guard: fail closed', () => {
  it('malformed JSON is denied', () => {
    const r = runRaw(H, '{not json');
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /access-guard\/payload/);
  });
  it('payload without tool_name is denied', () => {
    assert.equal(runRaw(H, '{}').decision, 'deny');
  });
  it('empty stdin is denied', () => {
    assert.equal(runRaw(H, '').decision, 'deny');
  });
});
