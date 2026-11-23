#!/usr/bin/env node
// PreToolUse change-gate: risky commands and edits.
//
// Bash (every segment of the command is checked; the strictest decision wins):
//   change-gate/git      deny  push to main/master, --force, --mirror; worktree prune;
//                              history rewrite (filter-branch/filter-repo); reflog expire/delete,
//                              git prune, gc --prune=now (they remove the way back)
//                              (skipping the git hooks is githooks-guard's job)
//                        ask   reset --hard, clean -f, restore, checkout -- / . / -f / -B, switch -f / -C,
//                              stash drop/clear, branch -D / -f / -M, tag -d / -f, git rm -r / -f,
//                              push --force-with-lease / --delete, worktree add/remove (use task:new/clean)
//   change-gate/gh       deny  pr merge (a person merges); adding a person-only label; secrets; repo delete
//                        ask   pr close, label create/edit/delete, gh api writes (-X POST/PUT/PATCH/DELETE)
//   change-gate/deps     deny  npx, npm/pnpm publish   ask  adding or upgrading packages, pnpm dlx
//                        ask   other gh <area> delete (release, run, cache, issue ...)
//   change-gate/rm       deny  rm -r of /, ~, .., ., ./, *, .git, the repo itself or outside the repo
//                        ask   rm -r inside the repo (untracked work), except generated folders
//                              (node_modules, dist, build, coverage ...); targets with $VAR or globs
//   change-gate/bulk     ask   find -delete / -exec rm, truncate, shred, dd of=, chmod|chown -R, mv out of the repo
//   change-gate/db       ask   mysql/mariadb SQL with DROP / TRUNCATE / DELETE FROM
//   change-gate/shell    deny  sudo, su
//   change-gate/docker   ask   deleting volumes or pruning (DB data)
//   change-gate/db       deny  migrations with DB_HOST other than localhost / 127.0.0.1 / mysql
//   change-gate/parse    ask   a command that cannot be parsed safely
// Edits:
//   change-gate/high-risk ask  control plane: .github, .claude, .devcontainer, .githooks, scripts, docker,
//                              openspec schema/config, CLAUDE.md, lockfile, package.json, tool configs
//   change-gate/plan      deny code under apps/ while an OpenSpec change is active and the PR
//                              lacks plan:approved (ask when the PR cannot be read)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { absPath, ask, deny, isInside, isMain, repoRel, repoRoot, runHook, strictest, tempDirs } from './lib.mjs';
import { splitCommand } from './shell.mjs';

export const PERSON_LABELS = ['plan:approved', 'status:changes-requested', 'status:done', 'status:cancelled'];

const PROTECTED_BRANCHES = /^(\+?(HEAD:|refs\/heads\/)?(main|master))$|:(refs\/heads\/)?(main|master)$/;

