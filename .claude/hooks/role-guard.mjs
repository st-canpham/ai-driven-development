#!/usr/bin/env node
// PreToolUse role-guard: write scope of the TDD subagents, set in each agent's
// frontmatter as `node .../role-guard.mjs <role>`. Deny only, never allow.
//
//   test-writer  edits test files only: *.spec.ts / *.test.ts(x) / *.e2e-spec.ts in apps/*,
//                anything under apps/api/test/ and apps/web/src/test/
//   code-writer  edits app code only: apps/*/src/** that is not a test file
//   reviewer     edits nothing; Bash is read-only (writes only to temp dirs)
//   advisor      edits nothing
// Every role: no git writes (the orchestrator commits), no write-mode formatters
// (check-edit formats the edited file), no Bash writes outside the role's scope.
import { basename } from 'node:path';
import { absPath, deny, isInside, isMain, repoRel, repoRoot, runHook, strictest, tempDirs } from './lib.mjs';
import { splitCommand } from './shell.mjs';

export const ROLES = ['test-writer', 'code-writer', 'reviewer', 'advisor'];

export const isTestFile = (rel) =>
  /^apps\/(api|web)\/.+\.(spec|test|e2e-spec)\.tsx?$/.test(rel) || /^apps\/api\/test\//.test(rel) || /^apps\/web\/src\/test\//.test(rel);

export const isAppCode = (rel) => /^apps\/(api|web)\/src\//.test(rel) && !isTestFile(rel);

// May `role` write the repo-relative path `rel`? (null rel = outside the repo)
const mayWrite = (role, rel) => {
  if (role === 'test-writer') return rel !== null && isTestFile(rel);
  if (role === 'code-writer') return rel !== null && isAppCode(rel);
  return false;
};

const SCOPE = {
  'test-writer': 'test files (*.spec.ts, *.test.ts(x), *.e2e-spec.ts, apps/api/test/, apps/web/src/test/)',
  'code-writer': 'app code under apps/*/src that is not a test file',
  reviewer: 'nothing (read-only)',
  advisor: 'nothing (read-only)',
};

const why = (role, text) => deny(`role-guard/${role}`, `${text}; a ${role} writes ${SCOPE[role]}`);

// Paths a Bash segment writes to, or a reason string when it is a write we never allow.
const GIT_WRITES = new Set(['commit', 'add', 'rm', 'mv', 'reset', 'checkout', 'switch', 'restore', 'stash', 'merge', 'rebase', 'cherry-pick', 'revert', 'push', 'pull', 'apply', 'am', 'tag', 'branch', 'clean', 'worktree', 'update-index', 'config']);
const writeTargets = (words) => {
  const prog = basename(words[0] ?? '');
  const args = words.slice(1);
  const out = { paths: [], forbidden: null };
  // Redirects: `> f`, `>> f`, `2> f`, `&> f`, or glued `>f`. A word that only contains
  // `>` (a quoted `x => y`, a test name) is not a redirect.
  words.forEach((w, k) => {
    const t = /^(\d*|&)>>?$/.test(w) ? words[k + 1] : /^(?:\d*|&)>>?(.+)$/.exec(w)?.[1];
    if (t && t !== '/dev/null' && !/^&\d$/.test(t)) out.paths.push(t);
  });
  const files = args.filter((a) => !a.startsWith('-'));
  if (prog === 'git') {
    const sub = args.find((a) => !a.startsWith('-'));
    if (GIT_WRITES.has(sub) && !(sub === 'branch' && args.length <= 1) && !(sub === 'stash' && args.includes('list'))) {
      out.forbidden = `git ${sub} (the orchestrator commits and moves branches)`;
    }
  }
  if (['rm', 'rmdir', 'unlink', 'touch', 'truncate', 'shred', 'mkdir', 'chmod'].includes(prog)) out.paths.push(...files);
  if (['mv', 'cp', 'install', 'ln', 'rsync'].includes(prog) && files.length) out.paths.push(files.at(-1));
  if (prog === 'mv') out.paths.push(...files.slice(0, -1));
  if (prog === 'tee') out.paths.push(...files);
  if (['sed', 'perl'].includes(prog) && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) out.paths.push(...files.slice(1));
  if (prog === 'dd') out.paths.push(...args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3)));
  const text = words.join(' ');
  if (/\bprettier\b.*\s--write\b|\beslint\b.*\s--fix\b|\bpnpm\b.*\b(format|lint:fix)\b/.test(text)) {
    out.forbidden ??= 'write-mode formatters (check-edit formats each edited file)';
  }
  if (/\b(pnpm|npm|yarn)\b.*\s(add|remove|install|i|up|update|upgrade)(\s|$)/.test(text) && !/\bpnpm\b.*\sinstall\s+--frozen-lockfile/.test(text)) {
    out.forbidden ??= 'changing dependencies (report the need to the orchestrator)';
  }
  return out;
};

export const bashDecisions = (role, cmd, cwd, root) => {
  const segments = splitCommand(cmd);
  if (!segments) return [why(role, 'a command that cannot be parsed safely')];
  const out = [];
  for (const words of segments) {
    const { paths, forbidden } = writeTargets(words);
    if (forbidden) out.push(why(role, forbidden));
    for (const p of paths) {
      if (/[$`*?[{]/.test(p)) {
        out.push(why(role, `writing to an expanded path ${p}`));
        continue;
      }
      const abs = absPath(p.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'), cwd);
      const rel = isInside(abs, root) ? repoRel(abs, cwd, root) : null;
      if (rel === null && tempDirs().some((d) => isInside(abs, d))) continue;
      if (!mayWrite(role, rel)) out.push(why(role, `writing ${p}`));
    }
  }
  return out;
};

export const decide = (payload, role = process.argv[2]) => {
  if (!ROLES.includes(role)) return deny('role-guard', `unknown role "${role}"; blocking to stay safe`);
  const { tool_name: tool, tool_input: input = {}, cwd = process.cwd() } = payload;
  const root = repoRoot();
  if (tool === 'Bash') return strictest(bashDecisions(role, String(input.command ?? ''), cwd, root));
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const file = String(input.file_path ?? input.notebook_path ?? '');
    const abs = absPath(file, cwd);
    if (!isInside(abs, root) && tempDirs().some((d) => isInside(abs, d))) return null;
    const rel = isInside(abs, root) ? repoRel(abs, cwd, root) : null;
    return mayWrite(role, rel) ? null : why(role, `editing ${rel ?? file}`);
  }
  return null;
};

if (isMain(import.meta.url)) runHook('role-guard', (p) => decide(p));
