#!/usr/bin/env node
// PreToolUse githooks-guard: the agent never skips or disables the git hooks
// (.githooks/pre-commit, L5c). Every rule denies; editing the hook itself stays
// an *ask* in change-gate (control plane), so a person approves real changes.
//
// Bash (every segment of the command is checked):
//   - --no-verify (and its prefixes) on any git command; `git commit -n`
//   - core.hooksPath in any git command: -c, --config-env, git config (set, unset, get)
//   - git config that can change it indirectly: --remove-section/--rename-section core,
//     --edit, include.path / includeIf.*.path
//   - GIT_CONFIG_PARAMETERS / GIT_CONFIG_COUNT / GIT_CONFIG_KEY_<n> (config from env)
//   - git commit-tree (makes a commit without running hooks)
//   - deleting, moving, overwriting or un-executing .githooks/*, .git/hooks/*, .git/config:
//     rm, mv, cp, ln, chmod (except +x), truncate, tee, sed -i, perl -i, > / >> redirects,
//     git rm / git mv / git update-index (except --chmod=+x)
// Edits (Edit, Write, MultiEdit, NotebookEdit):
//   - .git/config, .git/config.worktree, .git/hooks/*, .git/worktrees/*/config.worktree
import { basename } from 'node:path';
import { deny, isMain, runHook, strictest } from './lib.mjs';
import { splitCommand } from './shell.mjs';

const RULE = 'githooks-guard';
const why = (text) => deny(RULE, `${text}; the git hooks must run (fix what they report instead)`);

const HOOK_FILES = /(^|\/)\.githooks(\/|$)|(^|\/)\.git\/hooks(\/|$)/;
const GIT_CONFIG = /(^|\/)\.git\/(config(\.worktree)?|worktrees\/[^/]+\/config\.worktree)$/;
export const isProtected = (p) => HOOK_FILES.test(p) || GIT_CONFIG.test(p);

const NO_VERIFY = /^--no-v(e(r(i(f(y)?)?)?)?)?$/;
const HOOKS_PATH = /core\.hookspath/i;
const ENV_CONFIG = /(^|[\s;&|(])(export\s+)?GIT_CONFIG_(PARAMETERS|COUNT|KEY_\d+)=/;
// Programs that delete, move or overwrite the files they are given.
const WRITERS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'mv', 'cp', 'ln', 'install', 'rsync', 'truncate', 'tee', 'dd']);

const gitRule = (args) => {
  const out = [];
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    const value = (a === '-c' || a === '-C' || a === '--config-env') && i + 1 < args.length ? args[i + 1] : '';
    if (HOOKS_PATH.test(a) || (a !== '-C' && HOOKS_PATH.test(value))) out.push(why('overriding core.hooksPath'));
    i += value ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return out;

  if (rest.some((a) => NO_VERIFY.test(a))) out.push(why('--no-verify skips the git hooks'));
  if (sub === 'commit' && rest.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) out.push(why('commit -n skips the git hooks'));
  if (sub === 'commit-tree') out.push(why('git commit-tree makes a commit without the hooks'));
  if (sub === 'config') {
    if (rest.some((a) => HOOKS_PATH.test(a))) out.push(why('git config on core.hooksPath (read or write)'));
    if (rest.some((a, k) => /^--(remove|rename)-section$/.test(a) && /^core$/i.test(rest[k + 1] ?? ''))) {
      out.push(why('removing the [core] section drops core.hooksPath'));
    }
    if (rest.some((a) => a === '--edit' || a === '-e' || a === 'edit')) out.push(why('git config --edit can change core.hooksPath'));
    if (rest.some((a) => /^include(if\..*)?\.path$/i.test(a))) out.push(why('an included config file can set core.hooksPath'));
  }
  if (['rm', 'mv'].includes(sub) && rest.some(isProtected)) out.push(why(`git ${sub} of a git hook`));
  if (sub === 'update-index' && rest.some(isProtected) && !rest.includes('--chmod=+x')) out.push(why('git update-index on a git hook'));
  return out;
};

export const bashDecisions = (cmd) => {
  const out = [];
  if (ENV_CONFIG.test(cmd)) out.push(why('git config from environment variables can override core.hooksPath'));
  const segments = splitCommand(cmd);
  if (!segments) {
    // Cannot see every word: still deny when the obvious markers are visible.
    if (/--no-verify|core\.hookspath/i.test(cmd)) out.push(why('cannot parse a command that mentions skipping the hooks'));
    return out;
  }
  for (const words of segments) {
    const prog = basename(words[0] ?? '');
    const args = words.slice(1);
    if (prog === 'git') out.push(...gitRule(args));
    // Redirects: `> .githooks/pre-commit`, `x>>.git/config`.
    words.forEach((w, k) => {
      const target = /^\d*>>?$/.test(w) ? words[k + 1] : /\d*>>?(.+)$/.exec(w)?.[1];
      if (target && isProtected(target)) out.push(why(`overwriting ${target}`));
    });
    const targets = args.filter(isProtected);
    if (!targets.length) continue;
    if (WRITERS.has(prog)) out.push(why(`${prog} of ${targets.join(', ')}`));
    // Only adding the execute bit is allowed (`chmod +x`, `chmod u+x`).
    if (prog === 'chmod' && !args.every((a) => isProtected(a) || /^[ugoa]*\+x$/.test(a) || /^-[Rv]+$/.test(a))) {
      out.push(why(`chmod of ${targets.join(', ')} (only +x is allowed)`));
    }
    if (['sed', 'perl'].includes(prog) && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
      out.push(why(`${prog} -i on ${targets.join(', ')}`));
    }
  }
  return out;
};

export const decide = (payload) => {
  const { tool_name: tool, tool_input: input = {} } = payload;
  if (tool === 'Bash') return strictest(bashDecisions(String(input.command ?? '')));
  const file = String(input.file_path ?? input.notebook_path ?? '');
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) && GIT_CONFIG.test(file.replaceAll('\\', '/'))) {
    return why(`editing ${file} can change core.hooksPath`);
  }
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) && /(^|\/)\.git\/hooks\//.test(file.replaceAll('\\', '/'))) {
    return why(`editing ${file}`);
  }
  return null;
};

if (isMain(import.meta.url)) runHook(RULE, decide);
