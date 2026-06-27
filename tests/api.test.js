'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { createStore } = require('../backend/store');
const path = require('node:path');

// Frozen 13-item dataset so scheduled HN collection (which mutates data/*.json)
// can never break these exact-count assertions.
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'data');

function freshStore() {
  const store = createStore({ dataDir: FIXTURE_DIR });
  store.load();
  return store;
}

test('store loads all items and known platforms', () => {
  const store = freshStore();
  assert.strictEqual(store.all().length, 13);
  assert.ok(store.knownPlatform('together-ai'));
  assert.ok(store.knownPlatform('Fireworks AI'));
  assert.ok(!store.knownPlatform('bogus-co'));
});

test('filter by platform (slug) scopes results', () => {
  const store = freshStore();
  const tg = store.filter({ platform: 'together-ai' });
  assert.strictEqual(tg.length, 10);
  assert.ok(tg.every((i) => i.provider === 'Together AI'));

  const fw = store.filter({ platform: 'fireworks-ai' });
  assert.strictEqual(fw.length, 3);
  assert.strictEqual(fw[0].id, 'fw-0001');
});

test('filter by feedback_type and category combine (AND)', () => {
  const store = freshStore();
  const out = store.filter({ feedback_type: 'complaint', category: 'latency' });
  assert.ok(out.length >= 1);
  assert.ok(out.every((i) => i.feedback_type === 'complaint' && i.category === 'latency'));
});

test('three filters AND together (platform + feedback_type + q)', () => {
  const store = freshStore();
  const out = store.filter({ platform: 'together-ai', feedback_type: 'complaint', q: 'latency' });
  assert.ok(out.length >= 1);
  assert.ok(out.every((i) => i.provider_slug === 'together-ai' && i.feedback_type === 'complaint'));
  assert.ok(out.some((i) => i.id === 'tg-0002'));
  // Fireworks item must be excluded by the platform filter.
  assert.ok(out.every((i) => i.id !== 'fw-0001'));
});

test('category filter returns the expected subset', () => {
  const store = freshStore();
  const pricing = store.filter({ category: 'pricing' });
  assert.strictEqual(pricing.length, 4);
  const ids = pricing.map((i) => i.id).sort();
  assert.deepStrictEqual(ids, ['fw-0003', 'tg-0005', 'tg-0007', 'tg-0009']);
});

test('empty filter result returns an empty array, not an error', () => {
  const store = freshStore();
  const out = store.filter({ category: 'rate_limits' });
  assert.ok(Array.isArray(out));
  assert.strictEqual(out.length, 0);
});

test('q filter is a case-insensitive substring over summary + original_text', () => {
  const store = freshStore();
  const upper = store.filter({ q: 'LATENCY' });
  const lower = store.filter({ q: 'latency' });
  assert.ok(upper.length >= 1);
  // case-insensitive: both queries yield the identical set
  assert.deepStrictEqual(upper.map((i) => i.id).sort(), lower.map((i) => i.id).sort());
  assert.ok(upper.some((i) => i.id === 'tg-0002'));
});

test('q can match text that only appears in original_text', () => {
  const store = freshStore();
  // "groq" appears in quotes/original_text, not in some summaries
  const out = store.filter({ q: 'groq' });
  assert.ok(out.some((i) => i.id === 'tg-0002'));
});

test('store exposes the enum allow-lists used for 400 validation', () => {
  const store = freshStore();
  assert.deepStrictEqual(store.FEEDBACK_TYPES, ['complaint', 'question', 'feature_request', 'positive']);
  assert.ok(store.CATEGORIES.includes('latency'));
  // The exact predicates server.js uses to accept/reject query params.
  assert.ok(store.FEEDBACK_TYPES.includes('complaint'));
  assert.ok(!store.FEEDBACK_TYPES.includes('bogus'));
  assert.ok(store.CATEGORIES.includes('pricing'));
  assert.ok(!store.CATEGORIES.includes('not-a-category'));
  assert.ok(store.knownPlatform('together-ai'));
  assert.ok(!store.knownPlatform('openai'));
});

test('summary aggregates totals, types (with zeros), trend and undated_count', () => {
  const store = freshStore();
  const s = store.summary();
  assert.strictEqual(s.total, 13);
  assert.strictEqual(s.by_platform['Together AI'], 10);
  assert.strictEqual(s.by_platform['Fireworks AI'], 3);
  // all four feedback_type keys present, even when 0
  assert.ok('question' in s.by_feedback_type);
  assert.ok('positive' in s.by_feedback_type);
  assert.strictEqual(s.undated_count, 0);
  // trend ascending by month
  const months = s.trend_by_month.map((t) => t.month);
  assert.deepStrictEqual(months, [...months].sort());
});

