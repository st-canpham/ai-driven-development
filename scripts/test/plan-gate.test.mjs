// Runs scripts/plan-gate.sh against throwaway git repos, with labels, body and
// comments given through PLAN_GATE_LABELS / PLAN_GATE_BODY / PLAN_GATE_COMMENTS.
//   node --test scripts/test/*.test.mjs
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'plan-gate.sh');
const BODY = '#### Plan (L3)\n\n- [x] Tier 0: tooling only\n\n#### Deviations from plan\n\nNone.\n';

const repo = ({ base = {}, change = {} } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-gate-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (files) => {
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), text);
    }
  };
  git('init', '-q', '-b', 'main');
  write({ 'README.md': '# r\n', 'apps/api/src/a.ts': 'a\n', ...base });
  git('add', '-A');
  git('commit', '-qm', 'base');
  const baseSha = git('rev-parse', 'HEAD');
  git('switch', '-q', '-c', 'feat/x');
  return { dir, git, write, baseSha };
};

const commit = (r, files, msg = 'change') => {
  r.write(files);
  r.git('add', '-A');
  r.git('commit', '-qm', msg);
  return r.git('rev-parse', 'HEAD');
};

const gate = (r, { labels = 'plan:tier-0,status:done', body = BODY, comments = '', base = r.baseSha, env = {} } = {}) => {
  const res = spawnSync('bash', [SCRIPT, base], {
    cwd: r.dir,
    encoding: 'utf8',
    env: { ...process.env, PR: '1', PR_HEAD_SHA: '', PLAN_GATE_LABELS: labels, PLAN_GATE_BODY: body, PLAN_GATE_COMMENTS: comments, GITHUB_STEP_SUMMARY: '', ...env },
  });
  return { status: res.status, out: res.stdout + res.stderr };
};

describe('plan-gate.sh', () => {
  it('Tier 0 docs change, done -> PASS', () => {
    const r = repo();
    commit(r, { 'docs/x.md': 'x\n' });
    const g = gate(r);
    assert.equal(g.status, 0, g.out);
    assert.match(g.out, /plan-gate: PASS/);
  });

  it('waits for status:done', () => {
    const r = repo();
    commit(r, { 'docs/x.md': 'x\n' });
    assert.match(gate(r, { labels: 'plan:tier-0,status:code-review' }).out, /merge waits for status:done/);
  });

  describe('check 7: review of apps/', () => {
    it('apps/ changed, no review comment -> FAIL', () => {
      const r = repo();
      commit(r, { 'apps/api/src/a.ts': 'changed\n' });
      const g = gate(r);
      assert.equal(g.status, 1);
      assert.match(g.out, /no clean review of its current state/);
    });

    it('review comment at HEAD -> OK', () => {
      const r = repo();
      const sha = commit(r, { 'apps/api/src/a.ts': 'changed\n' });
      const g = gate(r, { comments: `Review: clean at pass 1/3\n<!-- review: clean ${sha} -->` });
      assert.equal(g.status, 0, g.out);
      assert.match(g.out, /apps\/ reviewed/);
    });

    it('review before a later commit that only touches openspec/ (archive) -> still OK', () => {
      const r = repo();
      const sha = commit(r, { 'apps/api/src/a.ts': 'changed\n' });
      commit(r, { 'openspec/changes/archive/2026-11-25-add-x/proposal.md': 'p\n' }, 'archive: add-x');
      const g = gate(r, { comments: `<!-- review: clean ${sha} -->` });
      assert.match(g.out, /OK +apps\/ reviewed/);
    });

    it('apps/ changed after the reviewed commit -> FAIL', () => {
      const r = repo();
      const sha = commit(r, { 'apps/api/src/a.ts': 'changed\n' });
      commit(r, { 'apps/api/src/a.ts': 'changed again\n' });
      assert.match(gate(r, { comments: `<!-- review: clean ${sha} -->` }).out, /FAIL +code under apps\//);
    });

    it('unknown sha in the comment -> FAIL', () => {
      const r = repo();
      commit(r, { 'apps/api/src/a.ts': 'changed\n' });
      assert.match(gate(r, { comments: '<!-- review: clean 0123456789abcdef -->' }).out, /FAIL +code under apps\//);
    });

    // CI checks out GitHub's merge of the PR into the current base. main may have gained
    // apps/ changes from other PRs since the review; they must not void the marker.
    const mergeRef = () => {
      const r = repo();
      const reviewed = commit(r, { 'apps/api/src/b.ts': 'b\n' });
      r.git('switch', '-q', 'main');
      const newBase = commit(r, { 'apps/api/src/a.ts': 'changed on main by another PR\n' }, 'feat: other PR');
      r.git('switch', '-q', '--detach', newBase);
      r.git('-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', '--no-ff', '-m', 'merge', reviewed);
      return { r, reviewed, newBase };
    };
    it('merge ref, main moved after the review -> OK (compares the PR head, HEAD^2)', () => {
      const { r, reviewed, newBase } = mergeRef();
      const g = gate(r, { base: newBase, comments: `<!-- review: clean ${reviewed} -->` });
      assert.equal(g.status, 0, g.out);
      assert.match(g.out, /OK +apps\/ reviewed/);
    });
    it('merge ref with PR_HEAD_SHA set -> OK', () => {
      const { r, reviewed, newBase } = mergeRef();
      const g = gate(r, { base: newBase, comments: `<!-- review: clean ${reviewed} -->`, env: { PR_HEAD_SHA: reviewed } });
      assert.match(g.out, /OK +apps\/ reviewed/);
    });
    it('merge ref, PR head changed apps/ after the review -> FAIL', () => {
      const r = repo();
      const reviewed = commit(r, { 'apps/api/src/b.ts': 'b\n' });
      const head = commit(r, { 'apps/api/src/b.ts': 'b2\n' });
      assert.match(gate(r, { comments: `<!-- review: clean ${reviewed} -->`, env: { PR_HEAD_SHA: head } }).out, /FAIL +code under apps\//);
    });

    it('no apps/ change -> not checked', () => {
      const r = repo();
      commit(r, { 'docs/x.md': 'x\n' });
      assert.doesNotMatch(gate(r).out, /apps\/ reviewed|code under apps/);
    });
  });

  describe('check 8: control plane from the base CODEOWNERS', () => {
    const owners = { '.github/CODEOWNERS': '# c\n/scripts/   @o\n/CLAUDE.md  @o\n/.claude/   @o\n' };
    it('lists touched control-plane files, never fails', () => {
      const r = repo({ base: owners });
      commit(r, { 'scripts/x.sh': 'x\n', 'CLAUDE.md': 'c\n', 'docs/x.md': 'd\n' });
      const g = gate(r);
      assert.equal(g.status, 0, g.out);
      assert.match(g.out, /INFO +control plane touched \(2 files/);
      assert.match(g.out, /scripts\/x\.sh/);
      assert.doesNotMatch(g.out, / {8}docs\/x\.md/);
    });
    it('uses the base CODEOWNERS, not the PR one', () => {
      const r = repo({ base: owners });
      commit(r, { '.github/CODEOWNERS': '/docs/ @o\n', 'docs/x.md': 'd\n' });
      assert.match(gate(r).out, /OK +no control-plane path touched/);
    });
    it('no CODEOWNERS on the base -> skipped', () => {
      const r = repo();
      commit(r, { 'scripts/x.sh': 'x\n' });
      assert.doesNotMatch(gate(r).out, /control plane|control-plane/);
    });
  });
});
