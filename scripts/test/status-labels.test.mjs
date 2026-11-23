// Decision table of scripts/status-labels.mjs.
//   node --test scripts/test/*.test.mjs
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { decide, plan } from '../status-labels.mjs';

const code = ['openspec/changes/add-x/tasks.md', 'apps/api/src/rooms/rooms.service.ts'];
const planOnly = ['openspec/changes/add-x/proposal.md', 'openspec/changes/add-x/design.md'];

describe('status-labels: decide', () => {
  const cases = [
    // [name, input, want]
    ['plan PR opened as draft, plan files only', { action: 'opened', draft: true, labels: ['plan:review'], changed: planOnly }, null],
    ['first code commit pushed to the approved draft', { action: 'synchronize', draft: true, labels: ['plan:approved'], changed: code }, 'status:in-progress'],
    ['more commits while in progress', { action: 'synchronize', draft: true, labels: ['plan:approved', 'status:in-progress'], changed: code }, null],
    ['marked ready for review', { action: 'ready_for_review', draft: false, labels: ['plan:approved', 'status:in-progress'] }, 'status:code-review'],
    ['push during code review stays in review', { action: 'synchronize', draft: false, labels: ['plan:approved', 'status:code-review'], changed: code }, null],
    ['push after changes requested', { action: 'synchronize', draft: false, labels: ['plan:approved', 'status:changes-requested'], changed: code }, 'status:in-progress'],
    ['back to draft', { action: 'converted_to_draft', draft: true, labels: ['plan:approved', 'status:code-review'] }, 'status:in-progress'],
    ['Tier 0 PR opened ready, no status', { action: 'opened', draft: false, labels: ['plan:tier-0'], changed: ['README.md'] }, 'status:code-review'],
    ['archive commit after done keeps done', { action: 'synchronize', draft: false, labels: ['plan:approved', 'status:done'], changed: code }, null],
    ['ready_for_review never undoes done', { action: 'ready_for_review', draft: false, labels: ['status:done'] }, null],
    ['closed unmerged', { action: 'closed', merged: false, labels: ['plan:review'] }, 'status:cancelled'],
    ['closed unmerged after done', { action: 'closed', merged: false, labels: ['status:done'] }, 'status:cancelled'],
    ['merged', { action: 'closed', merged: true, labels: ['status:done'] }, null],
    ['reopened draft with code, no status', { action: 'reopened', draft: true, labels: ['plan:approved'], changed: code }, 'status:in-progress'],
    // several status labels: the most advanced wins, person labels are never removed
    ['in-progress + code-review -> code-review', { action: 'synchronize', draft: false, labels: ['status:in-progress', 'status:code-review'], changed: code }, 'status:code-review'],
    ['code-review + done, archive pushed -> done stays', { action: 'synchronize', draft: false, labels: ['status:code-review', 'status:done'], changed: code }, 'status:done'],
    ['code-review + done, ready_for_review -> done stays', { action: 'ready_for_review', draft: false, labels: ['status:code-review', 'status:done'] }, 'status:done'],
    ['code-review + changes-requested, push -> in-progress', { action: 'synchronize', draft: false, labels: ['status:code-review', 'status:changes-requested'], changed: code }, 'status:in-progress'],
    ['code-review + changes-requested, reopened -> changes-requested', { action: 'reopened', draft: false, labels: ['status:code-review', 'status:changes-requested'] }, 'status:changes-requested'],
    ['changes-requested alone, not a push -> stays', { action: 'opened', draft: false, labels: ['status:changes-requested'] }, null],
    // a draft gets in-progress only with an approved plan or Tier 0
    ['draft with code but plan:review -> nothing', { action: 'synchronize', draft: true, labels: ['plan:review'], changed: code }, null],
    ['draft with code and no plan label -> nothing', { action: 'opened', draft: true, labels: [], changed: code }, null],
    ['Tier 0 draft with code -> in-progress', { action: 'opened', draft: true, labels: ['plan:tier-0'], changed: ['scripts/x.sh'] }, 'status:in-progress'],
    // reopening a cancelled PR
    ['reopened cancelled, not a draft -> code-review', { action: 'reopened', draft: false, labels: ['plan:approved', 'status:cancelled'] }, 'status:code-review'],
    ['reopened cancelled draft -> in-progress', { action: 'reopened', draft: true, labels: ['plan:review', 'status:cancelled'], changed: planOnly }, 'status:in-progress'],
    ['reopened cancelled + code-review -> code-review', { action: 'reopened', draft: false, labels: ['status:cancelled', 'status:code-review'] }, 'status:code-review'],
    ['cancelled, pushed without reopening -> stays', { action: 'synchronize', draft: false, labels: ['status:cancelled'], changed: code }, null],
  ];
  for (const [name, input, want] of cases) {
    it(`${name} -> ${want ?? 'no change'}`, () => assert.equal(decide(input), want));
  }
});

describe('status-labels: plan', () => {
  it('swaps the old status for the new one, keeps plan labels', () => {
    assert.deepEqual(plan(['plan:approved', 'status:in-progress'], 'status:code-review'), { remove: ['status:in-progress'], add: ['status:code-review'] });
  });
  it('removes extras when the target is already there', () => {
    assert.deepEqual(plan(['status:in-progress', 'status:code-review'], 'status:in-progress'), { remove: ['status:code-review'], add: [] });
  });
  it('never removes status:done when done is the target', () => {
    assert.deepEqual(plan(['status:code-review', 'status:done'], 'status:done'), { remove: ['status:code-review'], add: [] });
  });
  it('no target -> nothing', () => assert.deepEqual(plan(['status:done'], null), { remove: [], add: [] }));
});
