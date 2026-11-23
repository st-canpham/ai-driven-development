import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { bash, fixtureRepo, run, runRaw, REPO } from './harness.mjs';

const H = 'change-gate.mjs';

// Some git rules depend on the current branch (a bare `git push` on main is
// denied), so git cases run in a throwaway repo on a known branch, never in
// whatever branch this checkout happens to be on.
const repoOn = (branch) => {
  const dir = fixtureRepo([]);
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', branch);
  g('commit', '-q', '--allow-empty', '-m', 'x');
  return dir;
};
const bashIn = (dir, cmd) => run(H, 'Bash', { command: cmd }, { CLAUDE_PROJECT_DIR: dir }, dir).decision;

describe('change-gate: git', () => {
  const cases = [
    ['git push origin main', 'deny'],
    ['git push origin HEAD:main', 'deny'],
    ['git push origin feat/x:refs/heads/master', 'deny'],
    ['git push --force origin feat/x', 'deny'],
    ['git push -f', 'deny'],
    ['git push origin +feat/x', 'deny'],
    ['git push --mirror', 'deny'],
    ['git push --force-with-lease', 'ask'],
    ['git push origin --delete feat/x', 'ask'],
    ['git push -u origin feat/room-management', null],
    ['git commit --no-verify -m x', null], // githooks-guard's job
    ['git reset --hard origin/main', 'ask'],
    ['git reset --soft HEAD~1', null],
    ['git clean -fd', 'ask'],
    ['git restore apps/api/src/x.ts', 'ask'],
    ['git restore --staged x.ts', null],
    ['git checkout -- .', 'ask'],
    ['git checkout -b feat/x', null],
    ['git branch -D feat/x', 'ask'],
    ['git branch -d feat/x', null],
    ['git worktree prune', 'deny'],
    ['git worktree add ../x', 'ask'],
    ['git worktree list', null],
    ['git filter-repo --path x', 'deny'],
    ['git status && git push origin main', 'deny'],
    ['bash -c "git worktree prune"', 'deny'],
    ['eval git reset --hard', 'ask'],
    ['echo "$(git push -f)"', 'deny'],
  ];
  const feature = repoOn('feat/x');
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bashIn(feature, cmd), want));
  }
});

describe('change-gate: gh', () => {
  const cases = [
    ['gh pr merge 5 --squash', 'deny'],
    ['gh pr edit 5 --add-label plan:approved', 'deny'],
    ['gh pr edit 5 --add-label "status:in-progress,status:done"', 'deny'],
    ['gh pr edit 5 --add-label=status:cancelled', 'deny'],
    ['gh pr create --label status:done --title x --body y', 'deny'],
    ['gh api repos/o/r/issues/5/labels -f "labels[]=plan:approved"', 'deny'],
    ['gh pr edit 5 --add-label status:code-review --remove-label status:in-progress', null],
    ['gh pr edit 5 --add-label plan:review --remove-label plan:approved', null],
    ['gh pr edit 5 --add-label plan:tier-0', null],
    ['gh pr close 5', 'ask'],
    ['gh label delete bug --yes', 'ask'],
    ['gh secret set TOKEN', 'deny'],
    ['gh repo delete o/r --yes', 'deny'],
    ['gh api -X POST repos/o/r/rulesets --input r.json', 'deny'],
    ['gh api -X DELETE repos/o/r/git/refs/heads/x', 'ask'],
    ['gh api repos/o/r/pulls/5', null],
    ['gh pr view 5 --json labels', null],
    ['gh pr list --label status:done', null],
    ['gh issue list -l plan:approved', null],
    ['gh pr list --label=status:done', null],
    ['gh issue create -l plan:approved --title x --body y', 'deny'],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bash(H, cmd).decision, want));
  }
});