const currentBranch = (cwd) => {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const gitRule = (args, cwd) => {
  const out = [];
  // Global options before the subcommand: -C <dir>, -c <k=v>, --git-dir=...
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    i += (a === '-c' || a === '-C') && i + 1 < args.length ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  const has = (...flags) => rest.some((a) => flags.includes(a));
  if (!sub) return out;

  if (sub === 'push') {
    if (rest.some((a) => PROTECTED_BRANCHES.test(a))) out.push(deny('change-gate/git', 'pushing to main; open a PR'));
    // No refspec (or HEAD) pushes the current branch: deny when that is main/master.
    const positional = rest.filter((a) => !a.startsWith('-'));
    if ((positional.length <= 1 || positional.slice(1).some((a) => /^HEAD(:|$)/.test(a))) && /^(main|master)$/.test(currentBranch(cwd))) {
      out.push(deny('change-gate/git', 'pushing the current branch, which is main; open a PR'));
    }
    if (has('--force', '-f', '--mirror', '--all') || rest.some((a) => /^-[a-zA-Z]*f/.test(a) && !a.startsWith('--')) || rest.some((a) => a.startsWith('+'))) {
      out.push(deny('change-gate/git', 'force or mirror push rewrites remote history'));
    } else if (rest.some((a) => a.startsWith('--force-with-lease') || a.startsWith('--force-if-includes'))) {
      out.push(ask('change-gate/git', 'force push (with lease) rewrites the branch'));
    }
    if (has('--delete', '-d') || rest.some((a) => /^:[^:]/.test(a))) out.push(ask('change-gate/git', 'deleting a remote branch'));
  }
  if (sub === 'reset' && has('--hard', '--merge', '--keep')) out.push(ask('change-gate/git', 'reset --hard discards work'));
  if (sub === 'clean' && rest.some((a) => /^-[a-zA-Z]*f/.test(a) || a === '--force')) out.push(ask('change-gate/git', 'clean -f deletes untracked files'));
  if (sub === 'restore' && !has('--staged', '-S')) out.push(ask('change-gate/git', 'restore discards working-tree changes'));
  if (sub === 'checkout') {
    if (rest.includes('--')) out.push(ask('change-gate/git', 'checkout -- discards working-tree changes'));
    // `git checkout .` / `./x` / `:/` are paths, not branches: they discard changes too.
    else if (rest.some((a) => a === '.' || a === ':/' || a.startsWith('./'))) out.push(ask('change-gate/git', `checkout ${rest.join(' ')} discards working-tree changes`));
    if (has('-f', '--force')) out.push(ask('change-gate/git', 'checkout -f discards working-tree changes'));
    if (has('-B')) out.push(ask('change-gate/git', 'checkout -B resets an existing branch'));
  }
  if (sub === 'switch' && has('-f', '--force', '--discard-changes', '-C', '--force-create')) {
    out.push(ask('change-gate/git', `switch ${rest.find((a) => a.startsWith('-'))} discards changes or resets a branch`));
  }
  if (sub === 'stash' && ['drop', 'clear'].includes(rest[0])) out.push(ask('change-gate/git', `stash ${rest[0]} deletes stashed work`));
  if (sub === 'branch' && (has('-D') || (has('--delete', '-d') && has('--force', '-f')))) {
    out.push(ask('change-gate/git', 'branch -D deletes unmerged work'));
  } else if (sub === 'branch' && has('-f', '--force', '-M', '-C')) {
    out.push(ask('change-gate/git', 'branch -f / -M moves or overwrites an existing branch'));
  }
  if (sub === 'tag' && has('-d', '--delete', '-f', '--force')) out.push(ask('change-gate/git', 'deleting or moving a tag'));
  if (sub === 'rm' && rest.some((a) => /^-[a-zA-Z]*[rf]/.test(a) || a === '--force')) out.push(ask('change-gate/git', 'git rm -r / -f deletes files from the working tree'));
  // The recovery paths: reflog entries and unreachable objects.
  if (sub === 'reflog' && ['expire', 'delete'].includes(rest[0])) out.push(deny('change-gate/git', `reflog ${rest[0]} removes the way back to lost commits`));
  if (sub === 'prune' || (sub === 'gc' && rest.some((a) => /^--prune=(now|all)$/.test(a)))) {
    out.push(deny('change-gate/git', 'pruning unreachable objects removes the way back to lost commits'));
  }
  if (sub === 'worktree') {
    if (rest[0] === 'prune') out.push(deny('change-gate/git', 'worktree prune deletes the other side\'s worktrees; use git worktree remove or task:clean'));
    else if (['add', 'remove', 'move'].includes(rest[0])) out.push(ask('change-gate/git', 'tasks get worktrees from pnpm task:new / task:clean'));
  }
  if (sub === 'filter-branch' || sub === 'filter-repo') out.push(deny('change-gate/git', 'history rewrite'));
  if (sub === 'update-ref' && has('-d')) out.push(ask('change-gate/git', 'deleting a ref'));
  return out;
};

const ghRule = (args) => {
  const out = [];
  const [area, verb] = args;
  const text = args.join(' ');
  if (area === 'pr' && verb === 'merge') out.push(deny('change-gate/gh', 'a person merges PRs'));
  if (area === 'pr' && verb === 'close') out.push(ask('change-gate/gh', 'closing a PR'));
  // Labels being added: --add-label / --label (repeatable, comma-separated), or
  // any person-only label sent through gh api. Removing one is allowed
  // (plan:approved goes back to plan:review when the plan changes).
  const added = args
    .flatMap((a, k) => {
      // --label / -l add a label only when creating or editing; on list/view they filter.
      const adding = a === '--add-label' || (['create', 'edit'].includes(verb) && (a === '--label' || a === '-l'));
      if (adding) return [args[k + 1] ?? ''];
      const m = /^--(add-label|label)=(.*)$/.exec(a);
      return m && (m[1] === 'add-label' || ['create', 'edit'].includes(verb)) ? [m[2]] : [];
    })
    .flatMap((v) => v.split(','));
  const viaApi = area === 'api' && /labels/.test(text) ? PERSON_LABELS.filter((l) => text.includes(l)) : [];
  const person = [...added.filter((v) => PERSON_LABELS.includes(v.trim())), ...viaApi];
  if (person.length) out.push(deny('change-gate/gh', `only a person adds ${person[0]}`));
  if (area === 'label' && ['create', 'edit', 'delete', 'clone'].includes(verb)) out.push(ask('change-gate/gh', `gh label ${verb}`));
  if (['secret', 'variable'].includes(area) && verb !== 'list') out.push(deny('change-gate/gh', `gh ${area} ${verb}`));
  if (area === 'repo' && ['delete', 'archive', 'rename', 'edit'].includes(verb)) out.push(deny('change-gate/gh', `gh repo ${verb}`));
  else if (['delete', 'delete-asset'].includes(verb) && area !== 'label') out.push(ask('change-gate/gh', `gh ${area} ${verb}`));
  if (area === 'ruleset' || (area === 'api' && /rulesets|branches\/[^/]+\/protection/.test(text))) {
    if (args.some((a) => /^(-X|--method)$/.test(a)) || /--method=|-X(POST|PUT|PATCH|DELETE)/i.test(text) || args.includes('--input')) {
      out.push(deny('change-gate/gh', 'changing branch protection / rulesets'));
    }
  }
  if (area === 'api') {
    const m = args.findIndex((a) => a === '-X' || a === '--method');
    const method = (m >= 0 ? args[m + 1] : (text.match(/--method=(\w+)/) ?? [])[1]) ?? (args.some((a) => /^(-f|-F|--field|--raw-field|--input)$/.test(a)) ? 'POST' : 'GET');
    if (method.toUpperCase() !== 'GET') out.push(ask('change-gate/gh', `gh api ${method.toUpperCase()}`));
  }
  return out;
};

const depsRule = (prog, args) => {
  const out = [];
  if (prog === 'npx' || prog === 'bunx') out.push(deny('change-gate/deps', `${prog} runs unpinned packages; add a pinned devDependency or use pnpm dlx <pkg>@<version>`));
  if (['npm', 'pnpm', 'yarn'].includes(prog)) {
    // Drop options and the values of options that take one (--filter api, -C dir).
    const valued = new Set(['--filter', '-F', '-C', '--dir', '--prefix', '-w', '--workspace', '--cwd']);
    const verbs = args.filter((a, k) => !a.startsWith('-') && !valued.has(args[k - 1]));
    const verb = verbs[0];
    if (verb === 'publish') out.push(deny('change-gate/deps', `${prog} publish`));
    if (['add', 'up', 'update', 'upgrade'].includes(verb)) out.push(ask('change-gate/deps', `${prog} ${verb}: say why in the PR`));
    if (['install', 'i'].includes(verb) && verbs.length > 1) out.push(ask('change-gate/deps', `${prog} ${verb} <package>: say why in the PR`));
    if (verb === 'dlx') out.push(ask('change-gate/deps', 'pnpm dlx runs a package from the registry'));
  }
  return out;
};

const rmRule = (args, cwd, root) => {
  const short = args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('');
  const recursive = /[rR]/.test(short) || args.includes('--recursive');
  const force = /f/.test(short) || args.includes('--force');
  if (!recursive) return [];
  const targets = args.filter((a) => !a.startsWith('-'));
  const out = [];
  for (const raw of targets) {
    // `./`, `../`, `.git/`, `~/` mean the same as without the slash.
    const t = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
    if (['/', '', '~', '$HOME', '..', '.', '*', '/*', '~/*', './*', '.*'].includes(t) || /(^|\/)\.git$/.test(t)) {
      return [deny('change-gate/rm', `rm -r ${raw}`)];
    }
    // $VAR, $(...), backticks or globs: the real target is unknown until the shell expands it.
    if (/[$`*?[{]/.test(t)) return [ask('change-gate/rm', `rm -r with an expanded target: ${raw}`)];
    const abs = absPath(t.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'), cwd);
    if (abs === absPath(root, cwd)) return [deny('change-gate/rm', `rm -r of the repo itself: ${raw}`)];
    if (!isInside(abs, root)) {
      if (tempDirs().some((d) => isInside(abs, d))) continue;
      return [deny('change-gate/rm', `rm -r outside the repo: ${raw}`)];
    }
    // Inside the repo: git brings back committed files, not untracked work.
    // Generated folders are fine to delete.
    if (!GENERATED.test(basename(abs))) out.push(ask('change-gate/rm', `rm -r ${raw} also deletes untracked work in it`));
  }
  if (force && targets.length === 0) out.push(ask('change-gate/rm', 'rm -rf with no visible target'));
  return out;
};

// Folders that tools recreate: deleting them loses nothing.
const GENERATED = /^(node_modules|dist|build|coverage|\.vite|\.cache|\.turbo|\.nyc_output|tmp|temp|\.pnpm-store)$/;

// Other commands that delete or overwrite in bulk.
const bulkRule = (prog, args, cwd, root, segmentText) => {
  const out = [];
  if (prog === 'find' && args.some((a, k) => a === '-delete' || (/^-(exec|execdir|ok|okdir)$/.test(a) && /^(rm|shred|unlink|truncate)$/.test(basename(args[k + 1] ?? ''))))) {
    out.push(ask('change-gate/bulk', 'find deletes every file it matches'));
  }
  if (prog === 'truncate' || prog === 'shred') out.push(ask('change-gate/bulk', `${prog} wipes file contents`));
  if (prog === 'dd' && args.some((a) => a.startsWith('of='))) out.push(ask('change-gate/bulk', 'dd of= overwrites its target'));
  if (['chmod', 'chown', 'chgrp'].includes(prog) && args.some((a) => /^-[a-zA-Z]*R/.test(a) || a === '--recursive')) {
    out.push(ask('change-gate/bulk', `${prog} -R changes a whole tree`));
  }
  if (prog === 'mv') {
    const paths = args.filter((a) => !a.startsWith('-'));
    const dest = paths.at(-1);
    if (paths.length >= 2 && !/[$`]/.test(dest) && !isInside(absPath(dest.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'), cwd), root)) {
      out.push(ask('change-gate/bulk', `mv out of the repo: ${dest}`));
    }
  }
  // SQL that drops or empties data, through the mysql CLI (directly or via docker exec).
  if (/\b(mysql|mariadb|mysqladmin)\b/.test(segmentText) && /\b(drop|truncate)\s+(database|schema|table)\b|\bdelete\s+from\b|\bmysqladmin\b.*\bdrop\b/i.test(segmentText)) {
    out.push(ask('change-gate/db', 'SQL that drops or deletes data'));
  }
  return out;
};

const dockerRule = (args) => {
  const text = args.join(' ');
  if (/\bvolume (rm|prune)\b|\bsystem prune\b|\bcompose\b.*\bdown\b.*(-v\b|--volumes)/.test(text)) {
    return [ask('change-gate/docker', 'this deletes Docker volumes (database data)')];
  }
  return [];
};

const bashDecisions = (cmd, cwd, root) => {
  const segments = splitCommand(cmd);
  if (!segments) return [ask('change-gate/parse', 'command cannot be parsed safely (unterminated quote or substitution)')];
  const out = [];
  if (/\bmigration:(run|revert)\b|\btypeorm\b/.test(cmd)) {
    const host = (cmd.match(/\bDB_HOST=([^\s;&|]+)/) ?? [])[1];
    if (host && !/^(localhost|127\.0\.0\.1|mysql)$/.test(host)) out.push(deny('change-gate/db', `migrations only against the local DB (DB_HOST=${host})`));
  }
  for (const words of segments) {
    const prog = basename(words[0]);
    const args = words.slice(1);
    if (prog === 'sudo' || prog === 'su' || prog === 'doas') out.push(deny('change-gate/shell', prog));
    if (prog === 'git') out.push(...gitRule(args, cwd));
    if (prog === 'gh') out.push(...ghRule(args));
    if (prog === 'rm') out.push(...rmRule(args, cwd, root));
    if (prog === 'docker') out.push(...dockerRule(args));
    out.push(...bulkRule(prog, args, cwd, root, words.join(' ')));
    out.push(...depsRule(prog, args));
  }
  return out;
};

// Paths an agent may change only with a person watching.
const HIGH_RISK = [
  /^\.github\//,
  /^\.claude\/(?!(LESSONS|METRICS|BACKLOG)\.md$)/,
  /^\.devcontainer\//,
  /^\.githooks\//,
  /^scripts\//,
  /^docker\//,
  /^docker-compose\.yml$/,
  /^openspec\/(schemas\/|config\.yaml$)/,
  /(^|\/)CLAUDE\.md$/,
  /^pnpm-(lock|workspace)\.yaml$/,
  /(^|\/)package\.json$/,
  /^\.mcp\.json$/,
  /^\.gitignore$/,
  /(^|\/)(eslint\.config\.[cm]?[jt]s|\.prettierrc|\.prettierignore|tsconfig[^/]*\.json|vitest\.config\.ts|nest-cli\.json)$/,
  /^apps\/api\/test\/jest-e2e\.json$/,
];

const activeChanges = (root) => {
  const dir = `${root}/openspec/changes`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'archive')
    .map((d) => d.name);
};

// PR labels for the current branch: HOOK_PR_LABELS overrides (tests); null = unknown.
const prLabels = (root) => {
  if (process.env.HOOK_PR_LABELS !== undefined) return process.env.HOOK_PR_LABELS.split(',').filter(Boolean);
  try {
    const out = execFileSync('gh', ['pr', 'view', '--json', 'labels', '-q', '.labels[].name'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
};

const editDecisions = (file, cwd, root) => {
  const rel = repoRel(file, cwd, root);
  if (rel === null) return [];
  const out = [];
  if (HIGH_RISK.some((re) => re.test(rel))) out.push(ask('change-gate/high-risk', `${rel} is part of the control plane`));
  if (/^apps\//.test(rel) && !/\.md$/.test(rel)) {
    const changes = activeChanges(root);
    if (changes.length) {
      const labels = prLabels(root);
      if (labels === null) out.push(ask('change-gate/plan', `cannot read the PR labels to confirm plan:approved for ${changes.join(', ')}`));
      else if (labels.includes('plan:review') || !labels.includes('plan:approved')) {
        out.push(deny('change-gate/plan', `OpenSpec change ${changes.join(', ')} is not approved yet (needs plan:approved, not plan:review); code waits for the plan`));
      }
    }
  }
  return out;
};

export const decide = (payload) => {
  const { tool_name: tool, tool_input: input = {}, cwd = process.cwd() } = payload;
  const root = repoRoot();
  if (tool === 'Bash') return strictest(bashDecisions(String(input.command ?? ''), cwd, root));
  const file = input.file_path ?? input.notebook_path;
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) && file) return strictest(editDecisions(file, cwd, root));
  return null;
};

if (isMain(import.meta.url)) runHook('change-gate', decide);
