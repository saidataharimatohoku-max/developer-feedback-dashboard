'use strict';

// ---------------------------------------------------------------------------
// Developer Feedback Dashboard — client logic.
// Talks ONLY to the same-origin backend: GET /api/summary and GET /api/feedback.
// No external/third-party calls, no build step.
// ---------------------------------------------------------------------------

const FEEDBACK_TYPE_LABELS = {
  complaint: 'Complaint',
  question: 'Question',
  feature_request: 'Feature request',
  positive: 'Positive',
};

// Chart labels (per spec: "positive" is shown as "Praise" in the type chart).
const FEEDBACK_TYPE_CHART_LABELS = {
  complaint: 'Complaint',
  question: 'Question',
  feature_request: 'Feature Request',
  positive: 'Praise',
};
const FEEDBACK_TYPE_ORDER = ['complaint', 'question', 'feature_request', 'positive'];
const FEEDBACK_TYPE_COLORS = {
  complaint: '#ef4444',
  question: '#3b82f6',
  feature_request: '#a855f7',
  positive: '#22c55e',
};
const PLATFORM_COLORS = ['#6c8cff', '#f59e0b'];

// DOM references.
const els = {
  statCards: document.getElementById('stat-cards'),
  chartPlatform: document.getElementById('chart-platform'),
  chartType: document.getElementById('chart-type'),
  chartTrend: document.getElementById('chart-trend'),
  byCategory: document.getElementById('by-category'),
  form: document.getElementById('filter-form'),
  platform: document.getElementById('filter-platform'),
  feedbackType: document.getElementById('filter-feedback-type'),
  category: document.getElementById('filter-category'),
  q: document.getElementById('filter-q'),
  reset: document.getElementById('reset-filters'),
  cardGrid: document.getElementById('card-grid'),
  emptyState: document.getElementById('empty-state'),
  resultCount: document.getElementById('result-count'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelize(key) {
  return String(key).replace(/_/g, ' ');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  return res.json();
}

// Build a "label / bar / count" list from an entries array, scaled to max.
function renderBarList(target, entries) {
  if (!entries.length) {
    target.innerHTML = '<li class="bar-row"><span class="bar-label">No data</span></li>';
    return;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  target.innerHTML = entries
    .map(([label, count]) => {
      const pct = Math.round((count / max) * 100);
      return `
        <li class="bar-row">
          <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(labelize(label))}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
          <span class="bar-count">${count}</span>
        </li>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Charts (inline SVG — no chart library, no external calls).
// All values come from /api/summary, which is derived from data/*.json only.
// ---------------------------------------------------------------------------
function emptyChart(target) {
  target.innerHTML = '<p class="chart-empty">No data</p>';
}

// Color-swatch legend rendered below a chart. items: [{ label, count, color }].
function legendHtml(items) {
  const rows = items
    .map(
      ({ label, count, color }) => `
        <li class="legend-item">
          <span class="legend-swatch" style="background:${color}"></span>
          <span class="legend-label">${escapeHtml(label)}</span>
          <span class="legend-count">${count}</span>
        </li>`,
    )
    .join('');
  return `<ul class="chart-legend">${rows}</ul>`;
}

// Compute a clean integer y-axis scale: a "nice" max and evenly spaced ticks.
function niceScale(max, targetTicks = 4) {
  const safeMax = Math.max(1, max);
  const rawStep = safeMax / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep) || 0));
  const step = Math.max(1, Math.round([1, 2, 5, 10].find((m) => m * pow >= rawStep) * pow || pow));
  const niceMax = Math.ceil(safeMax / step) * step;
  const ticks = [];
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  return { niceMax, ticks };
}

// Vertical bar chart. entries: [[label, count], ...]; colors: array or map by key.
function renderBarChart(target, entries, colorFor) {
  if (!entries.length) return emptyChart(target);

  const W = 360;
  const H = 220;
  const padL = 32;
  const padR = 12;
  const padT = 18;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(...entries.map(([, c]) => c), 1);
  const { niceMax, ticks } = niceScale(max);
  const slot = plotW / entries.length;
  const barW = Math.min(64, slot * 0.6);

  const baseY = padT + plotH;
  const yAt = (v) => baseY - (v / niceMax) * plotH;

  // Light horizontal gridlines + y-axis scale labels (skip 0: the baseline covers it).
  const grid = ticks
    .map((t) => {
      const y = yAt(t);
      const gridline =
        t === 0
          ? ''
          : `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="chart-grid" />`;
      return `${gridline}
        <text x="${(padL - 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="chart-ytick" text-anchor="end">${t}</text>`;
    })
    .join('');

  const bars = entries
    .map(([label, count], i) => {
      const cx = padL + slot * i + slot / 2;
      const h = (count / niceMax) * plotH;
      const x = cx - barW / 2;
      const y = baseY - h;
      const color = colorFor(label, i);
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
          rx="4" fill="${color}">
          <title>${escapeHtml(label)}: ${count}</title>
        </rect>
        <text x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" class="chart-value" text-anchor="middle">${count}</text>
        <text x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" class="chart-axis" text-anchor="middle">${escapeHtml(label)}</text>`;
    })
    .join('');

  target.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-baseline" />
      ${bars}
    </svg>
    ${legendHtml(entries.map(([label, count], i) => ({ label, count, color: colorFor(label, i) })))}`;
}

// Simple line + area trend chart. points: [{ label, count }, ...] (ascending).
function renderTrendChart(target, points) {
  if (!points.length) return emptyChart(target);

  const W = 740;
  const H = 220;
  const padL = 32;
  const padR = 16;
  const padT = 18;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(...points.map((p) => p.count), 1);
  const { niceMax, ticks } = niceScale(max);
  const baseY = padT + plotH;
  const n = points.length;
  const xAt = (i) => (n === 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const yAt = (c) => baseY - (c / niceMax) * plotH;

  // Light horizontal gridlines + y-axis scale labels (skip 0: the baseline covers it).
  const grid = ticks
    .map((t) => {
      const y = yAt(t);
      const gridline =
        t === 0
          ? ''
          : `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="chart-grid" />`;
      return `${gridline}
        <text x="${(padL - 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="chart-ytick" text-anchor="end">${t}</text>`;
    })
    .join('');

  const coords = points.map((p, i) => [xAt(i), yAt(p.count)]);
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[n - 1][0].toFixed(1)},${baseY} L${coords[0][0].toFixed(1)},${baseY} Z`;

  const dots = points
    .map((p, i) => {
      const [x, y] = coords[i];
      return `
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="chart-dot">
          <title>${escapeHtml(p.label)}: ${p.count}</title>
        </circle>
        <text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" class="chart-value" text-anchor="middle">${p.count}</text>
        <text x="${x.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" class="chart-axis" text-anchor="middle">${escapeHtml(p.label)}</text>`;
    })
    .join('');

  target.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-baseline" />
      <path d="${area}" class="chart-area" />
      <path d="${line}" class="chart-line" />
      ${dots}
    </svg>
    ${legendHtml([{ label: 'Feedback items per month', count: total, color: 'var(--accent)' }])}`;
}

