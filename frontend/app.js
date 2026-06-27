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

// Sentiment series shown in the "Sentiment over time" chart (stacked).
const SENTIMENT_SERIES = [
  { key: 'negative', label: 'Negative', color: '#ef4444' },
  { key: 'mixed', label: 'Mixed', color: '#f59e0b' },
  { key: 'neutral', label: 'Neutral', color: '#64748b' },
  { key: 'positive', label: 'Positive', color: '#22c55e' },
];
const PLATFORM_COLORS = ['#6c8cff', '#f59e0b', '#22c55e', '#a855f7', '#06b6d4', '#ef4444'];

// Palette for the per-category trend lines (longer: categories outnumber providers).
const CATEGORY_COLORS = [
  '#6c8cff', '#f59e0b', '#22c55e', '#a855f7', '#06b6d4',
  '#ef4444', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6', '#64748b',
];

// Stable colour per issue category (canonical order → palette) so the same
// category keeps the same colour everywhere: the "By category" bars and the
// per-category trend lines.
const CATEGORY_ORDER = [
  'latency', 'downtime', 'billing', 'rate_limits', 'model_quality',
  'api_change', 'support', 'docs', 'pricing', 'other',
];
const CATEGORY_COLOR_MAP = {};
CATEGORY_ORDER.forEach((cat, i) => {
  CATEGORY_COLOR_MAP[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
});
function categoryColor(cat) {
  return CATEGORY_COLOR_MAP[cat] || 'var(--accent)';
}

// DOM references.
const els = {
  topIssue: document.getElementById('top-issue'),
  lastUpdated: document.getElementById('last-updated'),
  execSummary: document.getElementById('exec-summary-body'),
  statCards: document.getElementById('stat-cards'),
  chartPlatform: document.getElementById('chart-platform'),
  chartType: document.getElementById('chart-type'),
  chartTrend: document.getElementById('chart-trend'),
  chartSentiment: document.getElementById('chart-sentiment'),
  chartBreakdown: document.getElementById('chart-breakdown'),
  trendBreakdown: document.getElementById('trend-breakdown'),
  trendBreakdownCaption: document.getElementById('trend-breakdown-caption'),
  comparison: document.getElementById('comparison-table'),
  byCategory: document.getElementById('by-category'),
  form: document.getElementById('filter-form'),
  platform: document.getElementById('filter-platform'),
  feedbackType: document.getElementById('filter-feedback-type'),
  category: document.getElementById('filter-category'),
  q: document.getElementById('filter-q'),
  reset: document.getElementById('reset-filters'),
  exportCsv: document.getElementById('export-csv'),
  exportJson: document.getElementById('export-json'),
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-06" -> "Jun 2026". Returns '' for missing/odd input.
function formatMonth(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return '';
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1] || ''} ${y}`.trim();
}

// ISO timestamp -> friendly local string, e.g. "Jun 26, 2026, 2:36 PM".
function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  return res.json();
}

// Build a "label / bar / count" list from an entries array, scaled to max.
// colorFor(label) is optional; when given, each bar gets its own colour.
function renderBarList(target, entries, colorFor) {
  if (!entries.length) {
    target.innerHTML = '<li class="bar-row"><span class="bar-label">No data</span></li>';
    return;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  target.innerHTML = entries
    .map(([label, count]) => {
      const pct = Math.round((count / max) * 100);
      const fillStyle = colorFor
        ? `width:${pct}%;background:${colorFor(label)}`
        : `width:${pct}%`;
      return `
        <li class="bar-row">
          <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(labelize(label))}</span>
          <span class="bar-track"><span class="bar-fill" style="${fillStyle}"></span></span>
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

