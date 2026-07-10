'use strict';

// Re-run the tightened category rules over existing data files to shrink the
// `other` bucket. Only items currently categorised as `other` are reconsidered,
// so previously curated, specific categories are never overwritten.
//
// Usage:
//   node tools/recategorize.js          (dry-run: prints what would change)
//   node tools/recategorize.js --write  (applies changes to data/*.json)

const fs = require('fs');
const path = require('path');

// Keep this list in sync with tools/fetch-stackoverflow.js CATEGORY_RULES.
const CATEGORY_RULES = [
  ['rate_limits', [
    'rate limit', 'rate-limit', '429', 'quota', 'too many requests', 'throttl',
    'max_tokens', 'max_output_tokens', 'max output tokens', 'token limit', 'context length',
    'context window', 'maximum context', 'tokens per minute', 'requests per minute',
    'tpm limit', 'rpm limit', 'capacity limit',
  ]],
  ['latency', [
    'timeout', 'timed out', 'time out', 'slow', 'latency', 'hang', 'hangs', 'hanging',
    'cold start', 'response time', 'takes too long', 'too long to respond',
  ]],
  ['support', [
    'support ticket', 'no response from support', 'contact support',
    '401', '403', 'unauthorized', 'forbidden', 'authentication', 'authenticate',
    'auth failed', 'auth error', 'api key', 'apikey', 'api-key', 'access denied',
    'permission denied', 'credentials', 'invalid key', 'invalid token', 'sign in', 'account',
  ]],
  ['downtime', [
    'outage', '503', '502', '500 internal', 'unavailable', 'is down', 'server error 500',
    'connection refused', 'connection reset', 'connection error', 'cannot connect',
    "can't connect", 'econnreset', 'grpc', 'ssl', 'tls', 'handshake', 'crashloop',
    'crashloopbackoff', 'pod crash', 'failed to start', "won't start", 'service unavailable',
    'deployment failed', 'deploy failed', 'failed to deploy', 'provisioning failed',
    'failed to provision', 'kubectl', 'node pool',
  ]],
  ['billing', ['billing', 'charged', 'invoice', 'credit card', 'subscription', 'refund', 'overcharge']],
  ['pricing', ['pricing', 'price', 'cost', 'expensive', 'too expensive']],
  ['api_change', [
    'deprecat', 'breaking change', 'no longer', 'removed in', 'upgrade to',
    '400 bad request', 'bad request', 'invalid request', 'invalid grpc', 'invalid argument',
    'invalid parameter', 'unexpected response', 'openai-compatible', 'openai compatible',
    'compatibility', 'schema', 'not supported', 'unsupported',
  ]],
  ['model_quality', [
    'hallucinat', 'accuracy', 'wrong answer', 'poor quality', 'incorrect output',
    'gibberish', 'nonsense', 'empty response', 'truncated', 'garbage output', 'bad output',
  ]],
  ['docs', ['documentation', 'how do i', 'how to', 'example', 'tutorial', 'unclear docs', 'no docs']],
];

function categoryFor(text) {
  const t = String(text || '').toLowerCase();
  for (const [cat, cues] of CATEGORY_RULES) {
    if (cues.some((c) => t.includes(c))) return cat;
  }
  return 'other';
}

const write = process.argv.includes('--write');
const dataDir = path.join(__dirname, '..', 'data');
const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.endsWith('-complaints.json'));

let totalOther = 0;
let totalReclassified = 0;
const newCounts = {};

for (const file of files) {
  const full = path.join(dataDir, file);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!Array.isArray(data.complaints)) continue;

  let changed = 0;
  for (const c of data.complaints) {
    if (c.category !== 'other') continue;
    totalOther += 1;
    const blob = `${c.complaint || ''} ${c.quote || ''}`;
    const next = categoryFor(blob);
    if (next !== 'other') {
      newCounts[next] = (newCounts[next] || 0) + 1;
      totalReclassified += 1;
      changed += 1;
      if (!write) {
        console.log(`  [${data.provider}] other -> ${next}: ${(c.complaint || '').slice(0, 80)}`);
      }
      c.category = next;
    }
  }

  if (write && changed > 0) {
    fs.writeFileSync(full, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}: ${changed} item(s) reclassified.`);
  }
}

console.log('');
console.log(`Mode: ${write ? 'WRITE' : 'DRY-RUN'}`);
console.log(`'other' items examined: ${totalOther}`);
console.log(`Reclassified out of 'other': ${totalReclassified} (remaining other: ${totalOther - totalReclassified})`);
console.log('New category assignments:', newCounts);
if (!write) console.log('\nRun again with --write to apply.');
