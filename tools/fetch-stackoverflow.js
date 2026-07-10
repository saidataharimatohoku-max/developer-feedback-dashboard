'use strict';

// ---------------------------------------------------------------------------
// fetch-stackoverflow.js — collect PUBLIC developer questions from the
// Stack Exchange API (Stack Overflow site) and merge them into the existing
// data/*.json files as auto-collected feedback items.
//
// Public, no-auth API. Respects guardrails: every item carries a working
// source_url (the question link), only a public author handle is stored,
// verified=false, auto_collected=true, and text is presented as user-reported.
//
// Usage:  node tools/fetch-stackoverflow.js [--write]
//         (omit --write for a dry-run preview)
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WRITE = process.argv.includes('--write');

// Metadata for each Stack Exchange network site we collect from. The `source`
// value is stored on every item; `label` is used in the user-reported phrasing.
const SITE_META = {
  stackoverflow: { source: 'stackoverflow', label: 'Stack Overflow' },
  serverfault: { source: 'serverfault', label: 'Server Fault' },
  devops: { source: 'devops-stackexchange', label: 'DevOps Stack Exchange' },
};

// Providers that actually have relevant Stack Exchange coverage. Together AI,
// Fireworks AI and Tinker return no relevant results and are intentionally omitted.
// Each target lists one or more `queries`, each pinned to a specific SE site.
const TARGETS = [
  {
    file: 'azure-kubernetes-service-complaints.json',
    prefix: 'aks',
    queries: [
      { site: 'stackoverflow', tagged: 'azure-aks' },
      { site: 'serverfault', q: 'azure kubernetes service', requireTerm: 'kubernetes' },
      { site: 'devops', q: 'azure kubernetes service aks', requireTerm: 'kubernetes' },
    ],
  },
  {
    file: 'azure-machine-learning-complaints.json',
    prefix: 'aml',
    queries: [{ site: 'stackoverflow', tagged: 'azure-machine-learning-service' }],
  },
  {
    file: 'azure-ai-foundry-complaints.json',
    prefix: 'aif',
    queries: [{ site: 'stackoverflow', q: 'azure ai foundry', requireTerm: 'foundry' }],
  },
  {
    file: 'openai-complaints.json',
    prefix: 'oa',
    queries: [{ site: 'stackoverflow', tagged: 'openai-api', requireTerm: 'openai' }],
  },
];

// Max items kept per individual query (per site). Keeps any one site from
// dominating a provider's data.
const PER_QUERY = 6;

const NEG_CUES = [
  'error', 'fail', 'failed', 'failing', 'cannot', "can't", 'unable', 'not working',
  'issue', 'problem', 'exception', 'crash', 'broken', 'wrong', 'timeout', 'timed out',
  'hang', '429', '500', '502', '503', 'denied', 'refused', 'stuck', 'never', 'no response',
];

// Ordered cue rules — first match wins. Keep the most specific buckets
// (rate_limits, auth/support) ahead of broader ones (api_change, downtime).
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

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryFor(text) {
  const t = text.toLowerCase();
  for (const [cat, cues] of CATEGORY_RULES) {
    if (cues.some((c) => t.includes(c))) return cat;
  }
  return 'other';
}

function sentimentFor(text) {
  const t = text.toLowerCase();
  return NEG_CUES.some((c) => t.includes(c)) ? 'negative' : 'neutral';
}

function isoDate(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function fetchQuery(query) {
  const base = 'https://api.stackexchange.com/2.3/search/advanced';
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'creation',
    site: query.site,
    pagesize: '30',
    filter: 'withbody',
  });
  if (query.tagged) params.set('tagged', query.tagged);
  if (query.q) params.set('q', query.q);
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error_message) throw new Error(json.error_message);
  return json.items || [];
}

function toItem(prefix, seq, q, site) {
  const meta = SITE_META[site] || SITE_META.stackoverflow;
  const title = decodeEntities(q.title);
  const bodyText = stripHtml(q.body);
  const quote = bodyText.length > 300 ? `${bodyText.slice(0, 297)}…` : bodyText;
  const blob = `${title} ${bodyText}`;
  return {
    id: `${prefix}-so-${String(seq).padStart(4, '0')}`,
    complaint: `A developer on ${meta.label} reported: ${title}`,
    quote,
    category: categoryFor(blob),
    sentiment: sentimentFor(blob),
    author_handle: (q.owner && q.owner.display_name) || null,
    source: meta.source,
    source_url: q.link,
    corroborating_urls: [],
    date: isoDate(q.creation_date),
    verified: false,
    auto_collected: true,
  };
}

async function main() {
  for (const target of TARGETS) {
    const fullPath = path.join(DATA_DIR, target.file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const existing = Array.isArray(data.complaints) ? data.complaints : [];
    const existingUrls = new Set(existing.map((c) => c.source_url));
    const existingSoIds = existing
      .filter((c) => typeof c.id === 'string' && c.id.includes('-so-'))
      .map((c) => Number(c.id.split('-so-')[1]))
      .filter((n) => !Number.isNaN(n));
    let seq = existingSoIds.length ? Math.max(...existingSoIds) + 1 : 1;

    const added = [];
    for (const query of target.queries) {
      let items;
      try {
        items = await fetchQuery(query);
      } catch (e) {
        console.error(`! ${target.file} (${query.site}): ${e.message}`);
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }

      const requireTerm = query.requireTerm || null;
      let kept = 0;
      for (const q of items) {
        if (kept >= PER_QUERY) break;
        if (!q.link || existingUrls.has(q.link)) continue;
        const blob = `${decodeEntities(q.title)} ${stripHtml(q.body)}`.toLowerCase();
        if (requireTerm && !blob.includes(requireTerm)) continue;
        const item = toItem(target.prefix, seq, q, query.site);
        existingUrls.add(q.link);
        added.push(item);
        seq += 1;
        kept += 1;
      }
      console.log(`   ${query.site}: +${kept}`);
      await new Promise((r) => setTimeout(r, 350));
    }

    console.log(`== ${target.file}: +${added.length} Stack Exchange items`);
    added.forEach((a) => console.log(`   [${a.source} ${a.category}/${a.sentiment}] ${a.date} ${a.source_url}`));

    if (WRITE && added.length) {
      data.complaints = existing.concat(added);
      data.source_count = data.complaints.length;
      fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      console.log('   -> written');
    }
  }
  if (!WRITE) console.log('\n(dry run — re-run with --write to save)');
}

main();
