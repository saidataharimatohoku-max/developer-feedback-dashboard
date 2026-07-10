'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { loadRaw } = require('../backend/loader');
const path = require('node:path');

// Frozen 13-item dataset so scheduled HN collection can't break these tests.
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'data');
const {
  normalizeAll,
  normalize,
  feedbackType,
  slugify,
  FEEDBACK_TYPES,
  CATEGORIES,
} = require('../backend/normalizer');

const SENTIMENTS = ['negative', 'neutral', 'mixed'];
const REQUIRED_FIELDS = [
  'id',
  'provider',
  'provider_slug',
  'feedback_type',
  'category',
  'sentiment',
  'summary',
  'original_text',
  'source',
  'source_url',
  'corroborating_urls',
  'author_handle',
  'date',
  'verified',
  'auto_collected',
];

test('slugify maps provider names to slugs', () => {
  assert.strictEqual(slugify('Together AI'), 'together-ai');
  assert.strictEqual(slugify('Fireworks AI'), 'fireworks-ai');
  // dots collapse to '-', surrounding whitespace trimmed
  assert.strictEqual(slugify('  Acme.Co  '), 'acme-co');
});

test('normalizer maps empty strings to null', () => {
  const out = normalize(
    { id: 'x', complaint: 'sum', quote: '   ', source_url: '', author_handle: '', date: 'nope' },
    'Together AI',
  );
  assert.strictEqual(out.original_text, null);
  assert.strictEqual(out.source_url, null);
  assert.strictEqual(out.author_handle, null);
  assert.strictEqual(out.date, null);
  assert.deepStrictEqual(out.corroborating_urls, []);
  assert.strictEqual(out.verified, false);
});

test('feedback_type worked examples from ARCHITECTURE.md §3.1', () => {
  const items = normalizeAll(loadRaw(FIXTURE_DIR));
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  assert.strictEqual(byId['tg-0001'].feedback_type, 'feature_request');
  assert.strictEqual(byId['tg-0002'].feedback_type, 'complaint');
  assert.strictEqual(byId['fw-0001'].feedback_type, 'complaint');
});

test('feedback_type rule ordering: question cue beats feature cue', () => {
  assert.strictEqual(
    feedbackType({ summary: 'how do i add support for x?', category: 'docs', sentiment: 'neutral' }),
    'question',
  );
});

test('all items load with valid provider slugs', () => {
  const items = normalizeAll(loadRaw(FIXTURE_DIR));
  assert.strictEqual(items.length, 13);
  assert.ok(items.every((i) => i.provider_slug === 'together-ai' || i.provider_slug === 'fireworks-ai'));
});

// ---------------------------------------------------------------------------
// feedback_type mapping for every real item (10 Together + 3 Fireworks).
// ---------------------------------------------------------------------------
test('feedback_type is correct for all 13 real items', () => {
  const items = normalizeAll(loadRaw(FIXTURE_DIR));
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  const expected = {
    'tg-0001': 'feature_request', // docs/mixed but "lacked ... ability to" -> rule 2
    'tg-0002': 'complaint', // latency/negative -> rule 3
    'tg-0003': 'complaint', // latency/negative -> rule 3
    'tg-0004': 'complaint', // latency/mixed, category in complaint set -> rule 3
    'tg-0005': 'complaint', // pricing/negative -> rule 3
    'tg-0006': 'complaint', // other/negative -> rule 3 (sentiment)
    'tg-0007': 'complaint', // pricing/negative -> rule 3
    'tg-0008': 'complaint', // downtime/negative -> rule 3
    'tg-0009': 'complaint', // pricing/mixed, category in complaint set -> rule 3
    'tg-0010': 'complaint', // downtime/neutral, category in complaint set -> rule 3
    'fw-0001': 'complaint', // billing/negative -> rule 3
    'fw-0002': 'complaint', // model_quality/mixed, category in complaint set -> rule 3
    'fw-0003': 'complaint', // pricing/mixed, category in complaint set -> rule 3
  };

  for (const [id, ft] of Object.entries(expected)) {
    assert.ok(byId[id], `expected item ${id} to be present`);
    assert.strictEqual(byId[id].feedback_type, ft, `${id} feedback_type`);
  }
});

// ---------------------------------------------------------------------------
// feedback_type rule coverage (§3.1) — one synthetic case per rule branch.
// ---------------------------------------------------------------------------
test('feedback_type: rule 1 question via "?" cue', () => {
  assert.strictEqual(feedbackType({ summary: 'does this work?', sentiment: 'neutral' }), 'question');
});

test('feedback_type: rule 1 question via "how do i" cue', () => {
  assert.strictEqual(feedbackType({ summary: 'how do i set a key', sentiment: 'neutral' }), 'question');
});

test('feedback_type: rule 1 question via docs + non-negative (no feature cue)', () => {
  assert.strictEqual(feedbackType({ summary: 'the guide is sparse', category: 'docs', sentiment: 'neutral' }), 'question');
});

test('feedback_type: rule 2 feature_request via feature cue', () => {
  assert.strictEqual(feedbackType({ summary: 'missing batch endpoint', sentiment: 'neutral' }), 'feature_request');
});

test('feedback_type: rule 2 feature_request via api_change category', () => {
  assert.strictEqual(feedbackType({ summary: 'breaking change', category: 'api_change', sentiment: 'neutral' }), 'feature_request');
});

test('feedback_type: rule 3 complaint via negative sentiment', () => {
  assert.strictEqual(feedbackType({ summary: 'it broke', category: 'other', sentiment: 'negative' }), 'complaint');
});