// ---------------------------------------------------------------------------
// Summary section
// ---------------------------------------------------------------------------
async function loadSummary() {
  let data;
  try {
    data = await fetchJson('/api/summary');
  } catch (err) {
    els.statCards.innerHTML = `<div class="stat-card"><span class="stat-label">Failed to load summary</span></div>`;
    emptyChart(els.chartPlatform);
    emptyChart(els.chartType);
    emptyChart(els.chartTrend);
    console.error(err);
    return;
  }

  // Stat cards: total + per-platform counts.
  const platformCards = Object.entries(data.by_platform || {})
    .map(
      ([name, count]) => `
        <div class="stat-card">
          <div class="stat-value">${count}</div>
          <div class="stat-label">${escapeHtml(name)}</div>
        </div>`,
    )
    .join('');

  els.statCards.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${data.total ?? 0}</div>
      <div class="stat-label">Total feedback items</div>
    </div>
    ${platformCards}`;

  // Chart: feedback by platform.
  const platformEntries = Object.entries(data.by_platform || {});
  renderBarChart(els.chartPlatform, platformEntries, (_label, i) => PLATFORM_COLORS[i % PLATFORM_COLORS.length]);

  // Chart: feedback by type (canonical order, include zeros, "Praise" label).
  const byType = data.by_feedback_type || {};
  const typeKeys = [
    ...FEEDBACK_TYPE_ORDER.filter((k) => k in byType),
    ...Object.keys(byType).filter((k) => !FEEDBACK_TYPE_ORDER.includes(k)),
  ];
  const typeEntries = typeKeys.map((k) => [FEEDBACK_TYPE_CHART_LABELS[k] || labelize(k), byType[k]]);
  const typeColorByKey = {};
  typeKeys.forEach((k) => {
    typeColorByKey[FEEDBACK_TYPE_CHART_LABELS[k] || labelize(k)] = FEEDBACK_TYPE_COLORS[k] || '#6c8cff';
  });
  renderBarChart(els.chartType, typeEntries, (label) => typeColorByKey[label] || '#6c8cff');

  // Chart: trend by month (already ascending from the API).
  const trendPoints = (data.trend_by_month || []).map((t) => ({ label: t.month, count: t.count }));
  renderTrendChart(els.chartTrend, trendPoints);

  // By category (sorted desc by count).
  const catEntries = Object.entries(data.by_category || {}).sort((a, b) => b[1] - a[1]);
  renderBarList(els.byCategory, catEntries);

  // Populate category dropdown from categories actually present.
  populateCategoryOptions(catEntries.map(([cat]) => cat));
}

function populateCategoryOptions(categories) {
  const current = els.category.value;
  const sorted = [...categories].sort();
  els.category.innerHTML =
    '<option value="">All categories</option>' +
    sorted
      .map(
        (cat) =>
          `<option value="${escapeHtml(cat)}">${escapeHtml(labelize(cat))}</option>`,
      )
      .join('');
  // Restore prior selection if still valid.
  if (current && sorted.includes(current)) {
    els.category.value = current;
  }
}

// ---------------------------------------------------------------------------
// Feedback list
// ---------------------------------------------------------------------------
function buildQueryString() {
  const params = new URLSearchParams();
  if (els.platform.value) params.set('platform', els.platform.value);
  if (els.feedbackType.value) params.set('feedback_type', els.feedbackType.value);
  if (els.category.value) params.set('category', els.category.value);
  const q = els.q.value.trim();
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function renderCard(item) {
  const ft = item.feedback_type;
  const ftLabel = FEEDBACK_TYPE_LABELS[ft] || labelize(ft);

  const verifiedBadge = item.verified
    ? '<span class="badge badge-verified">✓ Verified</span>'
    : '';

  const originalText = item.original_text
    ? `<p class="card-original">${escapeHtml(item.original_text)}</p>`
    : '';

  const date = item.date
    ? `<span class="date">${escapeHtml(item.date)}</span>`
    : '<span class="date"></span>';

  const sourceLink = item.source_url
    ? `<a class="source-link" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">View source ↗</a>`
    : '';

  return `
    <article class="card">
      <div class="card-top">
        <span class="provider-name">${escapeHtml(item.provider)}</span>
        <span class="badges">
          <span class="badge badge-${escapeHtml(ft)}">${escapeHtml(ftLabel)}</span>
          ${verifiedBadge}
        </span>
      </div>
      <p class="card-summary">${escapeHtml(item.summary)}</p>
      ${originalText}
      <div class="card-meta">
        <span class="source">${escapeHtml(item.source)}</span>
        ${date}
        ${sourceLink}
      </div>
    </article>`;
}

