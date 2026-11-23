// Shared helpers for the L5 agent hooks.
//
// Contract (Claude Code hooks):
//   - stdin: JSON payload ({ tool_name, tool_input, cwd, ... }).
//   - PreToolUse decision: exit 0 with
//     { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason } }.
//     These hooks only ever return "ask" or "deny": "allow" would skip the
//     normal permission prompt. No match = no output, the permission mode decides.
//   - exit 2 + stderr: blocking error, shown to Claude.
//
// Fail closed: a hook that cannot read its payload or throws must block, never
// silently allow (see runHook).
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// True when the module is the script node was started with (works with spaces in paths).
export const isMain = (url) => !!process.argv[1] && url === pathToFileURL(realish(process.argv[1])).href;

const RANK = { ask: 1, deny: 2 };

export const repoRoot = () => {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
};

// Strictest decision wins: deny > ask > none.
export const strictest = (decisions) =>
  decisions
    .filter(Boolean)
    .reduce((a, b) => ((RANK[b.decision] ?? 0) > (RANK[a.decision] ?? 0) ? b : a), { decision: null });

export const ask = (rule, why) => ({ decision: 'ask', reason: `${rule}: ${why}` });
export const deny = (rule, why) => ({ decision: 'deny', reason: `${rule}: ${why}` });

// realpath of the deepest existing ancestor, plus the rest. Needed for paths
// that do not exist yet behind symlinks (macOS /tmp -> /private/tmp).
const realish = (p) => {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    return parent === p ? p : join(realish(parent), basename(p));
  }
};

export const absPath = (p, cwd) => realish(isAbsolute(p) ? p : resolve(cwd, p));

export const isInside = (child, parent) => {
  const rel = relative(realish(parent), realish(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export const tempDirs = () => [tmpdir(), '/tmp', '/private/tmp', '/var/folders'];

// Repo-relative path with forward slashes, or null when outside the repo.
export const repoRel = (p, cwd, root) => {
  const abs = absPath(p, cwd);
  if (!isInside(abs, root)) return null;
  return relative(realish(root), abs).split(sep).join('/');
};

const readStdin = async () => {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
};

const emit = (event, d) => {
  if (!d.decision) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision: d.decision,
        permissionDecisionReason: d.reason,
      },
    }),
  );
};

// Runs a PreToolUse rule set. `decide(payload)` returns a decision object.
export const runHook = async (name, decide) => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
    if (!payload || typeof payload !== 'object' || typeof payload.tool_name !== 'string') {
      throw new Error('payload has no tool_name');
    }
  } catch (e) {
    emit('PreToolUse', deny(`${name}/payload`, `cannot read hook payload (${e.message}); blocking to stay safe`));
    process.exit(0);
  }
  try {
    emit('PreToolUse', decide(payload));
    process.exit(0);
  } catch (e) {
    process.stderr.write(`${name}: internal error, blocking to stay safe: ${e.stack || e}\n`);
    process.exit(2);
  }
};
