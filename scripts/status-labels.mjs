#!/usr/bin/env node
// Keeps the single status: label of a PR in step with what happens to it (L3 labels,
// automated in L5). Run by .github/workflows/status-labels.yml from the base branch.
//
//   PR closed, not merged             -> status:cancelled
//   PR marked ready for review        -> status:code-review (unless status:done)
//   PR converted back to draft        -> status:in-progress (unless status:done)
//   new commits while changes-requested -> status:in-progress
//   opened / pushed, no status yet:
//     draft with code beyond openspec/ (the first code commit) -> status:in-progress
//     not a draft                                             -> status:code-review
//   status:done is never moved except by closing unmerged; plan:* labels are never touched.
//
// Labels are read live from GitHub (`gh pr view`), never from the event payload.
//   node scripts/status-labels.mjs                 in Actions (GITHUB_EVENT_PATH, GH_TOKEN)
//   STATUS_LABELS_DRY_RUN=1 ...                     print the decision, change nothing
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const STATUS = ['status:in-progress', 'status:code-review', 'status:changes-requested', 'status:done', 'status:cancelled'];

const hasCode = (changed) => changed.some((f) => f && !f.startsWith('openspec/'));

// Returns the status label the PR should have, or null to leave it as it is.
export const decide = ({ action, draft, merged, labels, changed = [] }) => {
  const current = labels.filter((l) => STATUS.includes(l));
  const is = (l) => current.length === 1 && current[0] === l;
  if (action === 'closed') return merged ? null : 'status:cancelled';
  if (is('status:done')) return null;
  if (action === 'ready_for_review') return 'status:code-review';
  if (action === 'converted_to_draft') return 'status:in-progress';
  if (action === 'synchronize' && is('status:changes-requested')) return 'status:in-progress';
  if (['opened', 'reopened', 'synchronize'].includes(action) && current.length === 0) {
    if (!draft) return 'status:code-review';
    if (hasCode(changed)) return 'status:in-progress';
  }
  // More than one status label: settle on the most advanced one that is not done.
  if (current.length > 1) return STATUS.find((s) => current.includes(s) && s !== 'status:done') ?? null;
  return null;
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
