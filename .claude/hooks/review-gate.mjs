#!/usr/bin/env node
// Stop hook review-gate: a turn that leaves code under apps/ changed (against the
// merge-base with origin/main: commits, uncommitted edits and new files) ends only
// after /review-loop recorded a clean review of exactly that state.
//
//   node .claude/hooks/review-gate.mjs            Stop hook (reads the payload on stdin)
//   node .claude/hooks/review-gate.mjs --mark     end of a clean /review-loop: record the current state
//   node .claude/hooks/review-gate.mjs --status   print the fingerprint and what is recorded
//
// State lives in <worktree>/.claude/state/review-gate.json (gitignored), so every L4
// worktree has its own. The gate blocks once per state: a second stop on the same
// unreviewed state passes (and so does a stop Claude makes while already continuing
// from this hook), so a disagreement can never trap a session in a loop; the person
// sees why. If git cannot be read the gate lets the turn end and says so: a Stop hook
// that fails closed would lock the session.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isMain, repoRoot } from './lib.mjs';

const SCOPE = 'apps/';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

export const baseOf = (root) => {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(root, 'merge-base', 'HEAD', ref).trim();
    } catch {
      // try the next ref
    }
  }
  return git(root, 'rev-parse', 'HEAD').trim();
};

// Files changed under apps/ and a hash of their exact content; 'clean' when none.
export const fingerprint = (root) => {
  const base = baseOf(root);
  const diff = git(root, 'diff', '--binary', base, '--', SCOPE);
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '--', SCOPE).split('\n').filter(Boolean).sort();
  const files = [...new Set([...git(root, 'diff', '--name-only', base, '--', SCOPE).split('\n').filter(Boolean), ...untracked])].sort();
  if (!files.length) return { fp: 'clean', files };
  const h = createHash('sha256').update(diff);
  for (const f of untracked) h.update(`\0${f}\0`).update(readFileSync(join(root, f)));
  return { fp: h.digest('hex').slice(0, 16), files };
};

const statePath = (root) => join(root, '.claude', 'state', 'review-gate.json');
const readState = (root) => {
  try {
    return JSON.parse(readFileSync(statePath(root), 'utf8'));
  } catch {
    return {};
  }
};
const writeState = (root, state) => {
  mkdirSync(dirname(statePath(root)), { recursive: true });
  writeFileSync(statePath(root), `${JSON.stringify(state, null, 2)}\n`);
};

// Returns { block: reason } or { pass: note }.
export const check = (root, payload = {}) => {
  const { fp, files } = fingerprint(root);
  if (fp === 'clean') return { pass: 'no change under apps/' };
  const state = readState(root);
  if (state.reviewed === fp) return { pass: 'reviewed' };
  if (payload.stop_hook_active) return { pass: 'already continuing from this hook' };
  if (state.warned === fp) return { pass: 'blocked once on this state already; a person decides' };
  writeState(root, { ...state, warned: fp });
  const list = files.slice(0, 10).map((f) => `  - ${f}`).join('\n') + (files.length > 10 ? `\n  - … ${files.length - 10} more` : '');
  return {
    block:
      `review-gate: code under apps/ changed without a clean review of this exact state:\n${list}\n` +
      'Run /review-loop (reviewer, at most 3 passes). It ends with `node .claude/hooks/review-gate.mjs --mark` ' +
      'only when a pass is clean. If pass 3 still has open findings, stop and report them as blocked instead of marking. ' +
      'This gate blocks once per state.',
  };
};

const main = async () => {
  const root = repoRoot();
  const arg = process.argv[2];
  if (arg === '--mark') {
    const { fp, files } = fingerprint(root);
    writeState(root, { ...readState(root), reviewed: fp, reviewedAt: new Date().toISOString(), files });
    process.stdout.write(`review-gate: recorded a clean review of ${fp === 'clean' ? 'a clean tree' : `${files.length} file(s), ${fp}`}\n`);
    return;
  }
  if (arg === '--status') {
    const { fp, files } = fingerprint(root);
    process.stdout.write(`${JSON.stringify({ current: fp, files, ...readState(root) }, null, 2)}\n`);
    return;
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  let payload = {};
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    // An unreadable payload still gets the check; it only loses stop_hook_active.
  }
  let result;
  try {
    result = check(root, payload);
  } catch (e) {
    process.stderr.write(`review-gate: cannot read git state (${e.message}); not blocking\n`);
    return;
  }
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.block }));
};

if (isMain(import.meta.url)) main();
