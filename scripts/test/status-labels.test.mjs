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
    ['two status labels settle on one', { action: 'synchronize', draft: false, labels: ['status:in-progress', 'status:code-review'], changed: code }, 'status:in-progress'],
    ['reopened draft with code, no status', { action: 'reopened', draft: true, labels: ['plan:approved'], changed: code }, 'status:in-progress'],
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
  it('no target -> nothing', () => assert.deepEqual(plan(['status:done'], null), { remove: [], add: [] }));
});
