#!/usr/bin/env node
// PreToolUse access-guard: secrets and the repo boundary.
//   access-guard/secrets  deny  .env files, keys, gh/ssh/cloud credentials, `gh auth token`
//   access-guard/boundary ask   files outside the repo (temp dirs and ~/.claude excepted)
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { absPath, ask, deny, isInside, isMain, repoRoot, runHook, strictest, tempDirs } from './lib.mjs';
import { splitCommand } from './shell.mjs';

const SECRET_NAMES = [
  /^\.env(\..+)?$/, // .env, .env.local ... (".env.example" is allowed below)
  /^id_(rsa|ecdsa|ed25519|dsa)(\.pub)?$/,
  /\.(pem|key|p12|pfx)$/,
  /^\.git-credentials$/,
  /^\.npmrc$/,
  /^\.netrc$/,
  /^\.credentials\.json$/,
];
const SECRET_DIRS = ['/.ssh/', '/.aws/', '/.gnupg/', '/.config/gh/', '/.docker/config.json', '/.kube/'];

export const isSecretPath = (p) => {
  const name = basename(p);
  if (/\.example(\.|$)/.test(name)) return false; // .env.example, .env.example.bak
  if (SECRET_NAMES.some((re) => re.test(name))) return true;
  const norm = `/${p.replace(/\\/g, '/').replace(/^~\//, '')}/`;
  return SECRET_DIRS.some((d) => norm.includes(d));
};

const fileOf = (tool, input) => {
  if (['Read', 'Edit', 'Write', 'MultiEdit'].includes(tool)) return input.file_path;
  if (tool === 'NotebookEdit') return input.notebook_path;
  if (tool === 'Grep' || tool === 'Glob') return input.path || null;
  return null;
};

const checkPath = (p, cwd, root) => {
  if (!p) return null;
  if (isSecretPath(p)) return deny('access-guard/secrets', `${p} may hold credentials; never read or write it`);
  const abs = absPath(p.replace(/^~(?=\/|$)/, homedir()), cwd);
  if (isSecretPath(abs)) return deny('access-guard/secrets', `${p} may hold credentials; never read or write it`);
  if (isInside(abs, root)) return null;
  if (tempDirs().some((t) => isInside(abs, t))) return null;
  if (isInside(abs, `${homedir()}/.claude`)) return null; // memory, plans, skills
  return ask('access-guard/boundary', `${p} is outside the repo`);
};

export const decide = (payload) => {
  const { tool_name: tool, tool_input: input = {}, cwd = process.cwd() } = payload;
  const root = repoRoot();

  if (tool !== 'Bash') return strictest([checkPath(fileOf(tool, input), cwd, root)]);

  const cmd = String(input.command ?? '');
  const segments = splitCommand(cmd);
  if (!segments) {
    // Cannot see every word: only block when a secret name is visible anyway.
    return /(^|[\s'"=/])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'";|&)])/.test(cmd)
      ? deny('access-guard/secrets', 'command mentions a .env file')
      : null;
  }
  const decisions = [];
  // VAR=value prefixes are stripped by splitCommand; check their values here.
  for (const m of cmd.matchAll(/(?:^|[\s;&|(])[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|[^\s;&|)]*)/g)) {
    const value = m[1].replace(/^["']|["']$/g, '');
    if (value && isSecretPath(value)) decisions.push(deny('access-guard/secrets', `${value} may hold credentials`));
  }
  for (const words of segments) {
    const prog = basename(words[0]);
    const args = words.slice(1);
    if (prog === 'gh' && args[0] === 'auth' && (args[1] === 'token' || args.includes('--show-token'))) {
      decisions.push(deny('access-guard/secrets', 'printing the GitHub token'));
    }
    if (prog === 'git' && args[0] === 'credential') decisions.push(deny('access-guard/secrets', 'git credential helper'));
    if (prog === 'security' && /find-(generic|internet)-password/.test(args[0] ?? '')) {
      decisions.push(deny('access-guard/secrets', 'reading the macOS keychain'));
    }
    for (const w of words) {
      // Split on = : and redirections, so `cat<.env` and `x>.env` expose the file name.
      for (const part of w.split(/[=:<>|&]+/)) {
        if (part && isSecretPath(part)) decisions.push(deny('access-guard/secrets', `${part} may hold credentials`));
      }
    }
  }
  return strictest(decisions);
};

if (isMain(import.meta.url)) runHook('access-guard', decide);
