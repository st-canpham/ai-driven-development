import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { bash, run, runRaw, REPO } from './harness.mjs';

const H = 'githooks-guard.mjs';

describe('githooks-guard: skipping the hooks', () => {
  const cases = [
    // --no-verify and its prefixes, on any git command
    ['git commit --no-verify -m x', 'deny'],
    ['git commit --no-veri -m x', 'deny'],
    ['git commit --no-v -m x', 'deny'],
    ['git push --no-verify', 'deny'],
    ['git merge --no-verify feat/x', 'deny'],
    ['FOO=1 timeout 5 git push --no-verify', 'deny'],
    ['bash -c "git commit --no-verify -m x"', 'deny'],
    ['echo "$(git commit --no-verify -m x)"', 'deny'],
    ['git commit -n -m x', 'deny'],
    ['git commit -nm "x"', 'deny'],
    ['git commit -anm "x"', 'deny'],
    ['git commit -m "no-verify in a message is fine"', null],
    ['git commit -m x', null],
    ['git log -n 3', null],
    ['git commit-tree HEAD^{tree} -m x', 'deny'],
    // core.hooksPath, every way of reaching it
    ['git -c core.hooksPath=/dev/null commit -m x', 'deny'],
    ['git -c core.hookspath=/dev/null commit -m x', 'deny'],
    ['git -ccore.hooksPath=/dev/null commit -m x', 'deny'],
    ['git --config-env=core.hooksPath=HP commit -m x', 'deny'],
    ['git --config-env core.hooksPath=HP commit -m x', 'deny'],
    ['git config core.hooksPath .githooks', 'deny'],
    ['git config --local core.hooksPath x', 'deny'],
    ['git config --unset core.hooksPath', 'deny'],
    ['git config unset core.hooksPath', 'deny'],
    ['git config --get core.hooksPath', 'deny'],
    ['git config --remove-section core', 'deny'],
    ['git config --rename-section core old', 'deny'],
    ['git config --edit', 'deny'],
    ['git config -e', 'deny'],
    ['git config include.path ../x.gitconfig', 'deny'],
    ['git config includeIf.gitdir:~/x/.path ../x.gitconfig', 'deny'],
    ['git config user.name t', null],
    ['git config --get remote.origin.url', null],
    ['git -C apps/api status', null],
    // config from the environment
    ['GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x', 'deny'],
    ["GIT_CONFIG_PARAMETERS=\"'core.hooksPath'='/dev/null'\" git commit -m x", 'deny'],
    ['export GIT_CONFIG_PARAMETERS=x', 'deny'],
    ['env GIT_CONFIG_COUNT=1 git commit -m x', 'deny'],
    ['GIT_AUTHOR_NAME=t git commit -m x', null],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bash(H, cmd).decision, want));
  }
});

describe('githooks-guard: hook files and git config', () => {
  const cases = [
    ['rm .githooks/pre-commit', 'deny'],
    ['rm -rf .githooks', 'deny'],
    ['mv .githooks/pre-commit /tmp/x', 'deny'],
    ['cp /dev/null .githooks/pre-commit', 'deny'],
    ['ln -sf /usr/bin/true .githooks/pre-commit', 'deny'],
    ['truncate -s 0 .githooks/pre-commit', 'deny'],
    ['echo exit 0 > .githooks/pre-commit', 'deny'],
    ['echo "exit 0" >.githooks/pre-commit', 'deny'],
    ['printf x>>.git/config', 'deny'],
    ['echo x | tee .githooks/pre-commit', 'deny'],
    ["sed -i '' 's/a/b/' .githooks/pre-commit", 'deny'],
    ['sed -i.bak /hooksPath/d .git/config', 'deny'],
    ['perl -pi -e s/a/b/ .git/config', 'deny'],
    ['chmod -x .githooks/pre-commit', 'deny'],
    ['chmod 644 .githooks/pre-commit', 'deny'],
    ['chmod a-x .githooks/pre-commit', 'deny'],
    ['chmod +x .githooks/pre-commit', null],
    ['chmod u+x .githooks/pre-commit', null],
    ['git rm .githooks/pre-commit', 'deny'],
    ['git mv .githooks/pre-commit x', 'deny'],
    ['git update-index --chmod=-x .githooks/pre-commit', 'deny'],
    ['git update-index --assume-unchanged .githooks/pre-commit', 'deny'],
    ['git update-index --chmod=+x .githooks/pre-commit', null],
    ['rm .git/hooks/pre-commit.sample', 'deny'],
    ['rm ../../.git/worktrees/add-x/config.worktree', 'deny'],
    // reading and running the hook is fine
    ['cat .githooks/pre-commit', null],
    ['bash .githooks/pre-commit', null],
    ['git add .githooks/pre-commit', null],
    ['git diff .githooks/pre-commit', null],
    ["sed -n 1,20p .githooks/pre-commit", null],
    ['cat .git/config', null],
    ['rm apps/api/src/x.ts', null],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd} -> ${want ?? 'no decision'}`, () => assert.equal(bash(H, cmd).decision, want));
  }
});

describe('githooks-guard: edits', () => {
  const edit = (path, tool = 'Edit') => run(H, tool, { file_path: join(REPO, path), old_string: 'a', new_string: 'b', content: 'x' }).decision;
  for (const p of ['.git/config', '.git/config.worktree', '.git/hooks/pre-commit', '.git/worktrees/add-x/config.worktree']) {
    it(`Edit ${p} -> deny`, () => assert.equal(edit(p), 'deny'));
    it(`Write ${p} -> deny`, () => assert.equal(edit(p, 'Write'), 'deny'));
  }
  // Editing the hook itself is a reviewed change: change-gate asks (control plane).
  for (const p of ['.githooks/pre-commit', 'apps/api/src/x.ts', '.gitignore', 'docs/git/config']) {
    it(`Edit ${p} -> no decision here`, () => assert.equal(edit(p), null));
  }
  it('Read .git/config -> no decision', () => assert.equal(run(H, 'Read', { file_path: join(REPO, '.git/config') }).decision, null));
});

describe('githooks-guard: unparseable and fail closed', () => {
  it('unparseable command mentioning --no-verify -> deny', () => assert.equal(bash(H, 'git commit --no-verify -m "x').decision, 'deny'));
  it('unparseable command otherwise -> no decision', () => {
    const r = bash(H, 'echo "unterminated');
    assert.equal(r.decision, null);
    assert.equal(r.status, 0, r.stderr);
  });
  it('malformed JSON is denied', () => assert.equal(runRaw(H, '{oops').decision, 'deny'));
  it('empty stdin is denied', () => assert.equal(runRaw(H, '').decision, 'deny'));
});