describe('change-gate: deps, rm, shell, docker, db', () => {
  const cases = [
    ['npx prettier --write .', 'deny'],
    ['nice -n 10 npx foo', 'deny'],
    ['pnpm publish', 'deny'],
    ['pnpm add lodash', 'ask'],
    ['pnpm --filter api add -D @types/x', 'ask'],
    ['pnpm install', null],
    ['pnpm install --frozen-lockfile', null],
    ['pnpm dlx @fission-ai/openspec@1.13.0 list', 'ask'],
    ['pnpm test', null],
    ['rm -rf /', 'deny'],
    ['rm -rf ~', 'deny'],
    ['rm -rf .git', 'deny'],
    ['rm -rf ../other', 'deny'],
    ['ls | xargs -n 1 rm -rf /etc', 'deny'],
    ['rm -rf apps/web/coverage', null],
    ['D=/; rm -rf $D', 'ask'],
    ['rm -rf "$HOME"/x', 'ask'],
    ['rm -rf $(pwd)/..', 'ask'],
    ['rm -rf apps/*/coverage', 'ask'],
    ['rm -rf /tmp/x', null],
    ['rm --force file.txt', null],
    ['sudo apt-get install x', 'deny'],
    ['docker compose down -v', 'ask'],
    ['docker volume rm ai_mysql-data', 'ask'],
    ['docker compose up -d mysql', null],
    ['DB_HOST=prod.example.com pnpm --filter api migration:run', 'deny'],
    ['DB_HOST=127.0.0.1 pnpm --filter api migration:run', null],
    ['pnpm --filter api migration:run', null],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bash(H, cmd).decision, want));
  }
  it('unparseable command asks', () => {
    assert.equal(bash(H, 'echo "unterminated').decision, 'ask');
  });
});

describe('change-gate: edits', () => {
  const edit = (path, env, root = REPO) =>
    run(H, 'Edit', { file_path: join(root, path), old_string: 'a', new_string: 'b' }, { CLAUDE_PROJECT_DIR: root, ...env }, root);

  for (const p of ['.github/workflows/ci.yml', '.githooks/pre-commit', '.claude/settings.json', '.claude/hooks/lib.mjs', 'scripts/plan-gate.sh', 'CLAUDE.md', 'apps/web/CLAUDE.md', 'package.json', 'apps/api/package.json', 'pnpm-lock.yaml', 'openspec/config.yaml', 'apps/web/eslint.config.mjs', 'apps/api/tsconfig.json']) {
    it(`high-risk ${p} -> ask`, () => assert.equal(edit(p, { HOOK_PR_LABELS: '' }).decision, 'ask'));
  }
  for (const p of ['.claude/LESSONS.md', '.claude/METRICS.md', 'README.md', 'openspec/changes/add-x/design.md']) {
    it(`log/doc ${p} -> no decision`, () => assert.equal(edit(p, { HOOK_PR_LABELS: '' }).decision, null));
  }

  it('apps/ code with no active change -> no decision (Tier 0 path)', () => {
    const root = fixtureRepo([]);
    assert.equal(edit('apps/api/src/x.ts', { HOOK_PR_LABELS: '' }, root).decision, null);
  });
  it('apps/ code, active change, plan:review -> deny', () => {
    const root = fixtureRepo(['add-room-management']);
    const r = edit('apps/api/src/x.ts', { HOOK_PR_LABELS: 'plan:review,status:in-progress' }, root);
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /add-room-management/);
  });
  it('apps/ code, active change, no labels -> deny', () => {
    assert.equal(edit('apps/api/src/x.ts', { HOOK_PR_LABELS: '' }, fixtureRepo(['add-x'])).decision, 'deny');
  });
  it('apps/ code, active change, plan:approved -> no decision', () => {
    assert.equal(edit('apps/api/src/x.ts', { HOOK_PR_LABELS: 'plan:approved,status:in-progress' }, fixtureRepo(['add-x'])).decision, null);
  });
  it('apps/ code, active change, approved and review -> deny', () => {
    assert.equal(edit('apps/api/src/x.ts', { HOOK_PR_LABELS: 'plan:approved,plan:review' }, fixtureRepo(['add-x'])).decision, 'deny');
  });
  it('archived changes only -> no decision', () => {
    assert.equal(edit('apps/api/src/x.ts', { HOOK_PR_LABELS: '' }, fixtureRepo([])).decision, null);
  });
});

