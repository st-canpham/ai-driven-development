// Pure parts of scripts/metrics.mjs.
//   node --test scripts/test/*.test.mjs
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { approvedBeforeCode, changeIdOf, gates, row, secondRounds } from '../metrics.mjs';

const ev = (event, label, at) => ({ event, label, at });
const commit = (message, at) => ({ message, at });

describe('metrics', () => {
  it('change id from the archived folder, else Tier 0, else none', () => {
    assert.equal(changeIdOf(['openspec/changes/archive/2026-11-25-add-room-management/proposal.md', 'apps/api/x.ts'], []), 'add-room-management');
    assert.equal(changeIdOf(['README.md'], ['plan:tier-0']), 'Tier 0');
    assert.equal(changeIdOf(['README.md'], []), 'none');
  });

  it('second design round: plan:review added after plan:approved', () => {
    assert.equal(secondRounds([ev('labeled', 'plan:review', 1), ev('unlabeled', 'plan:review', 2), ev('labeled', 'plan:approved', 2)]), 0);
    assert.equal(secondRounds([ev('labeled', 'plan:review', 1), ev('labeled', 'plan:approved', 2), ev('unlabeled', 'plan:approved', 3), ev('labeled', 'plan:review', 3), ev('labeled', 'plan:approved', 4)]), 1);
  });

  it('plan approved before the first code commit (plan:/archive: commits do not count)', () => {
    const events = [ev('labeled', 'plan:approved', '2026-11-20T10:00:00Z')];
    assert.equal(approvedBeforeCode(events, [commit('plan: add-x', '2026-11-20T09:00:00Z'), commit('test: x (red)', '2026-11-20T11:00:00Z')]), true);
    assert.equal(approvedBeforeCode(events, [commit('feat: x', '2026-11-20T09:30:00Z')]), false);
    assert.equal(approvedBeforeCode([], [commit('feat: x', '2026-11-20T09:30:00Z')]), false);
    assert.equal(approvedBeforeCode(events, [commit('plan: add-x', '2026-11-20T09:00:00Z')]), null);
  });

  it('a Tier 0 row and an OpenSpec row; the gates', () => {
    const tier0 = row({ number: 9, title: 'chore: hooks | more', mergedAt: '2026-11-23T07:59:37Z', labels: ['plan:tier-0', 'status:done'], files: ['.githooks/pre-commit'], events: [], commits: [] });
    assert.deepEqual(tier0.cells, ['2026-11-23', '#9 chore: hooks / more', 'Tier 0', '0', 'n/a (Tier 0)', 'n/a']);
    const feature = row({
      number: 11,
      title: 'feat: rooms',
      mergedAt: '2026-11-25T00:00:00Z',
      labels: ['plan:approved', 'status:done'],
      files: ['openspec/changes/archive/2026-11-25-add-room-management/tasks.md', 'apps/api/src/a.ts', 'apps/api/src/b.ts'],
      events: [ev('labeled', 'plan:review', '1'), ev('labeled', 'plan:approved', '2'), ev('labeled', 'plan:review', '3'), ev('labeled', 'plan:approved', '4')],
      commits: [commit('plan: add-room-management', '0'), commit('test: a (red)', '5')],
    });
    assert.deepEqual(feature.cells.slice(2), ['add-room-management', '2', 'Yes', 'Yes (1)']);
    assert.deepEqual(gates([tier0, feature]), [
      'Plan approved before code, multi-file OpenSpec PRs: 1/1 = 100% (gate 100%)',
      'Second design round: 1/1 = 100% (gate < 10%)',
    ]);
  });
});
