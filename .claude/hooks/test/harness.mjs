// Runs a hook as Claude Code does: JSON payload on stdin, decision on stdout.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = join(HOOKS, '..', '..');

// Returns { decision: 'ask'|'deny'|null, reason, status, stderr }.
export const runRaw = (hook, stdin, env = {}) => {
  const r = spawnSync(process.execPath, [join(HOOKS, hook)], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO, ...env },
  });
  let decision = null;
  let reason = '';
  if (r.stdout.trim()) {
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    decision = out.permissionDecision;
    reason = out.permissionDecisionReason;
  }
  return { decision, reason, status: r.status, stderr: r.stderr };
};

export const run = (hook, tool_name, tool_input, env = {}, cwd = REPO) =>
  runRaw(hook, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input, cwd }), env);

export const bash = (hook, command, env) => run(hook, 'Bash', { command }, env);

// A throwaway repo root with openspec/changes/<name> folders, for the plan gate.
export const fixtureRepo = (changes = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'hook-fixture-'));
  mkdirSync(join(dir, 'openspec/changes/archive'), { recursive: true });
  for (const c of changes) {
    mkdirSync(join(dir, 'openspec/changes', c), { recursive: true });
    writeFileSync(join(dir, 'openspec/changes', c, 'proposal.md'), '# p\n');
  }
  mkdirSync(join(dir, 'apps/api/src'), { recursive: true });
  return dir;
};