test('summary by_feedback_type has exact counts for the real dataset', () => {
  const store = freshStore();
  const s = store.summary();
  assert.deepStrictEqual(s.by_feedback_type, {
    complaint: 12,
    question: 0,
    feature_request: 1,
    positive: 0,
  });
});

test('summary by_category has exact counts for the real dataset', () => {
  const store = freshStore();
  const s = store.summary();
  assert.deepStrictEqual(s.by_category, {
    docs: 1,
    latency: 3,
    pricing: 4,
    other: 1,
    downtime: 2,
    billing: 1,
    model_quality: 1,
  });
  // by_category counts must sum to the total
  const sum = Object.values(s.by_category).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 13);
});

test('summary trend_by_month is exact and strictly ascending', () => {
  const store = freshStore();
  const s = store.summary();
  assert.deepStrictEqual(s.trend_by_month, [
    { month: '2024-04', count: 1 },
    { month: '2024-05', count: 1 },
    { month: '2025-09', count: 1 },
    { month: '2026-01', count: 1 },
    { month: '2026-02', count: 2 },
    { month: '2026-03', count: 1 },
    { month: '2026-05', count: 3 },
    { month: '2026-06', count: 3 },
  ]);
  // trend counts (dated items) + undated must equal total
  const dated = s.trend_by_month.reduce((a, t) => a + t.count, 0);
  assert.strictEqual(dated + s.undated_count, s.total);
});

test('summary trend_by_platform_month aligns to the month axis and totals match', () => {
  const store = freshStore();
  const s = store.summary();
  const months = s.trend_by_month.map((t) => t.month);

  // Same ascending month axis as trend_by_month.
  assert.deepStrictEqual(s.trend_by_platform_month.months, months);

  // One series per platform, each with one count per month.
  const series = s.trend_by_platform_month.series;
  assert.deepStrictEqual(
    series.map((x) => x.key).sort(),
    Object.keys(s.by_platform).sort(),
  );
  for (const x of series) {
    assert.strictEqual(x.counts.length, months.length);
  }

  // Each platform's series sums to its all-time (dated) total, and the grand
  // total across all series equals the dated-item count.
  let grand = 0;
  for (const x of series) {
    const sum = x.counts.reduce((a, b) => a + b, 0);
    grand += sum;
    assert.strictEqual(sum, s.by_platform[x.key]);
  }
  const datedTotal = s.trend_by_month.reduce((a, t) => a + t.count, 0);
  assert.strictEqual(grand, datedTotal);
});

test('summary trend_by_category_month aligns to the month axis and totals match', () => {
  const store = freshStore();
  const s = store.summary();
  const months = s.trend_by_month.map((t) => t.month);

  assert.deepStrictEqual(s.trend_by_category_month.months, months);

  const series = s.trend_by_category_month.series;
  assert.deepStrictEqual(
    series.map((x) => x.key).sort(),
    Object.keys(s.by_category).sort(),
  );
  for (const x of series) {
    assert.strictEqual(x.counts.length, months.length);
    const sum = x.counts.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, s.by_category[x.key]);
  }
});

test('summary can be scoped by platform', () => {
  const store = freshStore();
  const s = store.summary({ platform: 'fireworks-ai' });
  assert.strictEqual(s.total, 3);
  assert.deepStrictEqual(Object.keys(s.by_platform), ['Fireworks AI']);
  // feedback_type keys remain present even when scoped
  assert.ok('question' in s.by_feedback_type);
  assert.strictEqual(s.by_feedback_type.complaint, 3);
});

test('platform-scoped empty summary returns total 0, not an error', () => {
  const store = freshStore();
  // a platform with no items still yields a well-formed, zeroed summary
  const s = store.summary({ platform: 'nonexistent-co' });
  assert.strictEqual(s.total, 0);
  assert.deepStrictEqual(s.by_platform, {});
  assert.strictEqual(s.undated_count, 0);
  assert.deepStrictEqual(s.trend_by_month, []);
  assert.deepStrictEqual(s.by_feedback_type, { complaint: 0, question: 0, feature_request: 0, positive: 0 });
});
