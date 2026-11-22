#!/usr/bin/env node
// L5 CI gate: every source file changed on this branch must have at least
// COVERAGE_MIN % statement coverage (default 80).
//   node scripts/check-coverage.mjs [base]   (base defaults to origin/main)
// Run `pnpm test:cov` first: it writes apps/*/coverage/coverage-final.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'origin/main';
const min = Number(process.env.COVERAGE_MIN ?? 80);
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

// Files that hold wiring or config, not logic worth a unit test.
const excluded = [
  /\.(spec|test|e2e-spec)\.tsx?$/,
  /\.d\.ts$/,
  /\/main\.ts$/,
  /\.module\.ts$/,
  /\/database\/(migrations\/|data-source\.ts|typeorm\.config\.ts)/,
  /\/test\/setup\.ts$/,
];

const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /^apps\/(api|web)\/src\/.+\.tsx?$/.test(f))
  .filter((f) => !excluded.some((re) => re.test(f)));

if (changed.length === 0) {
  console.log('OK: no changed source files need coverage.');
  process.exit(0);
}

const coverage = {};
for (const app of ['api', 'web']) {
  const file = resolve(root, `apps/${app}/coverage/coverage-final.json`);
  if (existsSync(file)) Object.assign(coverage, JSON.parse(readFileSync(file, 'utf8')));
}
if (Object.keys(coverage).length === 0) {
  console.log('FAIL: no coverage data in apps/*/coverage/coverage-final.json. Run `pnpm test:cov` first.');
  process.exit(1);
}

let failed = 0;
for (const f of changed) {
  const entry = coverage[resolve(root, f)];
  const counts = entry ? Object.values(entry.s) : [];
  const pct = counts.length ? (100 * counts.filter((n) => n > 0).length) / counts.length : 0;
  const ok = entry && pct >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${pct.toFixed(1).padStart(5)}%  ${f}${entry ? '' : '  (no test loads this file)'}`);
}

if (failed) {
  console.log(`\nFAIL: ${failed} changed file(s) below ${min}% statement coverage.`);
  process.exit(1);
}
console.log(`\nOK: every changed source file has >= ${min}% statement coverage.`);