async function loadFeedback() {
  const url = `/api/feedback${buildQueryString()}`;
  let data;
  try {
    data = await fetchJson(url);
  } catch (err) {
    console.error(err);
    els.cardGrid.innerHTML = '';
    els.emptyState.hidden = false;
    els.emptyState.textContent = 'Failed to load feedback.';
    els.resultCount.textContent = '';
    return;
  }

  const items = data.items || [];
  els.resultCount.textContent = `${data.count} ${data.count === 1 ? 'item' : 'items'}`;

  if (!items.length) {
    els.cardGrid.innerHTML = '';
    els.emptyState.hidden = false;
    els.emptyState.textContent = 'No feedback matches the current filters.';
    return;
  }

  els.emptyState.hidden = true;
  els.cardGrid.innerHTML = items.map(renderCard).join('');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
let searchTimer = null;

function wireEvents() {
  els.platform.addEventListener('change', loadFeedback);
  els.feedbackType.addEventListener('change', loadFeedback);
  els.category.addEventListener('change', loadFeedback);

  // Debounce free-text search.
  els.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadFeedback, 250);
  });

  els.form.addEventListener('submit', (e) => e.preventDefault());

  els.reset.addEventListener('click', () => {
    els.platform.value = '';
    els.feedbackType.value = '';
    els.category.value = '';
    els.q.value = '';
    loadFeedback();
  });
}

function init() {
  wireEvents();
  // Summary first (also populates category options), then the list.
  loadSummary();
  loadFeedback();
}

document.addEventListener('DOMContentLoaded', init);
