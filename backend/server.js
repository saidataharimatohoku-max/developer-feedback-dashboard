'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

const { createStore } = require('./store');

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// ---------------------------------------------------------------------------
// Build the in-memory store once at startup (ARCHITECTURE.md §5).
// FEEDBACK_DATA_DIR overrides the data directory (used by the HTTP tests to
// read a frozen fixture so scheduled data collection can't break assertions).
// ---------------------------------------------------------------------------
const store = process.env.FEEDBACK_DATA_DIR
  ? createStore({ dataDir: process.env.FEEDBACK_DATA_DIR })
  : createStore();
store.load();

// ---------------------------------------------------------------------------
// Zero-dependency HTTP layer (Node built-in `http`). Same routes/responses as
// before — no framework, so the app runs with plain `node` and no npm install.
// ---------------------------------------------------------------------------
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// Serve a static file from FRONTEND_DIR, guarding against path traversal.
function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''));
  const normalizedRoot = path.resolve(FRONTEND_DIR);
  const normalizedFile = path.resolve(normalizedRoot, rel);

  // Containment check: resolved path must stay inside FRONTEND_DIR.
  if (normalizedFile !== normalizedRoot && !normalizedFile.startsWith(normalizedRoot + path.sep)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }

  fs.stat(normalizedFile, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(normalizedFile).toLowerCase();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(normalizedFile).pipe(res);
  });
}

// Read all supported filter params from the query string into a plain object.
// Values default to null when absent so store.filter() ignores them.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SENTIMENTS = ['negative', 'mixed', 'neutral', 'positive'];

function readFilters(query) {
  const get = (k) => {
    const v = query.get(k);
    return v != null ? String(v) : null;
  };
  return {
    platform: get('platform'),
    feedback_type: get('feedback_type'),
    category: get('category'),
    q: get('q'),
    source: get('source'),
    sentiment: get('sentiment'),
    verified: get('verified'),
    date_from: get('date_from'),
    date_to: get('date_to'),
  };
}

// Validate the filter values that have a fixed allowed set; return an error
// object (for a 400) or null when everything is acceptable.
function validateFilters(f) {
  if (f.platform != null && !store.knownPlatform(f.platform)) {
    return { error: 'invalid platform', allowed: Array.from(store.platforms) };
  }
  if (f.feedback_type != null && !store.FEEDBACK_TYPES.includes(f.feedback_type.toLowerCase())) {
    return { error: 'invalid feedback_type', allowed: store.FEEDBACK_TYPES };
  }
  if (f.category != null && !store.CATEGORIES.includes(f.category.toLowerCase())) {
    return { error: 'invalid category', allowed: store.CATEGORIES };
  }
  if (f.sentiment != null && !SENTIMENTS.includes(f.sentiment.toLowerCase())) {
    return { error: 'invalid sentiment', allowed: SENTIMENTS };
  }
  if (f.verified != null && !['true', 'false'].includes(f.verified.toLowerCase())) {
    return { error: 'invalid verified', allowed: ['true', 'false'] };
  }
  if (f.date_from != null && !DATE_RE.test(f.date_from)) {
    return { error: 'invalid date_from', allowed: 'YYYY-MM-DD' };
  }
  if (f.date_to != null && !DATE_RE.test(f.date_to)) {
    return { error: 'invalid date_to', allowed: 'YYYY-MM-DD' };
  }
  return null;
}

function handleFeedback(query, res) {
  const filters = readFilters(query);
  const err = validateFilters(filters);
  if (err) return sendJson(res, 400, err);

  const items = store.filter(filters);
  sendJson(res, 200, { count: items.length, filters_applied: filters, items });
}

// CSV column order for the export. Mirrors the canonical item fields most
// useful to a non-technical stakeholder opening the file in Excel.
const CSV_COLUMNS = [
  'id',
  'provider',
  'feedback_type',
  'category',
  'sentiment',
  'date',
  'summary',
  'original_text',
  'source',
  'source_url',
  'verified',
  'auto_collected',
];

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  // Quote when the value contains a delimiter, quote, or newline (RFC 4180).
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(items) {
  const header = CSV_COLUMNS.join(',');
  const rows = items.map((it) => CSV_COLUMNS.map((c) => csvCell(it[c])).join(','));
  return [header, ...rows].join('\r\n');
}

function handleFeedbackCsv(query, res) {
  const filters = readFilters(query);
  const err = validateFilters(filters);
  if (err) return sendJson(res, 400, err);

  const items = store.filter(filters);

  // Prepend a UTF-8 BOM so Excel renders accents/symbols correctly.
  const body = '\uFEFF' + toCsv(items);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="developer-feedback.csv"',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function handleSummary(query, res) {
  const platform = query.get('platform');
  if (platform != null && !store.knownPlatform(platform)) {
    return sendJson(res, 400, { error: 'invalid platform', allowed: Array.from(store.platforms) });
  }
  sendJson(res, 200, store.summary({ platform: platform != null ? String(platform) : undefined }));
}

function requestHandler(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  const { pathname } = parsed;
  const query = parsed.searchParams;

  // Read-only API: only GET is supported.
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  // Pick up data refreshed on disk (by the background collector) without a restart.
  if (pathname.startsWith('/api/')) {
    store.reloadIfChanged();
  }

  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      items_loaded: store.all().length,
      sources: store.SOURCE_FILES,
    });
  }
  if (pathname === '/api/feedback') {
    return handleFeedback(query, res);
  }
  if (pathname === '/api/feedback.csv') {
    return handleFeedbackCsv(query, res);
  }
  if (pathname === '/api/summary') {
    return handleSummary(query, res);
  }
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: 'not found' });
  }

  // Anything else: static frontend (served at "/").
  serveStatic(pathname, res);
}

// Express-compatible shim so existing callers/tests can do `app.listen(port, cb)`
// and get back an http.Server (with .address()/.close()).
const app = {
  listen(port, cb) {
    const server = http.createServer(requestHandler);
    return server.listen(port, cb);
  },
};

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Developer Feedback API listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Loaded ${store.all().length} normalized items from ${store.SOURCE_FILES.join(', ')}`);
  });
}

module.exports = { app, store, requestHandler };
