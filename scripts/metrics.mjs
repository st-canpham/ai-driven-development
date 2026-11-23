#!/usr/bin/env node
// L3 metrics from GitHub, instead of by hand: one row per merged PR, plus the two gates.
//   node scripts/metrics.mjs            print the table and the gates
//   node scripts/metrics.mjs --write    also replace the rows between the markers in .claude/METRICS.md
//
// Per PR (read with gh, which must be logged in):
//   Change id / Tier 0       archived change folder in the diff, else "Tier 0" (plan:tier-0), else "none"
//   Code files               files under apps/
//   Plan approved before code  first non-"plan:" commit is later than the first plan:approved label
//   Second design round      how often plan:review was added after plan:approved had been added
// Gates (playbook): plan attached on multi-file OpenSpec PRs = 100%; second rounds < 10%.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FILE = '.claude/METRICS.md';
const START = '<!-- metrics:l3:start -->';
const END = '<!-- metrics:l3:end -->';

export const changeIdOf = (files, labels) => {
  const ids = [...new Set(files.map((f) => /^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-([^/]+)\//.exec(f)?.[1]).filter(Boolean))];
  if (ids.length) return ids.join(', ');
  return labels.includes('plan:tier-0') ? 'Tier 0' : 'none';
};

// events: [{ event: 'labeled'|'unlabeled', label, at }], oldest first.
export const secondRounds = (events) => {
  let approved = false;
  let rounds = 0;
  for (const e of events) {
    if (e.event !== 'labeled') continue;
    if (e.label === 'plan:approved') approved = true;
    else if (e.label === 'plan:review' && approved) rounds++;
  }
  return rounds;
};

// commits: [{ message, at }], oldest first. null when there is no code commit.
export const approvedBeforeCode = (events, commits) => {
  const approvedAt = events.find((e) => e.event === 'labeled' && e.label === 'plan:approved')?.at;
  const firstCode = commits.find((c) => !/^(plan|archive): /.test(c.message))?.at;
  if (!firstCode) return null;
  return Boolean(approvedAt) && approvedAt <= firstCode;
};

export const row = ({ number, title, mergedAt, labels, files, events, commits }) => {
  const id = changeIdOf(files, labels);
  const codeFiles = files.filter((f) => f.startsWith('apps/')).length;
  const openspec = id !== 'Tier 0' && id !== 'none';
  const before = openspec ? approvedBeforeCode(events, commits) : null;
  const rounds = openspec ? secondRounds(events) : 0;
  return {
    number,
    openspec,
    codeFiles,
    before,
    rounds,
    cells: [
      mergedAt.slice(0, 10),
      `#${number} ${title.replace(/\|/g, '/')}`,
      id,
      String(codeFiles),
      openspec ? (before === null ? 'no code' : before ? 'Yes' : 'No') : `n/a (${id})`,
      openspec ? (rounds ? `Yes (${rounds})` : 'No') : 'n/a',
    ],
  };
};

export const gates = (rows) => {
  const multi = rows.filter((r) => r.openspec && r.codeFiles > 1);
  const withPlan = multi.filter((r) => r.before).length;
  const openspec = rows.filter((r) => r.openspec);
  const second = openspec.filter((r) => r.rounds > 0).length;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');
  return [
    `Plan approved before code, multi-file OpenSpec PRs: ${withPlan}/${multi.length} = ${pct(withPlan, multi.length)} (gate 100%)`,
    `Second design round: ${second}/${openspec.length} = ${pct(second, openspec.length)} (gate < 10%)`,
  ];
};

export const table = (rows) =>
  ['| Date | PR | Change id / Tier 0 | Code files | Plan approved before code? | Second design round? |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.cells.join(' | ')} |`)].join('\n');

const gh = (...args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

const main = () => {
  const repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8' }).trim();
  const prs = gh('pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,title,mergedAt,labels,files');
  const rows = prs
    .map((p) => {
      const events = gh('api', '--paginate', `repos/${repo}/issues/${p.number}/events`)
        .filter((e) => e.event === 'labeled' || e.event === 'unlabeled')
        .map((e) => ({ event: e.event, label: e.label?.name, at: e.created_at }));
      const commits = gh('api', '--paginate', `repos/${repo}/pulls/${p.number}/commits`).map((c) => ({ message: c.commit.message, at: c.commit.committer.date }));
      return row({ ...p, labels: p.labels.map((l) => l.name), files: p.files.map((f) => f.path), events, commits });
    })
    .sort((a, b) => a.number - b.number);
  const out = `${table(rows)}\n\n${gates(rows).map((g) => `- ${g}`).join('\n')}`;
  console.log(out);
  if (process.argv.includes('--write')) {
    const text = readFileSync(FILE, 'utf8');
    const s = text.indexOf(START);
    const e = text.indexOf(END);
    if (s < 0 || e < s) throw new Error(`${FILE} has no ${START} … ${END} markers`);
    writeFileSync(FILE, `${text.slice(0, s + START.length)}\n${out}\n${text.slice(e)}`);
    console.log(`\nmetrics: wrote ${rows.length} rows to ${FILE}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
