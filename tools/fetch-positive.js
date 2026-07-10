'use strict';

// ---------------------------------------------------------------------------
// fetch-positive.js — collect PUBLIC, genuinely positive developer feedback
// from the Hacker News Algolia API and merge it into the data/*.json files as
// auto-collected items with sentiment="positive".
//
// Public, no-auth API. Guardrails: every item carries a working source_url
// (the HN item permalink), only a public author handle is stored,
// verified=false, auto_collected=true. An item is only kept when it contains a
// clear positive cue AND contains no negative/critical cue (to avoid pulling in
// sarcasm or mixed/critical comments). Nothing is fabricated.
//
// Usage:  node tools/fetch-positive.js [--write]
//         (omit --write for a dry-run preview)
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WRITE = process.argv.includes('--write');
const PER_PROVIDER = 4;

const TARGETS = [
  { file: 'together-ai-complaints.json', prefix: 'tg', name: 'Together AI', query: 'Together AI', requireTerm: 'together' },
  { file: 'fireworks-ai-complaints.json', prefix: 'fw', name: 'Fireworks AI', query: 'Fireworks AI', requireTerm: 'fireworks' },
  { file: 'tinker-api-complaints.json', prefix: 'tk', name: 'Tinker API', query: 'Tinker Thinking Machines', requireTerm: 'tinker' },
  { file: 'azure-kubernetes-service-complaints.json', prefix: 'aks', name: 'Azure Kubernetes Service', query: 'Azure Kubernetes AKS', requireTerm: 'aks' },
  { file: 'azure-machine-learning-complaints.json', prefix: 'aml', name: 'Azure Machine Learning', query: 'Azure Machine Learning', requireTerm: 'azure machine learning' },
  { file: 'azure-ai-foundry-complaints.json', prefix: 'aif', name: 'Azure AI Foundry', query: 'Azure AI Foundry', requireTerm: 'foundry' },
  { file: 'openai-complaints.json', prefix: 'oa', name: 'OpenAI', query: 'OpenAI API', requireTerm: 'openai' },
];

// Strong, unambiguous praise cues.
const POSITIVE_CUES = [
  'works great', 'works well', 'work great', 'works perfectly', 'works flawlessly',
  'i love', 'we love', 'really love', 'absolutely love', 'love using', 'love how',
  'impressed', 'impressive', 'amazing', 'excellent', 'fantastic', 'awesome',
  'rock solid', 'rock-solid', 'super reliable', 'very reliable', 'highly recommend',
  'would recommend', 'great experience', 'fantastic experience', 'pleasant experience',
  'blazing fast', 'super fast', 'really fast', 'incredibly fast', 'so fast',
  'really good', 'very good', 'works beautifully', 'a joy to use', 'pleasure to use',
  'best in class', 'best-in-class', 'happy with', 'very happy', 'really happy',
  'huge fan', 'big fan', 'game changer', 'game-changer',
];

// Any of these disqualify the item (avoid sarcasm / mixed / critical / job ads).
const NEG_GUARD = [
  'error', 'errors', 'fail', 'failed', 'failing', 'crash', 'crashes', 'broken',
  'terrible', 'awful', 'worst', 'hate', 'sucks', 'slow', 'sluggish', 'expensive',
  'overpriced', 'bug', 'buggy', 'issue', 'issues', 'problem', 'problems', 'outage',
  'unreliable', 'disappoint', 'avoid', "can't", 'cannot', 'unable', 'not working',
  "doesn't work", 'frustrat', 'annoying', 'unfortunately', 'but ', 'however', 'though',
  'wish', 'lacking', 'missing', 'downtime', 'rate limit', 'throttl', 'timeout',
  // negation / weak praise
  ' bad', 'not ', "n't ", 'meh', 'mediocre', 'not impress', "isn't", "wasn't",
  // job ads / off-topic noise
  'hiring', 'full time', 'full-time', 'part time', 'remote or', 'we measure',
  'benchmark', 'salary', 'apply ', 'we are looking', 'job ', 'checking out',
  'cold start',
];

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function fetchHits(query) {
  const params = new URLSearchParams({
    query,
    tags: '(story,comment)',
    hitsPerPage: '60',
  });
  const url = `https://hn.algolia.com/api/v1/search?${params.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  return json.hits || [];
}

function isPositive(text) {
  const t = text.toLowerCase();
  if (!POSITIVE_CUES.some((c) => t.includes(c))) return false;
  if (NEG_GUARD.some((c) => t.includes(c))) return false;
  return true;
}

function toItem(target, seq, hit, text) {
  const snippet = text.length > 280 ? `${text.slice(0, 277)}…` : text;
  return {
    id: `${target.prefix}-hn-${String(seq).padStart(4, '0')}`,
    complaint: `A developer shared positive feedback about ${target.name} on Hacker News.`,
    quote: snippet,
    category: 'other',
    sentiment: 'positive',
    author_handle: hit.author || null,
    source: 'hackernews',
    source_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    corroborating_urls: [],
    date: isoDate(hit.created_at_i),
    verified: false,
    auto_collected: true,
  };
}

async function main() {
  let grandTotal = 0;
  for (const target of TARGETS) {
    const fullPath = path.join(DATA_DIR, target.file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const existing = Array.isArray(data.complaints) ? data.complaints : [];
    const seenUrls = new Set(existing.map((c) => c.source_url).filter(Boolean));

    let hits = [];
    try {
      hits = await fetchHits(target.query);
    } catch (err) {
      console.log(`! ${target.name}: fetch failed — ${err.message}`);
      continue;
    }

    const added = [];
    let seq = 1;
    for (const hit of hits) {
      if (added.length >= PER_PROVIDER) break;
      const raw = hit.comment_text || hit.story_text || hit.title || '';
      const text = stripHtml(raw);
      if (!text) continue;
      const lower = text.toLowerCase();
      if (!lower.includes(target.requireTerm)) continue;
      if (!isPositive(text)) continue;
      const url = `https://news.ycombinator.com/item?id=${hit.objectID}`;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      // find next free id sequence
      while (existing.some((c) => c.id === `${target.prefix}-hn-${String(seq).padStart(4, '0')}`)) seq += 1;
      const item = toItem(target, seq, hit, text);
      seq += 1;
      added.push(item);
    }

    console.log(`\n=== ${target.name} (${target.file}) ===`);
    console.log(`  scanned ${hits.length} HN hits, kept ${added.length} positive item(s)`);
    added.forEach((a) => console.log(`   + ${a.date} ${a.source_url}\n     "${a.quote.slice(0, 120)}"`));

    grandTotal += added.length;

    if (WRITE && added.length) {
      data.complaints = existing.concat(added);
      if (typeof data.source_count === 'number') data.source_count += added.length;
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
      console.log(`  -> wrote ${added.length} new item(s) to ${target.file}`);
    }
  }

  console.log(`\n${WRITE ? 'WRITE' : 'DRY-RUN'}: ${grandTotal} positive item(s) total.`);
  if (!WRITE) console.log('Run again with --write to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