// Greedily wrap a label into lines of at most ~maxChars characters, breaking on
// spaces, so long provider names fit under their bar instead of overlapping.
function wrapAxisLabel(label, maxChars = 12) {
  const words = String(label).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
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
      const labelTspans = wrapAxisLabel(label)
        .map(
          (line, li) =>
            `<tspan x="${cx.toFixed(1)}" dy="${li === 0 ? 0 : 9}">${escapeHtml(line)}</tspan>`,
        )
        .join('');
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
          rx="4" fill="${color}">
          <title>${escapeHtml(label)}: ${count}</title>
        </rect>
        <text x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" class="chart-value" text-anchor="middle">${count}</text>
        <text x="${cx.toFixed(1)}" y="${(baseY + 14).toFixed(1)}" class="chart-axis chart-axis-bar" text-anchor="middle">${labelTspans}</text>`;
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

// Stacked vertical bar chart of sentiment per month.
// rows: [{ month, negative, neutral, mixed, positive }, ...] (ascending).
function renderSentimentChart(target, rows) {
  if (!rows.length) return emptyChart(target);

  // Only show series that actually occur in the data.
  const series = SENTIMENT_SERIES.filter((s) => rows.some((r) => (r[s.key] || 0) > 0));
  if (!series.length) return emptyChart(target);

  const W = 740;
  const H = 240;
  const padL = 32;
  const padR = 16;
  const padT = 18;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const totals = rows.map((r) => series.reduce((sum, s) => sum + (r[s.key] || 0), 0));
  const max = Math.max(...totals, 1);
  const { niceMax, ticks } = niceScale(max);
  const slot = plotW / rows.length;
  const barW = Math.min(54, slot * 0.6);
  const baseY = padT + plotH;
  const yAt = (v) => baseY - (v / niceMax) * plotH;

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

  const cols = rows
    .map((r, i) => {
      const cx = padL + slot * i + slot / 2;
      const x = cx - barW / 2;
      let cursorY = baseY;
      const segs = series
        .map((s) => {
          const v = r[s.key] || 0;
          if (v <= 0) return '';
          const h = (v / niceMax) * plotH;
          cursorY -= h;
          return `<rect x="${x.toFixed(1)}" y="${cursorY.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}"><title>${escapeHtml(r.month)} — ${s.label}: ${v}</title></rect>`;
        })
        .join('');
      const total = totals[i];
      const topY = baseY - (total / niceMax) * plotH;
      return `${segs}
        <text x="${cx.toFixed(1)}" y="${(topY - 6).toFixed(1)}" class="chart-value" text-anchor="middle">${total}</text>
        <text x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" class="chart-axis" text-anchor="middle">${escapeHtml(r.month)}</text>`;
    })
    .join('');

  const legendItems = series.map((s) => ({
    label: s.label,
    count: rows.reduce((sum, r) => sum + (r[s.key] || 0), 0),
    color: s.color,
  }));

  target.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-baseline" />
      ${cols}
    </svg>
    ${legendHtml(legendItems)}`;
}

// Multi-line trend chart: one line per series over a shared month axis.
// months: ["2026-01", ...] (ascending); series: [{ label, counts:[...], color }].
function renderMultiLineChart(target, months, series) {
  if (!months.length || !series.length) return emptyChart(target);

  const W = 740;
  const H = 260;
  const padL = 32;
  const padR = 16;
  const padT = 18;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...series.flatMap((s) => s.counts));
  const { niceMax, ticks } = niceScale(max);
  const baseY = padT + plotH;
  const n = months.length;
  const xAt = (i) => (n === 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const yAt = (c) => baseY - (c / niceMax) * plotH;

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

  // Thin out x labels when there are many months, so they don't overlap.
  const labelEvery = Math.ceil(n / 12);
  const monthLabels = months
    .map((m, i) =>
      i % labelEvery === 0
        ? `<text x="${xAt(i).toFixed(1)}" y="${(baseY + 16).toFixed(1)}" class="chart-axis" text-anchor="middle">${escapeHtml(m)}</text>`
        : '',
    )
    .join('');

  const lines = series
    .map((s) => {
      const path = s.counts
        .map((c, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(c).toFixed(1)}`)
        .join(' ');
      const dots = s.counts
        .map(
          (c, i) =>
            `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(c).toFixed(1)}" r="3" fill="${s.color}"><title>${escapeHtml(s.label)} — ${escapeHtml(months[i])}: ${c}</title></circle>`,
        )
        .join('');
      return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" class="trend-line" />${dots}`;
    })
    .join('');

  const legendItems = series.map((s) => ({
    label: s.label,
    count: s.counts.reduce((a, b) => a + b, 0),
    color: s.color,
  }));

  target.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-baseline" />
      ${monthLabels}
      ${lines}
    </svg>
    ${legendHtml(legendItems)}`;
}

// ---------------------------------------------------------------------------
// Summary section
// ---------------------------------------------------------------------------
let lastSummary = null;

// Render the multi-line "trends over time" chart for the currently selected
// breakdown dimension (provider or category). Reads from the cached summary.
function renderBreakdownTrend() {
  if (!els.chartBreakdown) return;
  const dim = els.trendBreakdown ? els.trendBreakdown.value : 'platform';
  const data = lastSummary;

  if (!data) {
    emptyChart(els.chartBreakdown);
    return;
  }

  const source =
    dim === 'category' ? data.trend_by_category_month : data.trend_by_platform_month;
  const months = (source && source.months) || [];
  const rawSeries = (source && source.series) || [];
  const palette = dim === 'category' ? CATEGORY_COLORS : PLATFORM_COLORS;

  const series = rawSeries.map((s, i) => ({
    label: dim === 'category' ? labelize(s.key) : s.key,
    counts: s.counts,
    color: dim === 'category' ? categoryColor(s.key) : palette[i % palette.length],
  }));

  if (els.trendBreakdownCaption) {
    els.trendBreakdownCaption.textContent =
      dim === 'category' ? 'Feedback per month by category' : 'Feedback per month by provider';
  }

  renderMultiLineChart(els.chartBreakdown, months, series);
}

async function loadSummary() {
  let data;
  try {
    data = await fetchJson('/api/summary');
  } catch (err) {
    els.statCards.innerHTML = `<div class="stat-card"><span class="stat-label">Failed to load summary</span></div>`;
    emptyChart(els.chartPlatform);
    emptyChart(els.chartType);
    emptyChart(els.chartTrend);
    emptyChart(els.chartSentiment);
    if (els.chartBreakdown) emptyChart(els.chartBreakdown);
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

  // Chart: sentiment over time (stacked by month).
  renderSentimentChart(els.chartSentiment, data.sentiment_trend_by_month || []);

  // Chart: trends over time broken down by provider or category (multi-line).
  lastSummary = data;
  renderBreakdownTrend();

  // Headline callout + freshness + side-by-side comparison.
  renderTopIssue(data.top_issue);
  renderLastUpdated(data.last_updated);
  renderComparison(data.by_platform_category || {});

  // By category (sorted desc by count), each bar in its category colour.
  const catEntries = Object.entries(data.by_category || {}).sort((a, b) => b[1] - a[1]);
  renderBarList(els.byCategory, catEntries, categoryColor);

  // Executive summary narrative (auto-generated from the same data).
  renderExecutiveSummary(data, catEntries);

  // Populate category dropdown from categories actually present.
  populateCategoryOptions(catEntries.map(([cat]) => cat));
}

// Join ["a","b","c"] -> "a, b and c".
function humanList(arr) {
  if (!arr.length) return '';
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
}

// Headline banner: "Most common issue right now".
function renderTopIssue(topIssue) {
  if (!els.topIssue) return;
  if (!topIssue || !topIssue.category) {
    els.topIssue.hidden = true;
    return;
  }
  const cat = escapeHtml(labelize(topIssue.category));
  const reports = `${topIssue.count} ${topIssue.count === 1 ? 'report' : 'reports'}`;
  const when =
    topIssue.scope === 'month' && topIssue.month
      ? `in ${escapeHtml(formatMonth(topIssue.month))}`
      : 'across all feedback';
  els.topIssue.innerHTML =
    `<span class="top-issue-icon" aria-hidden="true">⚠</span>` +
    `<span class="top-issue-text">Most common issue right now: ` +
    `<strong>${cat}</strong> — ${reports} ${when}.</span>`;
  els.topIssue.hidden = false;
}

// Freshness line under the executive summary.
function renderLastUpdated(iso) {
  if (!els.lastUpdated) return;
  const when = formatTimestamp(iso);
  els.lastUpdated.textContent = when ? `Data last updated ${when}.` : '';
}

// Side-by-side category comparison across providers.
function renderComparison(byPlatformCategory) {
  if (!els.comparison) return;
  const providers = Object.keys(byPlatformCategory);
  if (!providers.length) {
    els.comparison.innerHTML = '<p class="cmp-empty">No comparison data.</p>';
    return;
  }

  // Union of categories, sorted by combined total (most contested first).
  const totals = {};
  for (const p of providers) {
    for (const [cat, n] of Object.entries(byPlatformCategory[p])) {
      totals[cat] = (totals[cat] || 0) + n;
    }
  }
  const categories = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const max = Math.max(...Object.values(totals), 1);

  // The first column is the category label; each provider gets an equal share.
  const gridStyle = `grid-template-columns:130px repeat(${providers.length}, 1fr)`;

  const head =
    `<div class="cmp-row cmp-head" style="${gridStyle}">` +
    `<span class="cmp-cat">Category</span>` +
    providers
      .map(
        (p, i) =>
          `<span class="cmp-prov"><span class="cmp-swatch" style="background:${PLATFORM_COLORS[i % PLATFORM_COLORS.length]}"></span>${escapeHtml(p)}</span>`,
      )
      .join('') +
    `</div>`;

  const rows = categories
    .map((cat) => {
      const cells = providers
        .map((p, i) => {
          const n = byPlatformCategory[p][cat] || 0;
          const pct = Math.round((n / max) * 100);
          const color = PLATFORM_COLORS[i % PLATFORM_COLORS.length];
          return (
            `<span class="cmp-cell">` +
            `<span class="cmp-track"><span class="cmp-fill" style="width:${pct}%;background:${color}"></span></span>` +
            `<span class="cmp-num">${n}</span></span>`
          );
        })
        .join('');
      return `<div class="cmp-row" style="${gridStyle}"><span class="cmp-cat" title="${escapeHtml(labelize(cat))}">${escapeHtml(labelize(cat))}</span>${cells}</div>`;
    })
    .join('');

  els.comparison.innerHTML = head + rows;
}

function renderExecutiveSummary(data, catEntries) {
  if (!els.execSummary) return;

  const total = data.total ?? 0;
  const platforms = Object.entries(data.by_platform || {});
  const byType = data.by_feedback_type || {};
  const complaints = byType.complaint || 0;
  const questions = byType.question || 0;
  const features = byType.feature_request || 0;
  const positives = byType.positive || 0;

  const platformText =
    humanList(platforms.map(([n, c]) => `${escapeHtml(n)} (${c})`)) || 'the tracked providers';
  const complaintPct = total ? Math.round((complaints / total) * 100) : 0;
  const topCats = (catEntries || []).slice(0, 3).map(([c]) => escapeHtml(labelize(c)));
  const topCatText = humanList(topCats);

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const lead =
    `This dashboard monitors <strong>${total}</strong> public developer-feedback ` +
    `items about ${platformText}, gathered from Hacker News, GitHub issues and ` +
    `the providers' official status pages.`;

  const complaintLine =
    `<strong>${complaints}</strong> of them (${complaintPct}%) are complaints` +
    (topCatText ? `, most often about <strong>${topCatText}</strong>.` : '.');

  const mixLine =
    `The rest is made up of ${plural(questions, 'question')}, ` +
    `${plural(features, 'feature request')} and ${plural(positives, 'positive mention')}.`;

  const freshness =
    `Data refreshes automatically every day from public posts; machine-collected ` +
    `items are flagged “unverified” until a human reviews them.`;

  els.execSummary.innerHTML =
    `<p>${lead} ${complaintLine}</p>` +
    `<p>${mixLine} ${freshness}</p>`;
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

  const autoBadge = item.auto_collected
    ? '<span class="badge badge-auto" title="Collected automatically from Hacker News and GitHub; not yet human-reviewed">⚙ Auto · unverified</span>'
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
          ${autoBadge}
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

// Download the currently filtered feedback as a JSON file.
async function exportJson() {
  try {
    const data = await fetchJson(`/api/feedback${buildQueryString()}`);
    const blob = new Blob([JSON.stringify(data.items || [], null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'developer-feedback.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
  }
}

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

  // Toggle the trends-over-time breakdown (provider vs. category) without refetch.
  if (els.trendBreakdown) {
    els.trendBreakdown.addEventListener('change', renderBreakdownTrend);
  }

  // Exports respect the active filters via the same query string.
  if (els.exportCsv) {
    els.exportCsv.addEventListener('click', () => {
      window.location.href = `/api/feedback.csv${buildQueryString()}`;
    });
  }
  if (els.exportJson) {
    els.exportJson.addEventListener('click', exportJson);
  }

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