describe('change-gate: push of the current branch', () => {
  const push = (cmd, dir) => bashIn(dir, cmd);
  it('git push on main -> deny', () => assert.equal(push('git push', repoOn('main')), 'deny'));
  it('git push -u origin on main -> deny', () => assert.equal(push('git push -u origin', repoOn('main')), 'deny'));
  it('git push origin HEAD on main -> deny', () => assert.equal(push('git push origin HEAD', repoOn('main')), 'deny'));
  it('git push on master -> deny', () => assert.equal(push('git push', repoOn('master')), 'deny'));
  it('git push on a feature branch -> no decision', () => assert.equal(push('git push', repoOn('feat/x')), null));
  it('git push origin HEAD on a feature branch -> no decision', () => assert.equal(push('git push origin HEAD', repoOn('feat/x')), null));
  it('git push --force-with-lease on main -> deny', () => assert.equal(push('git push --force-with-lease', repoOn('main')), 'deny'));
});

describe('change-gate: destructive commands', () => {
  const feature = repoOn('feat/x');
  const cases = [
    // rm -r: trailing slashes, the repo itself, inside the repo
    ['rm -rf ./', 'deny'],
    ['rm -rf ../', 'deny'],
    ['rm -rf .git/', 'deny'],
    ['rm -rf ./*', 'deny'],
    [`rm -rf ${feature}`, 'deny'],
    ['rm -rf apps', 'ask'],
    ['rm -rf apps/api/src', 'ask'],
    ['rm --recursive --force apps', 'ask'],
    ['rm -rf node_modules', null],
    ['rm -rf apps/web/dist apps/api/coverage', null],
    ['rm -f apps/x.ts', null],
    // git: discarding changes, stashes, branches, tags
    ['git checkout .', 'ask'],
    ['git checkout ./apps', 'ask'],
    ['git checkout :/', 'ask'],
    ['git checkout -f main', 'ask'],
    ['git checkout -B main', 'ask'],
    ['git checkout -b feat/y', null],
    ['git checkout main', null],
    ['git switch -f main', 'ask'],
    ['git switch --discard-changes main', 'ask'],
    ['git switch -C main', 'ask'],
    ['git switch -c feat/y', null],
    ['git stash drop', 'ask'],
    ['git stash clear', 'ask'],
    ['git stash pop', null],
    ['git stash', null],
    ['git branch -f main HEAD~3', 'ask'],
    ['git branch -M feat/z', 'ask'],
    ['git branch feat/y', null],
    ['git tag -d v1', 'ask'],
    ['git tag -f v1', 'ask'],
    ['git tag v1', null],
    ['git rm -r apps', 'ask'],
    ['git rm -f apps/x.ts', 'ask'],
    ['git rm apps/x.ts', null],
    ['git rm --cached apps/x.ts', null],
    // the way back to lost commits
    ['git reflog expire --expire=now --all', 'deny'],
    ['git reflog delete HEAD@{1}', 'deny'],
    ['git gc --prune=now', 'deny'],
    ['git prune', 'deny'],
    ['git reflog', null],
    ['git gc', null],
    // bulk deletes and overwrites
    ['find . -delete', 'ask'],
    ["find . -name '*.ts' -exec rm {} +", 'ask'],
    ['find . -name x -print', null],
    ['truncate -s 0 apps/api/src/main.ts', 'ask'],
    ['shred apps/x.ts', 'ask'],
    ['dd if=/dev/zero of=x bs=1 count=1', 'ask'],
    ['chmod -R 000 apps', 'ask'],
    ['chown -R nobody apps', 'ask'],
    ['chmod +x x.sh', null],
    ['mv apps /tmp/', 'ask'],
    ['mv apps ~/Desktop/', 'ask'],
    ['mv a.ts b.ts', null],
    // SQL
    ["mysql -e 'DROP DATABASE x'", 'ask'],
    ["mysql -e 'truncate table rooms'", 'ask'],
    ['docker exec m mysql -e "delete from rooms"', 'ask'],
    ['mysqladmin drop x', 'ask'],
    ["mysql -e 'select 1'", null],
    // gh deletes
    ['gh release delete v1', 'ask'],
    ['gh run delete 1', 'ask'],
    ['gh cache delete --all', 'ask'],
    ['gh repo delete o/r', 'deny'],
    ['gh release list', null],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bashIn(feature, cmd), want));
  }
});

describe('change-gate: fail closed', () => {
  it('malformed JSON is denied', () => assert.equal(runRaw(H, 'oops').decision, 'deny'));
  it('empty stdin is denied', () => assert.equal(runRaw(H, '').decision, 'deny'));
});
