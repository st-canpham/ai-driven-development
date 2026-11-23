import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFile, relatedTest } from '../check-edit.mjs';
import { REPO, runRaw } from './harness.mjs';

describe('check-edit: related test', () => {
  const files = new Set([
    'apps/api/src/rooms/rooms.service.spec.ts',
    'apps/web/src/app/shared/utils/error.utils.test.ts',
    'apps/web/src/app/shared/components/partials/Button.test.tsx',
  ]);
  const exists = (p) => files.has(p);
  const cases = [
    ['apps/api/src/rooms/rooms.service.ts', 'apps/api/src/rooms/rooms.service.spec.ts'],
    ['apps/api/src/rooms/rooms.service.spec.ts', 'apps/api/src/rooms/rooms.service.spec.ts'],
    ['apps/api/src/rooms/rooms.controller.ts', null],
    ['apps/web/src/app/shared/utils/error.utils.ts', 'apps/web/src/app/shared/utils/error.utils.test.ts'],
    ['apps/web/src/app/shared/components/partials/Button.tsx', 'apps/web/src/app/shared/components/partials/Button.test.tsx'],
    ['apps/api/test/app.e2e-spec.ts', 'apps/api/test/app.e2e-spec.ts'],
    ['README.md', null],
  ];
  for (const [file, want] of cases) {
    it(`${file} -> ${want ?? 'none'}`, () => assert.equal(relatedTest(file, exists), want));
  }
});

describe('check-edit: scope', () => {
  it('skips files outside apps/*/src|test', () => {
    assert.deepEqual(checkFile('scripts/plan-gate.sh', '/nowhere'), { skipped: true });
    assert.deepEqual(checkFile('apps/web/vite.config.ts', '/nowhere'), { skipped: true });
  });
  it('warns, does not block, when node_modules is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-edit-'));
    mkdirSync(join(root, 'apps/api/src'), { recursive: true });
    const r = checkFile('apps/api/src/x.ts', root);
    assert.match(r.warning, /node_modules is missing/);
  });
});

describe('check-edit: hook process', () => {
  it('malformed payload exits 2', () => assert.equal(runRaw('check-edit.mjs', 'nope').status, 2));
  it('non-code edit exits 0 with no output', () => {
    const r = runRaw('check-edit.mjs', JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'README.md' } }));
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

describe('check-edit: formats with Prettier on real files', () => {
  // Needs installed dependencies (pnpm install); CI installs before this step.
  const ready = (app) => existsSync(join(REPO, `apps/${app}/node_modules`));
  const edit = (rel) => runRaw('check-edit.mjs', JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(REPO, rel) }, cwd: REPO }));
  const withFile = (rel, content, fn) => {
    const abs = join(REPO, rel);
    writeFileSync(abs, content);
    try {
      fn(abs);
    } finally {
      rmSync(abs, { force: true });
    }
  };

  for (const [app, rel] of [
    ['api', 'apps/api/src/__check_edit_fmt__.ts'],
    ['web', 'apps/web/src/app/__check_edit_fmt__.ts'],
  ]) {
    it(`${app}: badly formatted file is fixed and passes`, { skip: !ready(app) }, () => {
      withFile(rel, 'export const   twice=(n:number)=>{return n*2}\n', (abs) => {
        const r = edit(rel);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(readFileSync(abs, 'utf8'), 'export const twice = (n: number) => {\n  return n * 2;\n};\n');
      });
    });
  }
  it('api: syntax error is reported, file left as is', { skip: !ready('api') }, () => {
    const rel = 'apps/api/src/__check_edit_fmt__.ts';
    withFile(rel, 'export const x = (;\n', (abs) => {
      const r = edit(rel);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /Prettier could not format/);
      assert.equal(readFileSync(abs, 'utf8'), 'export const x = (;\n');
    });
  });
  it('web: a lint problem that is not formatting still goes back to the agent', { skip: !ready('web') }, () => {
    const rel = 'apps/web/src/app/__check_edit_fmt__.ts';
    withFile(rel, 'export const f = (x: number) => {\n  if (x == 1) return 1;\n  return 2;\n};\n', () => {
      const r = edit(rel);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /eqeqeq/);
    });
  });
});
