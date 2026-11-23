#!/usr/bin/env node
// Keeps the single status: label of a PR in step with what happens to it (L3 labels,
// automated in L5). Run by .github/workflows/status-labels.yml from the base branch.
//
//   PR closed, not merged             -> status:cancelled
//   status:done present               -> stays (other status labels are removed); only an
//                                        unmerged close moves it
//   PR marked ready for review        -> status:code-review
//   PR converted back to draft        -> status:in-progress
//   new commits while changes-requested -> status:in-progress (otherwise changes-requested stays)
//   opened / reopened / pushed, no status yet (a reopened status:cancelled counts as none):
//     not a draft                                                  -> status:code-review
//     draft with plan:approved or plan:tier-0 and code beyond openspec/ -> status:in-progress
//     reopened draft that was cancelled                            -> status:in-progress
//   several status labels otherwise   -> the most advanced one
//   plan:* labels are never touched.
//
// Labels are read live from GitHub (`gh pr view`), never from the event payload.
//   node scripts/status-labels.mjs                 in Actions (GITHUB_EVENT_PATH, GH_TOKEN)
//   STATUS_LABELS_DRY_RUN=1 ...                     print the decision, change nothing
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const STATUS = ['status:in-progress', 'status:code-review', 'status:changes-requested', 'status:done', 'status:cancelled'];

// How far along each status is; with several labels the most advanced one wins.
const RANK = { 'status:cancelled': 0, 'status:in-progress': 1, 'status:code-review': 2, 'status:changes-requested': 3, 'status:done': 4 };

const hasCode = (changed) => changed.some((f) => f && !f.startsWith('openspec/'));

// Returns the status label the PR should have, or null to leave it as it is.
export const decide = ({ action, draft, merged, labels, changed = [] }) => {
  const all = labels.filter((l) => STATUS.includes(l));
  if (action === 'closed') return merged ? null : 'status:cancelled';
  // status:done and status:changes-requested are a person's labels: never undone here.
  if (all.includes('status:done')) return all.length > 1 ? 'status:done' : null;
  const reopenedCancelled = action === 'reopened' && all.includes('status:cancelled');
  const current = reopenedCancelled ? all.filter((l) => l !== 'status:cancelled') : all;
  if (action === 'ready_for_review') return 'status:code-review';
  if (action === 'converted_to_draft') return 'status:in-progress';
  if (current.includes('status:changes-requested')) {
    if (action === 'synchronize') return 'status:in-progress';
    return current.length > 1 ? 'status:changes-requested' : null;
  }
  if (current.length === 0) {
    if (!['opened', 'reopened', 'synchronize'].includes(action)) return null;
    if (!draft) return 'status:code-review';
    const planned = labels.includes('plan:approved') || labels.includes('plan:tier-0');
    if ((planned && hasCode(changed)) || reopenedCancelled) return 'status:in-progress';
    return null;
  }
  if (current.length > 1) return current.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  // Reopened with cancelled next to another status: keep that one, drop cancelled.
  return reopenedCancelled ? current[0] : null;
};

// Labels to remove and to add so that exactly `target` remains.
export const plan = (labels, target) => {
  if (!target) return { remove: [], add: [] };
  return { remove: labels.filter((l) => STATUS.includes(l) && l !== target), add: labels.includes(target) ? [] : [target] };
};

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();

const main = () => {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  if (pr.head.repo?.full_name !== event.repository.full_name) {
    console.log('status-labels: fork PR, skipped');
    return;
  }
  const labels = gh('pr', 'view', String(pr.number), '--json', 'labels', '-q', '.labels[].name').split('\n').filter(Boolean);
  let changed = [];
  try {
    changed = execFileSync('git', ['diff', '--name-only', `origin/${pr.base.ref}...${pr.head.sha}`], { encoding: 'utf8' }).split('\n');
  } catch {
    changed = [];
  }
  const target = decide({ action: event.action, draft: pr.draft, merged: pr.merged, labels, changed });
  const { remove, add } = plan(labels, target);
  console.log(`status-labels: #${pr.number} ${event.action} draft=${pr.draft} labels=[${labels.join(', ')}] -> ${target ?? 'no change'}`);
  if (!remove.length && !add.length) return;
  if (process.env.STATUS_LABELS_DRY_RUN) return;
  const args = ['pr', 'edit', String(pr.number)];
  for (const l of remove) args.push('--remove-label', l);
  for (const l of add) args.push('--add-label', l);
  gh(...args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
