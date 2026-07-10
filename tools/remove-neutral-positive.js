'use strict';

// ---------------------------------------------------------------------------
// remove-neutral-positive.js — strip every item whose derived feedback_type is
// 'neutral' or 'positive' from the data/*.json files. The dataset is about
// negative developer feedback; neutral/praise items are not useful here.
//
// feedback_type is derived at load time (not stored), so we ask the running API
// which items it classifies as neutral/positive, then remove those ids.
//
// Usage:  node tools/remove-neutral-positive.js [--write]
//         (omit --write for a dry-run preview)
//         Requires the dev server running on http://localhost:3000
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const API = process.env.API_BASE || 'http://localhost:3000';
const WRITE = process.argv.includes('--write');

async function idsFor(type) {
  const res = await fetch(`${API}/api/feedback?feedback_type=${type}`);
  if (!res.ok) throw new Error(`${type}: HTTP ${res.status}`);
  const json = await res.json();
  return (json.items || []).map((i) => i.id).filter(Boolean);
}

async function main() {
  let removeIds;
  try {
    const [neutral, positive] = await Promise.all([idsFor('neutral'), idsFor('positive')]);
    removeIds = new Set([...neutral, ...positive]);
    console.log(`Target: ${neutral.length} neutral + ${positive.length} positive = ${removeIds.size} items`);
  } catch (e) {
    console.error(`! Could not reach API at ${API} (${e.message}). Is the server running?`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('-complaints.json'));

  let totalRemoved = 0;
  for (const f of files) {
    const full = path.join(DATA_DIR, f);
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    const before = Array.isArray(data.complaints) ? data.complaints : [];
    const kept = before.filter((c) => !removeIds.has(c.id));
    const removed = before.length - kept.length;
    if (!removed) continue;
    totalRemoved += removed;
    console.log(`  ${f}: -${removed} (${before.length} -> ${kept.length})`);
    if (WRITE) {
      data.complaints = kept;
      data.source_count = kept.length;
      fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      console.log('    -> written');
    }
  }

  console.log(`\nTotal removed: ${totalRemoved}`);
  if (!WRITE) console.log('(dry run — re-run with --write to save)');
}

main();