test('feedback_type: rule 3 complaint via complaint category', () => {
  assert.strictEqual(feedbackType({ summary: 'down again', category: 'downtime', sentiment: 'neutral' }), 'complaint');
});

test('feedback_type: rule 4 positive only via explicit positive sentiment', () => {
  assert.strictEqual(feedbackType({ summary: 'works great', category: 'other', sentiment: 'positive' }), 'positive');
});

test('feedback_type: rule 5 neutral via neutral/mixed, no other cues', () => {
  assert.strictEqual(feedbackType({ summary: 'just a mention', category: 'other', sentiment: 'neutral' }), 'neutral');
  assert.strictEqual(feedbackType({ summary: 'just a mention', category: 'other', sentiment: 'mixed' }), 'neutral');
});

test('feedback_type: rule 5 fallback complaint when sentiment unknown', () => {
  assert.strictEqual(feedbackType({ summary: 'plain text', category: 'other' }), 'complaint');
});

test('feedback_type rule ordering: feature cue beats complaint category', () => {
  // "missing" (feature cue) must win over latency (complaint category)
  assert.strictEqual(feedbackType({ summary: 'missing a feature', category: 'latency', sentiment: 'mixed' }), 'feature_request');
});

// ---------------------------------------------------------------------------
// Null / empty rules (§3 field mapping).
// ---------------------------------------------------------------------------
test('original_text: empty/whitespace quote -> null, real quote preserved', () => {
  assert.strictEqual(normalize({ id: 'a', complaint: 's', quote: '' }, 'Together AI').original_text, null);
  assert.strictEqual(normalize({ id: 'b', complaint: 's', quote: '   ' }, 'Together AI').original_text, null);
  assert.strictEqual(normalize({ id: 'c', complaint: 's', quote: 'real' }, 'Together AI').original_text, 'real');
});

test('source_url: empty -> null, real url preserved', () => {
  assert.strictEqual(normalize({ id: 'a', complaint: 's', source_url: '' }, 'Together AI').source_url, null);
  assert.strictEqual(
    normalize({ id: 'b', complaint: 's', source_url: 'https://x.test/1' }, 'Together AI').source_url,
    'https://x.test/1',
  );
});

test('date: valid YYYY-MM-DD stays, invalid -> null, missing -> null', () => {
  assert.strictEqual(normalize({ id: 'a', complaint: 's', date: '2024-04-23' }, 'Together AI').date, '2024-04-23');
  assert.strictEqual(normalize({ id: 'b', complaint: 's', date: 'nope' }, 'Together AI').date, null);
  assert.strictEqual(normalize({ id: 'c', complaint: 's', date: '23-04-2024' }, 'Together AI').date, null);
  assert.strictEqual(normalize({ id: 'd', complaint: 's' }, 'Together AI').date, null);
});

test('provider_slug is derived from provider on every item', () => {
  assert.strictEqual(normalize({ id: 'a', complaint: 's' }, 'Together AI').provider_slug, 'together-ai');
  assert.strictEqual(normalize({ id: 'b', complaint: 's' }, 'Fireworks AI').provider_slug, 'fireworks-ai');
});

// ---------------------------------------------------------------------------
// Tolerance: item missing optional fields must normalize without throwing.
// ---------------------------------------------------------------------------
test('normalize tolerates an item missing all optional fields', () => {
  let out;
  assert.doesNotThrow(() => {
    out = normalize({ id: 'min', complaint: 'only required-ish' }, 'Together AI');
  });
  assert.strictEqual(out.id, 'min');
  assert.strictEqual(out.original_text, null);
  assert.strictEqual(out.source_url, null);
  assert.strictEqual(out.author_handle, null);
  assert.strictEqual(out.date, null);
  assert.deepStrictEqual(out.corroborating_urls, []);
  assert.strictEqual(out.verified, false);
  assert.ok(FEEDBACK_TYPES.includes(out.feedback_type));
});

test('verified passthrough: only literal true is true', () => {
  assert.strictEqual(normalize({ id: 'a', complaint: 's', verified: true }, 'Together AI').verified, true);
  assert.strictEqual(normalize({ id: 'b', complaint: 's', verified: 'true' }, 'Together AI').verified, false);
  assert.strictEqual(normalize({ id: 'c', complaint: 's' }, 'Together AI').verified, false);
});

// ---------------------------------------------------------------------------
// Schema conformance: every real item has all required fields + valid enums.
// ---------------------------------------------------------------------------
test('every normalized item conforms to the canonical schema', () => {
  const items = normalizeAll(loadRaw(FIXTURE_DIR));
  for (const it of items) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(it, field), `${it.id} missing field ${field}`);
    }
    assert.ok(FEEDBACK_TYPES.includes(it.feedback_type), `${it.id} feedback_type out of enum`);
    assert.ok(CATEGORIES.includes(it.category), `${it.id} category out of enum`);
    assert.ok(SENTIMENTS.includes(it.sentiment), `${it.id} sentiment out of enum`);
    assert.ok(typeof it.summary === 'string', `${it.id} summary must be string`);
    assert.ok(Array.isArray(it.corroborating_urls), `${it.id} corroborating_urls must be array`);
    assert.ok(typeof it.verified === 'boolean', `${it.id} verified must be boolean`);
    assert.ok(it.original_text === null || typeof it.original_text === 'string');
    assert.ok(it.source_url === null || typeof it.source_url === 'string');
    assert.ok(it.date === null || /^\d{4}-\d{2}-\d{2}$/.test(it.date));
  }
});
