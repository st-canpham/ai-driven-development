import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFile, relatedTest } from '../check-edit.mjs';
import { runRaw } from './harness.mjs';

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
