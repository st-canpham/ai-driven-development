#!/usr/bin/env node
// PostToolUse check-edit: fast feedback after the agent edits a TypeScript file in apps/.
// Runs ESLint on the file and only its related test (foo.ts -> foo.spec.ts in
// api, foo.test.ts(x) in web). Findings go back to Claude (exit 2) so it fixes
// them. Not a gate: the CI `ci` check is. When dependencies are missing it
// warns and lets the edit stand.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isMain, repoRel, repoRoot } from './lib.mjs';

const STEP_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 4000;

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: STEP_TIMEOUT_MS });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return { ok: false, out: `timed out after ${STEP_TIMEOUT_MS / 1000}s` };
  return { ok: r.status === 0, out };
};

export const relatedTest = (rel, exists = existsSync) => {
  const m = /^(apps\/(api|web)\/.+?)(\.(spec|test|e2e-spec))?\.(tsx?)$/.exec(rel);
  if (!m) return null;
  const [, stem, app, testKind] = m;
  if (testKind) return rel;
  const candidates = app === 'api' ? [`${stem}.spec.ts`] : [`${stem}.test.ts`, `${stem}.test.tsx`];
  return candidates.find((c) => exists(c)) ?? null;
};

export const checkFile = (rel, root) => {
  const m = /^apps\/(api|web)\/(src|test)\/.+\.tsx?$/.exec(rel);
  if (!m) return { skipped: true };
  const app = m[1];
  const appDir = `${root}/apps/${app}`;
  if (!existsSync(`${appDir}/node_modules`)) {
    return { warning: `check-edit: apps/${app}/node_modules is missing; run pnpm install to get lint/test feedback.` };
  }
  const inApp = rel.slice(`apps/${app}/`.length);
  const problems = [];

  const lint = run('pnpm', ['exec', 'eslint', '--max-warnings', '0', inApp], appDir);
  if (!lint.ok) problems.push(`ESLint (${rel}):\n${lint.out}`);

  const test = relatedTest(rel, (p) => existsSync(`${root}/${p}`));
  if (test && !/\.e2e-spec\.ts$/.test(test)) {
    const testInApp = test.slice(`apps/${app}/`.length);
    const args = app === 'api' ? ['exec', 'jest', testInApp] : ['exec', 'vitest', 'run', testInApp.replace(/^src\//, '')];
    const r = run('pnpm', args, appDir);
    if (!r.ok) problems.push(`Test (${test}):\n${r.out}`);
  }
  return { problems };
};

const main = async () => {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.stderr.write('check-edit: cannot read hook payload\n');
    process.exit(2);
  }
  const file = payload?.tool_input?.file_path;
  if (!file) process.exit(0);
  const root = repoRoot();
  const rel = repoRel(file, payload.cwd ?? process.cwd(), root);
  if (!rel) process.exit(0);

  const result = checkFile(rel, root);
  if (result.warning) {
    process.stderr.write(`${result.warning}\n`);
    process.exit(0);
  }
  if (result.problems?.length) {
    const text = result.problems.join('\n\n');
    process.stderr.write(`check-edit found problems after editing ${rel}; fix them:\n${text.slice(0, MAX_OUTPUT)}${text.length > MAX_OUTPUT ? '\n…(truncated)' : ''}\n`);
    process.exit(2);
  }
  process.exit(0);
};

if (isMain(import.meta.url)) main();
