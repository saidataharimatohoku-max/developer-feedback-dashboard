'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// The HTTP layer requires `express`. In a fully offline environment without
// node_modules these tests self-skip with a clear reason so the rest of the
// suite (loader -> normalizer -> store -> summary) still runs green. When deps
// are installed (`npm install`), this file exercises the real REST contract,
// including the 400 validation path that the store-level tests cannot reach.
let appMod = null;
let loadError = null;
try {
  // Read the frozen 13-item fixture so scheduled data collection can't break
  // the exact-count contract assertions below.
  process.env.FEEDBACK_DATA_DIR = require('node:path').join(__dirname, 'fixtures', 'data');
  appMod = require('../backend/server');
} catch (err) {
  loadError = err;
}

const skip = appMod
  ? false
  : `express not installed (offline): ${loadError && loadError.code ? loadError.code : 'MODULE_NOT_FOUND'}`;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: pathname }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = body ? JSON.parse(body) : null;
          } catch (e) {
            return reject(new Error(`non-JSON response for ${pathname}: ${body}`));
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      })
      .on('error', reject);
  });
}

async function withServer(fn) {
  const server = await listen(appMod.app);
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GET /api/health returns ok and item count', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.items_loaded, 13);
    assert.ok(Array.isArray(body.sources) && body.sources.length === 7);
  });
});

test('GET /api/feedback (no filters) returns all 13 items with the contract shape', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/feedback');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.count, 13);
    assert.strictEqual(body.items.length, 13);
    assert.ok('filters_applied' in body);
    assert.deepStrictEqual(body.filters_applied, {
      platform: null,
      feedback_type: null,
      category: null,
      q: null,
      source: null,
      sentiment: null,
      verified: null,
      date_from: null,
      date_to: null,
    });
  });
});

test('GET /api/feedback combined filters AND correctly', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(
      port,
      '/api/feedback?platform=together-ai&feedback_type=complaint&q=latency',
    );
    assert.strictEqual(status, 200);
    assert.ok(body.count >= 1);
    assert.ok(body.items.every((i) => i.provider_slug === 'together-ai' && i.feedback_type === 'complaint'));
    assert.ok(body.items.some((i) => i.id === 'tg-0002'));
  });
});

test('GET /api/feedback case-insensitive q', { skip }, async () => {
  await withServer(async (port) => {
    const a = await getJson(port, '/api/feedback?q=LATENCY');
    const b = await getJson(port, '/api/feedback?q=latency');
    assert.strictEqual(a.status, 200);
    assert.strictEqual(b.status, 200);
    assert.deepStrictEqual(
      a.body.items.map((i) => i.id).sort(),
      b.body.items.map((i) => i.id).sort(),
    );
  });
});

test('GET /api/feedback empty result returns count 0 / empty items (not error)', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/feedback?category=rate_limits');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.count, 0);
    assert.deepStrictEqual(body.items, []);
  });
});

test('GET /api/feedback rejects invalid feedback_type with 400', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/feedback?feedback_type=bogus');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error, 'invalid feedback_type');
    assert.deepStrictEqual(body.allowed, ['complaint', 'question', 'feature_request', 'neutral', 'positive']);
  });
});

test('GET /api/feedback rejects invalid category with 400', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/feedback?category=not-a-category');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error, 'invalid category');
    assert.ok(Array.isArray(body.allowed));
  });
});

test('GET /api/feedback rejects invalid platform with 400', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/feedback?platform=openai');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error, 'invalid platform');
    assert.ok(Array.isArray(body.allowed));
  });
});

test('GET /api/summary returns documented aggregate shape', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/summary');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.total, 13);
    assert.deepStrictEqual(body.by_platform, { 'Together AI': 10, 'Fireworks AI': 3 });
    assert.deepStrictEqual(body.by_feedback_type, {
      complaint: 12,
      question: 0,
      feature_request: 1,
      neutral: 0,
      positive: 0,
    });
    assert.strictEqual(body.undated_count, 0);
    const months = body.trend_by_month.map((t) => t.month);
    assert.deepStrictEqual(months, [...months].sort());
  });
});

test('GET /api/summary rejects invalid platform with 400', { skip }, async () => {
  await withServer(async (port) => {
    const { status, body } = await getJson(port, '/api/summary?platform=openai');
    assert.strictEqual(status, 400);
    assert.strictEqual(body.error, 'invalid platform');
  });
});
