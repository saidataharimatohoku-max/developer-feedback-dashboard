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
  neutral: 'Neutral',
  positive: 'Positive',
};

// Chart labels (per spec: "positive" is shown as "Praise" in the type chart).
const FEEDBACK_TYPE_CHART_LABELS = {
  complaint: 'Complaint',
  question: 'Question',
  feature_request: 'Feature Request',
  neutral: 'Neutral',
  positive: 'Praise',
};
const FEEDBACK_TYPE_ORDER = ['complaint', 'question', 'feature_request', 'neutral', 'positive'];
const FEEDBACK_TYPE_COLORS = {
  complaint: '#ef4444',
  question: '#3b82f6',
  feature_request: '#a855f7',
  neutral: '#64748b',
  positive: '#22c55e',
};

// Sentiment series shown in the "Sentiment over time" chart (stacked).
const SENTIMENT_SERIES = [
  { key: 'negative', label: 'Negative', color: '#ef4444' },
  { key: 'mixed', label: 'Mixed', color: '#f59e0b' },
  { key: 'neutral', label: 'Neutral', color: '#64748b' },
  { key: 'positive', label: 'Positive', color: '#22c55e' },
];
const PLATFORM_COLORS = ['#6c8cff', '#f59e0b', '#22c55e', '#a855f7', '#06b6d4', '#ef4444', '#ec4899'];

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
  chartType: document.getElementById('chart-type'),
  chartTypeCategory: document.getElementById('chart-type-category'),
  tcType: document.getElementById('tc-type'),
  chartTrend: document.getElementById('chart-trend'),
  chartSentiment: document.getElementById('chart-sentiment'),
  chartBreakdown: document.getElementById('chart-breakdown'),
  trendBreakdown: document.getElementById('trend-breakdown'),
  trendBreakdownCaption: document.getElementById('trend-breakdown-caption'),
  trendInsightBreakdown: document.getElementById('trend-insight-breakdown'),
  comparison: document.getElementById('comparison-table'),
  latencyChart: document.getElementById('chart-latency'),
  latencyCalloutText: document.getElementById('latency-callout-text'),
  latencyCalloutTitle: document.getElementById('latency-callout-title'),
  latencyFigLabel: document.getElementById('latency-fig-label'),
  latencyFigNote: document.getElementById('latency-fig-note'),
  byCategory: document.getElementById('by-category'),
  aksChartCategory: document.getElementById('aks-chart-category'),
  aksChartTrend: document.getElementById('aks-chart-trend'),
  aksChartSpike: document.getElementById('aks-chart-spike'),
  aksChartImpact: document.getElementById('aks-chart-impact'),
  aksSpikeMonth: document.getElementById('aks-spike-month'),
  aksSpikeCaption: document.getElementById('aks-spike-caption'),
  aksImpactCaption: document.getElementById('aks-impact-caption'),
  ddName: document.getElementById('dd-name'),
  ddIntro: document.getElementById('dd-intro'),
  ddCatCaption: document.getElementById('dd-cat-caption'),
  ddTrendCaption: document.getElementById('dd-trend-caption'),
  ddFootnote: document.getElementById('dd-footnote'),
  chartSource: document.getElementById('chart-source'),
  sourcesTable: document.getElementById('sources-table'),
  form: document.getElementById('filter-form'),
  platform: document.getElementById('filter-platform'),
  feedbackType: document.getElementById('filter-feedback-type'),
  category: document.getElementById('filter-category'),
  source: document.getElementById('filter-source'),
  sentiment: document.getElementById('filter-sentiment'),
  verified: document.getElementById('filter-verified'),
  dateFrom: document.getElementById('filter-date-from'),
  dateTo: document.getElementById('filter-date-to'),
  q: document.getElementById('filter-q'),
  reset: document.getElementById('reset-filters'),
  exportCsv: document.getElementById('export-csv'),
  exportJson: document.getElementById('export-json'),
  cardGrid: document.getElementById('card-grid'),
  emptyState: document.getElementById('empty-state'),
  resultCount: document.getElementById('result-count'),
  loadMore: document.getElementById('load-more'),
  healthCards: document.getElementById('health-cards'),
  fvFigure: document.getElementById('fv-figure'),
  fvEmpty: document.getElementById('fv-empty'),
  fvChart: document.getElementById('fv-chart'),
  fvCaption: document.getElementById('fv-caption'),
  fvStats: document.getElementById('fv-stats'),
};

// Per-provider concern score/level, populated by renderHealthSection and reused
// by the filtered-view stats panel.
let healthByProvider = {};

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
// labelColor(label) (optional) colours the swatch, label text, and bar fill so
// each bar matches the category written beside it.
function renderBarList(target, entries, labelColor) {
  if (!entries.length) {
    target.innerHTML = '<li class="bar-row"><span class="bar-label">No data</span></li>';
    return;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  target.innerHTML = entries
    .map(([label, count]) => {
      const pct = Math.round((count / max) * 100);
      const color = labelColor ? labelColor(label) : null;
      const fillStyle = color ? `width:${pct}%;background:${color}` : `width:${pct}%`;
      const swatch = color
        ? `<span class="bar-swatch" style="background:${color}"></span>`
        : '';
      const labelStyle = color ? ` style="color:${color}"` : '';
      return `
        <li class="bar-row">
          <span class="bar-label" title="${escapeHtml(label)}"${labelStyle}>${swatch}${escapeHtml(labelize(label))}</span>
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

// Axis titles: x along the bottom centre, y rotated up the left edge.
function axisTitlesSvg({ H, padL, padT, plotW, plotH, xLabel, yLabel }) {
  const yMid = padT + plotH / 2;
  const xMid = padL + plotW / 2;
  return `
      <text transform="rotate(-90 12 ${yMid.toFixed(1)})" x="12" y="${yMid.toFixed(1)}" class="chart-axis-title" text-anchor="middle">${escapeHtml(yLabel)}</text>
      <text x="${xMid.toFixed(1)}" y="${(H - 5).toFixed(1)}" class="chart-axis-title" text-anchor="middle">${escapeHtml(xLabel)}</text>`;
}

// Vertical bar chart. entries: [[label, count], ...]; colors: array or map by key.
function renderBarChart(target, entries, colorFor, xLabel = 'Category', yLabel = 'Number of posts', opts = {}) {
  if (!entries.length) return emptyChart(target);

  const W = opts.wide ? 720 : 360;
  const H = 244;
  const padL = 48;
  const padR = 12;
  const padT = 18;
  const padB = 62;
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
      ${axisTitlesSvg({ H, padL, padT, plotW, plotH, xLabel, yLabel })}
    </svg>
    ${opts.showLegend === false ? '' : legendHtml(entries.map(([label, count], i) => ({ label, count, color: colorFor(label, i) })))}`;
}

// Simple line + area trend chart. points: [{ label, count }, ...] (ascending).
// opts: { xLabel, yLabel, legendLabel, xTickMode: 'year' | 'all' }.
function renderTrendChart(target, points, opts = {}) {
  if (!points.length) return emptyChart(target);

  const xLabel = opts.xLabel || 'Month (labelled by year)';
  const yLabel = opts.yLabel || 'Posts per month';
  const legendLabel = opts.legendLabel || 'Feedback items per month';
  const xTickMode = opts.xTickMode || 'year';

  const W = 740;
  const H = 244;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 60;
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
      // X-axis labelling. Default 'year' mode labels only at year boundaries so
      // month timelines never overlap; 'all' mode labels every point (used for
      // the per-day spike chart, which has few points).
      let tickText = '';
      if (xTickMode === 'all') {
        tickText = String(p.label);
      } else {
        const year = String(p.label).slice(0, 4);
        const prevYear = i > 0 ? String(points[i - 1].label).slice(0, 4) : null;
        if (year !== prevYear) tickText = year;
      }
      const tick = tickText
        ? `<text x="${x.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" class="chart-axis" text-anchor="middle">${escapeHtml(tickText)}</text>`
        : '';
      return `
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="chart-dot">
          <title>${escapeHtml(p.title || p.label)}: ${p.count}</title>
        </circle>
        <text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" class="chart-value" text-anchor="middle">${p.count}</text>
        ${tick}`;
    })
    .join('');

  target.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-baseline" />
      <path d="${area}" class="chart-area" />
      <path d="${line}" class="chart-line" />
      ${dots}
      ${axisTitlesSvg({ H, padL, padT, plotW, plotH, xLabel, yLabel })}
    </svg>
    ${legendHtml([{ label: legendLabel, count: total, color: 'var(--accent)' }])}`;
}

// Stacked vertical bar chart of sentiment per month.
// rows: [{ month, negative, neutral, mixed, positive }, ...] (ascending).
function renderSentimentChart(target, rows) {
  if (!rows.length) return emptyChart(target);

  // Only show series that actually occur in the data.
  const series = SENTIMENT_SERIES.filter((s) => rows.some((r) => (r[s.key] || 0) > 0));
  if (!series.length) return emptyChart(target);

  const W = 740;
  const H = 262;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 60;
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
      // Only label the first bar of each year so the axis ticks (years) never
      // overlap, no matter how many months are shown.
      const year = String(r.month).slice(0, 4);
      const prevYear = i > 0 ? String(rows[i - 1].month).slice(0, 4) : null;
      const yearLabel =
        year !== prevYear
          ? `<text x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" class="chart-axis" text-anchor="middle">${escapeHtml(year)}</text>`
          : '';
      return `${segs}
        <text x="${cx.toFixed(1)}" y="${(topY - 6).toFixed(1)}" class="chart-value" text-anchor="middle">${total}</text>
        ${yearLabel}`;
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
      ${axisTitlesSvg({ H, padL, padT, plotW, plotH, xLabel: 'Month (labelled by year)', yLabel: 'Posts per month' })}
    </svg>
    ${legendHtml(legendItems)}`;
}

// Three small ranked panels — one per feedback type (complaint / question /
// feature request) — each listing what those posts are about, most common
// category first. Far easier to read than one stacked bar with 9 colours.
// crossTab: { type: { category: n } }.
// Cross-tab of feedback type -> category counts, kept for the dropdown handler.
let lastTypeCat = {};

// Single bar chart: the category breakdown for the feedback type chosen in the
// "Feedback type" dropdown (mirrors the "Feedback by category" pattern).
function renderTypeCategorySingle() {
  if (!els.chartTypeCategory) return;
  const type = els.tcType ? els.tcType.value : 'complaint';
  const counts = lastTypeCat[type] || {};
  const entries = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    emptyChart(els.chartTypeCategory);
    return;
  }
  const color = {};
  const barEntries = entries.map(([cat, n]) => {
    const l = labelize(cat);
    color[l] = categoryColor(cat);
    return [l, n];
  });
  renderBarChart(els.chartTypeCategory, barEntries, (l) => color[l] || 'var(--accent)', 'Category', 'Posts');
}

function renderTypeByCategoryChart(target, crossTab) {
  if (!target) return;
  const TYPES = ['complaint', 'question', 'feature_request'];
  const cols = TYPES.filter((t) => crossTab[t] && Object.keys(crossTab[t]).length);
  if (!cols.length) return emptyChart(target);

  const TOP_N = 5;

  const panels = cols
    .map((t) => {
      const entries = Object.entries(crossTab[t])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((s, [, n]) => s + n, 0);
      const max = entries.length ? entries[0][1] : 1;
      const top = entries.slice(0, TOP_N);
      const rest = entries.slice(TOP_N);
      const restCount = rest.reduce((s, [, n]) => s + n, 0);

      const rows = top
        .map(([cat, n]) => {
          const pct = Math.round((n / max) * 100);
          const color = categoryColor(cat);
          return `
            <li class="bar-row">
              <span class="bar-label" title="${escapeHtml(labelize(cat))}">
                <span class="bar-swatch" style="background:${color}"></span>${escapeHtml(labelize(cat))}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span>
              <span class="bar-count">${n}</span>
            </li>`;
        })
        .join('');

      const restRow = rest.length
        ? `<li class="bar-row bar-row-rest">
             <span class="bar-label">+ ${rest.length} smaller ${rest.length === 1 ? 'category' : 'categories'}</span>
             <span class="bar-track"></span>
             <span class="bar-count">${restCount}</span>
           </li>`
        : '';

      const typeLabel = FEEDBACK_TYPE_CHART_LABELS[t] || labelize(t);
      const lead = entries.length ? labelize(entries[0][0]) : '—';
      return `
        <section class="type-cat-panel">
          <header class="type-cat-head">
            <h4>${escapeHtml(typeLabel)}</h4>
            <span class="type-cat-total">${total}</span>
          </header>
          <ul class="bar-list bar-list-compact">${rows}${restRow}</ul>
          <p class="type-cat-foot">Mostly about <strong>${escapeHtml(lead)}</strong></p>
        </section>`;
    })
    .join('');

  target.innerHTML = `<div class="type-cat-grid">${panels}</div>`;
}

// Multi-line trend chart: one line per series over a shared month axis.
// months: ["2026-01", ...] (ascending); series: [{ label, counts:[...], color }].
function renderMultiLineChart(target, months, series) {
  if (!months.length || !series.length) return emptyChart(target);

  const W = 740;
  const H = 282;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 60;
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
      ${axisTitlesSvg({ H, padL, padT, plotW, plotH, xLabel: 'Month', yLabel: 'Posts per month' })}
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

  // For the provider breakdown, order the lines so the highest total comes
  // first (categories keep their existing order / colour mapping).
  const orderedRaw =
    dim === 'category'
      ? rawSeries
      : [...rawSeries].sort(
          (a, b) =>
            (b.counts || []).reduce((sum, n) => sum + n, 0) -
            (a.counts || []).reduce((sum, n) => sum + n, 0),
        );

  const series = orderedRaw.map((s, i) => ({
    label: dim === 'category' ? labelize(s.key) : s.key,
    counts: s.counts,
    color: dim === 'category' ? categoryColor(s.key) : palette[i % palette.length],
  }));

  if (els.trendBreakdownCaption) {
    els.trendBreakdownCaption.textContent =
      dim === 'category' ? 'Feedback per month by category' : 'Feedback per month by provider';
  }

  // Insight banner for this section, adapting to the current breakdown dimension.
  if (els.trendInsightBreakdown) {
    const html = buildTrendInsightHtml(data, dim);
    if (html) {
      els.trendInsightBreakdown.innerHTML = html;
      els.trendInsightBreakdown.hidden = false;
    } else {
      els.trendInsightBreakdown.hidden = true;
    }
  }

  renderMultiLineChart(els.chartBreakdown, months, series);
}

// ---------------------------------------------------------------------------
// Top-provider deep-dive section: category chart, monthly trend, spike reason +
// impact. Targets whichever provider currently has the most collected feedback.
// ---------------------------------------------------------------------------
const AKS_NAME = 'Azure Kubernetes Service';

// Provider display name → API/filter slug (e.g. "Azure Kubernetes Service" →
// "azure-kubernetes-service", "OpenAI" → "openai").
function providerSlug(name) {
  return String(name).toLowerCase().replace(/\s+/g, '-');
}

async function renderAksSection(data) {
  if (!els.aksChartCategory) return;

  // Pick the provider with the most collected feedback right now.
  const byPlatform = data.by_platform || {};
  const ranked = Object.entries(byPlatform).sort((a, b) => b[1] - a[1]);
  const NAME = ranked.length ? ranked[0][0] : AKS_NAME;
  const slug = providerSlug(NAME);

  // Fill the dynamic labels/headings for the chosen provider.
  if (els.ddName) els.ddName.textContent = NAME;
  if (els.ddIntro) {
    els.ddIntro.textContent =
      `A focused look at ${NAME} — the provider with the most collected feedback ` +
      `right now — covering what developers raise, when the recent data spiked, ` +
      `and what it means for the business.`;
  }
  if (els.ddCatCaption) els.ddCatCaption.textContent = `${NAME} issues by category`;
  if (els.ddTrendCaption) els.ddTrendCaption.textContent = `${NAME} feedback per month`;

  // Category breakdown for the provider (from the per-provider category map).
  const catObj = (data.by_platform_category || {})[NAME] || {};
  const catEntries = Object.entries(catObj).sort((a, b) => b[1] - a[1]);
  if (catEntries.length) {
    renderBarChart(els.aksChartCategory, catEntries, categoryColor, 'Issue category', 'Number of posts');
  } else {
    emptyChart(els.aksChartCategory);
  }

  // Monthly trend for the provider (from the per-provider monthly timeline).
  const tp = data.trend_by_platform_month || {};
  const months = tp.months || [];
  const provSeries = (tp.series || []).find((s) => s.key === NAME);
  const points = provSeries ? months.map((m, i) => ({ label: m, count: provSeries.counts[i] || 0 })) : [];
  if (points.length) renderTrendChart(els.aksChartTrend, points);
  else emptyChart(els.aksChartTrend);

  // Pull raw items for this provider to ground the "why" and "impact" narratives.
  let items = [];
  try {
    const res = await fetchJson(`/api/feedback?platform=${encodeURIComponent(slug)}`);
    items = res.items || [];
  } catch (err) {
    items = [];
  }
  const total = items.length;

  // Spike month = the highest month on the trend.
  let spikeIdx = -1;
  let spikeCount = -1;
  points.forEach((p, i) => {
    if (p.count > spikeCount) {
      spikeCount = p.count;
      spikeIdx = i;
    }
  });
  const spike = spikeIdx >= 0 ? points[spikeIdx] : null;
  const prevPoint = spikeIdx > 0 ? points[spikeIdx - 1] : null;

  // ---- "Why the spike?" as a chart: posts per day during the peak month ----
  if (els.aksChartSpike) {
    if (!spike || !total) {
      emptyChart(els.aksChartSpike);
      if (els.aksSpikeCaption) els.aksSpikeCaption.textContent = '';
      if (els.aksSpikeMonth) els.aksSpikeMonth.textContent = 'the peak month';
    } else {
      const monthLabel = formatMonth(spike.label) || spike.label;
      if (els.aksSpikeMonth) els.aksSpikeMonth.textContent = monthLabel;

      const spikeItems = items.filter((i) => (i.date || '').startsWith(spike.label));
      const byDay = {};
      spikeItems.forEach((i) => {
        const day = i.date && i.date.length >= 10 ? i.date.slice(8, 10) : '??';
        byDay[day] = (byDay[day] || 0) + 1;
      });
      const dayEntries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
      const days = dayEntries.length;
      const busiest = dayEntries.reduce((m, [, c]) => Math.max(m, c), 0);

      // Dominant source of the spike month (generic, not hard-coded to GitHub).
      const srcCount = {};
      spikeItems.forEach((i) => {
        const s = i.source || 'unknown';
        srcCount[s] = (srcCount[s] || 0) + 1;
      });
      const topSrcEntry = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0];
      const topSrcKey = topSrcEntry ? topSrcEntry[0] : '';
      const topSrcLabel = (SOURCE_META[topSrcKey] && SOURCE_META[topSrcKey].label) || topSrcKey || 'various sources';
      const topSrcShare =
        topSrcEntry && spikeItems.length ? Math.round((topSrcEntry[1] / spikeItems.length) * 100) : 0;

      const dayPoints = dayEntries.map(([day, count]) => ({
        label: String(Number(day)),
        count,
        title: `${spike.label}-${day}`,
      }));
      renderTrendChart(els.aksChartSpike, dayPoints, {
        xLabel: `Day of ${monthLabel}`,
        yLabel: 'Posts',
        legendLabel: `Posts per day in ${monthLabel}`,
        xTickMode: 'all',
      });

      if (els.aksSpikeCaption) {
        const monthDays = new Date(
          Number(spike.label.slice(0, 4)),
          Number(spike.label.slice(5, 7)),
          0,
        ).getDate();
        els.aksSpikeCaption.innerHTML =
          `<strong>How to read this:</strong> a real outage would show a tall peak on ` +
          `one or two incident days. Instead ${monthLabel}'s ${spike.count} posts are ` +
          `spread across <strong>${days} of the month's ${monthDays} days</strong>, with no ` +
          `day above <strong>${busiest}</strong>. <strong>${topSrcShare}%</strong> came from ` +
          `${escapeHtml(topSrcLabel)} and all are auto-collected and unverified — so the spike ` +
          `largely reflects <strong>when the data was collected, not necessarily a surge in ` +
          `real-world failures.</strong>`;
      }
    }
  }

  // ---- "Business impact" as a chart: posts grouped into impact areas ----
  if (els.aksChartImpact) {
    const IMPACT_BUCKETS = [
      ['Reliability', ['downtime'], '#ef4444'],
      ['Performance', ['latency'], '#f59e0b'],
      ['Operations & support', ['support', 'docs'], '#3b82f6'],
      ['Cost & billing', ['pricing', 'billing'], '#10b981'],
      ['Compatibility & limits', ['api_change', 'rate_limits'], '#8b5cf6'],
    ];
    const impactColors = {};
    const impactEntries = [];
    IMPACT_BUCKETS.forEach(([name, cats, color]) => {
      const c = cats.reduce((sum, cat) => sum + (catObj[cat] || 0), 0);
      if (c > 0) {
        impactEntries.push([name, c]);
        impactColors[name] = color;
      }
    });
    impactEntries.sort((a, b) => b[1] - a[1]);

    if (impactEntries.length) {
      renderBarChart(
        els.aksChartImpact,
        impactEntries,
        (label) => impactColors[label] || '#94a3b8',
        'Business impact area',
        'Number of posts',
        { showLegend: true },
      );
      if (els.aksImpactCaption) {
        const topArea = impactEntries[0][0];
        els.aksImpactCaption.textContent =
          `Most ${NAME} feedback maps to "${topArea}". Use this to prioritise themes — ` +
          `volume is collection-weighted, so it is not an absolute risk measure.`;
      }
    } else {
      emptyChart(els.aksChartImpact);
      if (els.aksImpactCaption) els.aksImpactCaption.textContent = '';
    }
  }
}

// ---------------------------------------------------------------------------
// Data sources section: how many items came from each public source.
// ---------------------------------------------------------------------------
const SOURCE_META = {
  github: { label: 'GitHub issues', color: '#6e5494' },
  stackoverflow: { label: 'Stack Overflow', color: '#f48024' },
  serverfault: { label: 'Server Fault', color: '#10a3a3' },
  'devops-stackexchange': { label: 'DevOps Stack Exchange', color: '#2b6cb0' },
  hackernews: { label: 'Hacker News', color: '#ff6600' },
  reddit: { label: 'Reddit', color: '#ff4500' },
  status_page: { label: 'Official status page', color: '#16a34a' },
  statuspage: { label: 'Official status page', color: '#16a34a' },
  discourse: { label: 'Community forum', color: '#0ea5e9' },
  devto: { label: 'DEV Community', color: '#a78bfa' },
  'ai-stackexchange': { label: 'AI Stack Exchange', color: '#0aa4a4' },
  superuser: { label: 'Super User', color: '#3b82f6' },
  bluesky: { label: 'Bluesky', color: '#1185fe' },
};

function sourceLabel(key) {
  return (SOURCE_META[key] && SOURCE_META[key].label) || labelize(key);
}

function sourceColor(key) {
  return (SOURCE_META[key] && SOURCE_META[key].color) || '#64748b';
}

function renderSourcesSection(data) {
  if (!els.chartSource) return;
  const entries = Object.entries(data.by_source || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    emptyChart(els.chartSource);
    if (els.sourcesTable) els.sourcesTable.innerHTML = '';
    return;
  }

  const labelled = entries.map(([key, count]) => [sourceLabel(key), count, key]);
  renderBarChart(
    els.chartSource,
    labelled.map(([label, count]) => [label, count]),
    (label) => {
      const found = labelled.find(([l]) => l === label);
      return found ? sourceColor(found[2]) : '#64748b';
    },
    'Source',
    'Items collected',
    { showLegend: false, wide: true },
  );

  if (els.sourcesTable) {
    const total = entries.reduce((sum, [, c]) => sum + c, 0);
    const rows = entries
      .map(([key, count]) => {
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `<tr>
          <td><span class="source-dot" style="background:${sourceColor(key)}"></span>${escapeHtml(sourceLabel(key))}</td>
          <td class="source-count">${count}</td>
          <td class="source-pct">${pct}%</td>
        </tr>`;
      })
      .join('');
    els.sourcesTable.innerHTML = `
      <table>
        <thead><tr><th>Source</th><th>Items</th><th>Share</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="source-count">${total}</td><td class="source-pct">100%</td></tr></tfoot>
      </table>`;
  }
}

async function loadSummary() {
  let data;
  try {
    data = await fetchJson('/api/summary');
  } catch (err) {
    els.statCards.innerHTML = `<div class="stat-card"><span class="stat-label">Failed to load summary</span></div>`;
    emptyChart(els.chartType);
    emptyChart(els.chartTrend);
    emptyChart(els.chartSentiment);
    if (els.chartBreakdown) emptyChart(els.chartBreakdown);
    console.error(err);
    return;
  }

  // Stat cards: total + per-platform counts (highest first).
  const sortedPlatforms = Object.entries(data.by_platform || {}).sort((a, b) => b[1] - a[1]);
  const platformCards = sortedPlatforms
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

  // Chart: feedback by type (canonical order; hide types with no items).
  const byType = data.by_feedback_type || {};
  const typeKeys = [
    ...FEEDBACK_TYPE_ORDER.filter((k) => k in byType),
    ...Object.keys(byType).filter((k) => !FEEDBACK_TYPE_ORDER.includes(k)),
  ].filter((k) => (byType[k] || 0) > 0);
  const typeEntries = typeKeys.map((k) => [FEEDBACK_TYPE_CHART_LABELS[k] || labelize(k), byType[k]]);
  const typeColorByKey = {};
  typeKeys.forEach((k) => {
    typeColorByKey[FEEDBACK_TYPE_CHART_LABELS[k] || labelize(k)] = FEEDBACK_TYPE_COLORS[k] || '#6c8cff';
  });
  renderBarChart(els.chartType, typeEntries, (label) => typeColorByKey[label] || '#6c8cff', 'Feedback type', 'Number of posts');

  // Chart: each feedback type (complaint / question / feature request) split by category.
  // Chart: the selected feedback type split by category (dropdown-driven).
  lastTypeCat = data.by_feedback_type_category || {};
  renderTypeCategorySingle();

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

  // Latency callout + per-provider comparison (latency is the universal pain).
  renderLatencyByProvider(data);

  // AKS deep-dive (charts + spike reason + business impact).
  renderAksSection(data);

  // Data sources breakdown (very bottom of the page).
  renderSourcesSection(data);

  // By category (sorted desc by count), each slice in its category colour.
  const catEntries = Object.entries(data.by_category || {}).sort((a, b) => b[1] - a[1]);
  renderPieChart(els.byCategory, catEntries, categoryColor);

  // Executive summary narrative (auto-generated from the same data).
  renderExecutiveSummary(data, catEntries);

  // Populate category + source dropdowns from what's actually present.
  populateCategoryOptions(catEntries.map(([cat]) => cat));
  populateSourceOptions(Object.keys(data.by_source || {}));

  // Provider health (concern index + spike callouts).
  renderHealthSection(data);
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

// Explains the latest spike in the monthly trend: which month is highest, what
// is driving it (provider or category, per `dim`), and why the newest point
// should be read with care (recency + the in-progress current month inflate it).
// Returns an HTML string, or null when the newest month isn't a genuine spike.
function buildTrendInsightHtml(data, dim = 'platform') {
  const trend = (data.trend_by_month || []).filter((t) => t && t.month);
  if (trend.length < 2) return null;

  const latest = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  // Only surface a callout when the newest month is a genuine jump.
  const isSpike = latest.count >= prev.count + 5 && latest.count >= prev.count * 1.3;
  if (!isSpike) return null;

  // What drives the latest month? Top series at the last month index, using the
  // provider or category breakdown depending on `dim`.
  const source = dim === 'category' ? data.trend_by_category_month : data.trend_by_platform_month;
  let driver = null;
  if (source && Array.isArray(source.series) && source.months && source.months.length) {
    const last = source.months.length - 1;
    for (const s of source.series) {
      const c = (s.counts && s.counts[last]) || 0;
      if (!driver || c > driver.count) driver = { name: s.key, count: c };
    }
  }
  const driverPct = driver && latest.count ? Math.round((driver.count / latest.count) * 100) : 0;

  // Is the highest month the current, still-in-progress calendar month?
  const nowMonth = new Date().toISOString().slice(0, 7);
  const partial = latest.month === nowMonth;

  const monthLabel = escapeHtml(formatMonth(latest.month)) || escapeHtml(latest.month);
  const driverName = dim === 'category' ? labelize(driver ? driver.name : '') : driver && driver.name;
  const driverTail =
    dim === 'category' ? 'category' : '';
  const driverText =
    driver && driver.count > 0
      ? ` Most of the increase comes from <strong>${escapeHtml(driverName)}</strong>${driverTail ? ` ${driverTail}` : ''} ` +
        `(${driver.count} of ${latest.count}, ${driverPct}%), largely newly collected ` +
        `public-forum posts (mostly GitHub issues) rather than a single incident.`
      : '';
  const partialText = partial
    ? ` Note that ${monthLabel} is still in progress and the newest posts are ` +
      `over-represented, so treat the latest point as provisional.`
    : ` Newly collected posts skew toward the most recent months, so read the latest point as provisional.`;

  return (
    `<span class="insight-icon" aria-hidden="true">📈</span>` +
    `<span class="insight-text"><strong>Why feedback peaks in ${monthLabel}:</strong> ` +
    `the latest month (<strong>${latest.count}</strong>) is up from ${prev.count} the month before.` +
    `${driverText}${partialText}</span>`
  );
}

// Provider health: a heuristic "concern index" per provider plus a recent-spike
// marker. Combines total feedback volume, the share that is verified downtime,
// and recent-month momentum — all relative across the providers shown. It is a
// comparison aid, not an official reliability rating.
function renderHealthSection(data) {
  if (!els.healthCards) return;
  const byP = data.by_platform || {};
  const byPC = data.by_platform_category || {};
  const byPT = data.by_platform_type || {};
  const trend = data.trend_by_platform_month || { months: [], series: [] };
  const seriesByName = {};
  (trend.series || []).forEach((s) => {
    seriesByName[s.key] = s.counts || [];
  });

  const providers = Object.keys(byP);
  if (!providers.length) {
    els.healthCards.innerHTML = '';
    return;
  }

  // Gather raw factors per provider.
  const rows = providers.map((name) => {
    const volume = byP[name] || 0;
    const complaints = (byPT[name] && byPT[name].complaint) || 0;
    // Complaint rate = share of THIS provider's own feedback that is a complaint.
    // Being a ratio, it is not skewed by how much data we happened to collect.
    const complaintRate = volume ? complaints / volume : 0;
    const downtime = (byPC[name] && byPC[name].downtime) || 0;
    const counts = seriesByName[name] || [];
    const recent = counts.length ? counts[counts.length - 1] : 0;
    const prior = counts.slice(-4, -1); // up to 3 months before the last
    const trailingAvg = prior.length ? prior.reduce((s, n) => s + n, 0) / prior.length : 0;
    const spike = trailingAvg > 0 && recent >= 1.5 * trailingAvg && recent >= 3;
    const spikeMonth = spike && trend.months.length ? trend.months[trend.months.length - 1] : null;
    return { name, volume, complaints, complaintRate, downtime, recent, spike, spikeMonth };
  });

  const maxRecent = Math.max(1, ...rows.map((r) => r.recent));

  rows.forEach((r) => {
    // Fair concern index: driven by the complaint RATE (proportion of this
    // provider's feedback that is a complaint) rather than raw volume, so a
    // provider does not look worse simply because more of its posts were
    // collected. Downtime share and recent momentum round it out.
    const downShare = r.volume ? r.downtime / r.volume : 0;
    const recentNorm = r.recent / maxRecent;
    r.concern = Math.round(100 * (0.5 * r.complaintRate + 0.3 * downShare + 0.2 * recentNorm));
    r.level = r.concern >= 66 ? 'high' : r.concern >= 33 ? 'medium' : 'low';
  });

  rows.sort((a, b) => b.concern - a.concern);

  // Expose per-provider concern/level so the filtered-view stats panel can reuse it.
  healthByProvider = {};
  rows.forEach((r) => {
    healthByProvider[r.name] = { concern: r.concern, level: r.level, spike: r.spike };
  });

  const levelLabel = { high: 'High concern', medium: 'Medium concern', low: 'Low concern' };
  els.healthCards.innerHTML = rows
    .map((r) => {
      const spikeHtml = r.spike
        ? `<span class="health-spike" title="Recent spike vs. trailing average">▲ spike${r.spikeMonth ? ' · ' + escapeHtml(formatMonth(r.spikeMonth)) : ''}</span>`
        : '';
      return `
      <div class="health-card health-${r.level}">
        <div class="health-top">
          <span class="provider-name">${escapeHtml(r.name)}</span>
          <span class="health-badge health-badge-${r.level}">${levelLabel[r.level]}</span>
        </div>
        <div class="health-score">${r.concern}<span class="health-score-max">/100</span></div>
        <div class="health-meta">${r.volume} items · ${Math.round(r.complaintRate * 100)}% complaints · ${r.downtime} downtime ${spikeHtml}</div>
      </div>`;
    })
    .join('');
}

// Side-by-side category comparison across providers.
function renderComparison(byPlatformCategory) {
  if (!els.comparison) return;
  // Order providers by their total feedback volume (highest first, lowest last).
  const providers = Object.keys(byPlatformCategory).sort((a, b) => {
    const sum = (p) => Object.values(byPlatformCategory[p] || {}).reduce((s, n) => s + n, 0);
    return sum(b) - sum(a);
  });
  if (!providers.length) {
    els.comparison.innerHTML = '<p class="cmp-empty">No comparison data.</p>';
    return;
  }

  // Union of categories, sorted by combined total (most contested first).
  const totals = {};
  let cellMax = 1; // largest single provider×category count → bar scale.
  for (const p of providers) {
    for (const [cat, n] of Object.entries(byPlatformCategory[p])) {
      totals[cat] = (totals[cat] || 0) + n;
      if (n > cellMax) cellMax = n;
    }
  }
  const categories = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);

  // The first column is the category label; each provider gets an equal share.
  // minmax(0, 1fr) lets columns shrink below their content so all providers
  // stay inside the card instead of overflowing off the right edge.
  const gridStyle = `grid-template-columns:92px repeat(${providers.length}, minmax(0, 1fr))`;

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
          const pct = Math.round((n / cellMax) * 100);
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

// Ranked list + plain-language callout for the single most widespread issue
// category — the one present across the most providers (ties broken by total
// volume). Recomputed from the data every render, so it follows the data.
function renderLatencyByProvider(data) {
  if (!els.latencyChart) return;
  const byPC = data.by_platform_category || {};
  const byP = data.by_platform || {};
  const providers = Object.keys(byP);

  // Tally, per category: how many providers have it (coverage) and total volume.
  const coverage = {};
  const catTotal = {};
  providers.forEach((p) => {
    Object.entries(byPC[p] || {}).forEach(([cat, n]) => {
      if (n > 0) {
        coverage[cat] = (coverage[cat] || 0) + 1;
        catTotal[cat] = (catTotal[cat] || 0) + n;
      }
    });
  });

  const cats = Object.keys(coverage);
  if (!cats.length) return emptyChart(els.latencyChart);

  // Focus category: widest provider coverage first, then highest total volume.
  // Exclude the catch-all "other" bucket — it isn't a specific pain point.
  const focusCandidates = cats.filter((c) => c !== 'other');
  const focusCat = (focusCandidates.length ? focusCandidates : cats).sort(
    (a, b) => coverage[b] - coverage[a] || catTotal[b] - catTotal[a],
  )[0];
  const focusLabel = labelize(focusCat);
  const covered = coverage[focusCat];
  const allCovered = covered === providers.length;
  const fullCoverageCount = cats.filter((c) => coverage[c] === providers.length).length;

  const rows = providers
    .map((p, i) => {
      const count = (byPC[p] && byPC[p][focusCat]) || 0;
      const total = byP[p] || 0;
      const share = total ? Math.round((count / total) * 100) : 0;
      return { p, count, share, color: PLATFORM_COLORS[i % PLATFORM_COLORS.length] };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (!rows.length) return emptyChart(els.latencyChart);
  const max = Math.max(...rows.map((r) => r.count), 1);

  // Headings + captions follow the chosen category.
  if (els.latencyCalloutTitle) {
    els.latencyCalloutTitle.textContent = allCovered
      ? `${focusLabel} is the universal pain point`
      : `${focusLabel} is the most widespread pain point`;
  }
  if (els.latencyFigLabel) els.latencyFigLabel.textContent = `${focusLabel} complaints by provider`;
  if (els.latencyFigNote) {
    els.latencyFigNote.textContent =
      `Bar = number of ${focusLabel.toLowerCase()} posts; the % is that provider's share of its own feedback that is about ${focusLabel.toLowerCase()}.`;
  }
  if (els.latencyChart) els.latencyChart.setAttribute('aria-label', `Ranked bar chart of ${focusLabel.toLowerCase()} feedback by provider`);

  els.latencyChart.innerHTML = `<ul class="lat-list">${rows
    .map((r) => {
      const pct = Math.round((r.count / max) * 100);
      return `
        <li class="lat-row">
          <span class="lat-name" title="${escapeHtml(r.p)}"><span class="bar-swatch" style="background:${r.color}"></span>${escapeHtml(r.p)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${r.color}"></span></span>
          <span class="lat-num">${r.count}</span>
          <span class="lat-share">${r.share}%</span>
        </li>`;
    })
    .join('')}</ul>`;

  if (els.latencyCalloutText) {
    const top = rows[0];
    const byShare = [...rows].sort((a, b) => b.share - a.share)[0];
    const coverageText = allCovered
      ? `<strong>all ${providers.length} providers</strong> — ${
          fullCoverageCount === 1 ? 'the only' : 'one of the few'
        } issue categories present across every one`
      : `<strong>${covered} of ${providers.length} providers</strong> — the most widely shared issue category`;
    els.latencyCalloutText.innerHTML =
      `${focusLabel} shows up for ${coverageText}. ` +
      `<strong>${escapeHtml(top.p)}</strong> draws the most ${focusLabel.toLowerCase()} posts (${top.count}), while ` +
      `<strong>${escapeHtml(byShare.p)}</strong> is proportionally the worst, with ${byShare.share}% of its feedback about ${focusLabel.toLowerCase()}.`;
  }
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
    `This dashboard tracks <strong>${total}</strong> public posts from developers ` +
    `about ${platformText}, collected from public developer forums including ` +
    `Hacker News, GitHub issues, Stack Overflow and the providers' official status pages.`;

  const complaintLine =
    `Of these, <strong>${complaints}</strong> (${complaintPct}%) raise complaints` +
    (topCatText ? `, with the most common themes being <strong>${topCatText}</strong>.` : '.');

  const mixLine =
    `The remainder consists of ${plural(questions, 'question')}, ` +
    `${plural(features, 'feature request')} and ${plural(positives, 'positive mention')}.`;

  const benefitsLine =
    `By aggregating this feedback in one place, the dashboard makes it easy to spot ` +
    `emerging trends over time, compare providers side by side, surface the most ` +
    `common pain points, and prioritise what to improve next — turning scattered ` +
    `public posts into actionable signal for product, support and engineering teams.`;

  const freshness =
    `Data refreshes automatically every day from public posts; machine-collected ` +
    `items are flagged “unverified” until a human reviews them.`;

  els.execSummary.innerHTML =
    `<p>${lead} ${complaintLine}</p>` +
    `<p>${mixLine} ${benefitsLine}</p>` +
    `<p>${freshness}</p>`;
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

// Populate the Source dropdown from the sources actually present in the data.
function populateSourceOptions(sources) {
  if (!els.source) return;
  const current = els.source.value;
  const sorted = [...sources].sort();
  els.source.innerHTML =
    '<option value="">All sources</option>' +
    sorted
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(sourceLabel(s))}</option>`)
      .join('');
  if (current && sorted.includes(current)) {
    els.source.value = current;
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
  if (els.source && els.source.value) params.set('source', els.source.value);
  if (els.sentiment && els.sentiment.value) params.set('sentiment', els.sentiment.value);
  if (els.verified && els.verified.value) params.set('verified', els.verified.value);
  if (els.dateFrom && els.dateFrom.value) params.set('date_from', els.dateFrom.value);
  if (els.dateTo && els.dateTo.value) params.set('date_to', els.dateTo.value);
  const q = els.q.value.trim();
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// Keep the browser URL in sync with the active filters so the view is
// shareable/bookmarkable. The `demo` flag (if present) is preserved.
function syncUrlFromFilters() {
  const params = new URLSearchParams(buildQueryString());
  const demo = new URLSearchParams(window.location.search).get('demo');
  if (demo) params.set('demo', demo);
  const s = params.toString();
  window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
}

// Apply filter values from the URL query string into the controls (on load).
// Called after the summary populates the Category/Source options so their
// values stick.
function applyUrlToFilters() {
  const p = new URLSearchParams(window.location.search);
  const set = (el, key) => {
    if (el && p.has(key)) el.value = p.get(key);
  };
  set(els.platform, 'platform');
  set(els.feedbackType, 'feedback_type');
  set(els.category, 'category');
  set(els.source, 'source');
  set(els.sentiment, 'sentiment');
  set(els.verified, 'verified');
  set(els.dateFrom, 'date_from');
  set(els.dateTo, 'date_to');
  set(els.q, 'q');
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

// Client-side pagination for the feedback card list.
const FEEDBACK_PAGE = 24;
let feedbackItems = [];
let feedbackShown = 0;

async function loadFeedback() {
  syncUrlFromFilters();
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
    if (els.loadMore) els.loadMore.hidden = true;
    return;
  }

  feedbackItems = data.items || [];
  feedbackShown = 0;
  renderFilteredView(feedbackItems);

  if (!feedbackItems.length) {
    els.cardGrid.innerHTML = '';
    els.emptyState.hidden = false;
    els.emptyState.textContent = 'No feedback matches the current filters.';
    els.resultCount.textContent = '0 items';
    if (els.loadMore) els.loadMore.hidden = true;
    return;
  }

  els.emptyState.hidden = true;
  els.cardGrid.innerHTML = '';
  renderFeedbackPage();
}

// Count items by a key function, ignoring null/empty keys, into { key: n }.
function countBy(items, keyFn) {
  const m = {};
  for (const it of items) {
    const k = keyFn(it);
    if (k == null || k === '') continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

// A small key/value stat chip for the filtered-view stats panel.
function statChip(label, value, extraClass) {
  return (
    `<div class="fv-stat ${extraClass || ''}">` +
    `<div class="fv-stat-value">${escapeHtml(String(value))}</div>` +
    `<div class="fv-stat-label">${escapeHtml(label)}</div></div>`
  );
}

// Compact stats panel for the current filtered slice: total, complaints,
// verified, top category, and (when a single platform is in view) its concern.
function renderFilteredStats(items) {
  if (!els.fvStats) return;
  const total = items.length;
  const complaints = items.filter((it) => it.feedback_type === 'complaint').length;
  const verified = items.filter((it) => it.verified === true).length;
  const catCounts = countBy(items, (it) => it.category);
  const specific = Object.entries(catCounts).filter(([c]) => c !== 'other').sort((a, b) => b[1] - a[1]);
  const topCat = specific[0] || Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  let concernChip = '';
  const providers = new Set(items.map((it) => it.provider));
  if (providers.size === 1) {
    const h = healthByProvider[items[0].provider];
    if (h) concernChip = statChip('Concern score', `${h.concern}/100`, `fv-stat-${h.level}`);
  }

  els.fvStats.innerHTML = [
    statChip('Total', total),
    statChip('Complaints', complaints),
    statChip('Verified', verified),
    statChip('Top category', topCat ? labelize(topCat[0]) : '—'),
    concernChip,
  ]
    .filter(Boolean)
    .join('');
}

// Entry point for the filtered-view section: one product-details chart + stats.
// Driven by the Platform filter (and the other active filters).
function renderFilteredView(items) {
  const hasData = items && items.length > 0;
  if (els.fvStats) els.fvStats.hidden = !hasData;
  if (!hasData) {
    if (els.fvStats) els.fvStats.innerHTML = '';
    renderFilteredChart(items);
    return;
  }
  renderFilteredStats(items);
  renderFilteredChart(items);
}

// Zero-dependency SVG pie chart. entries = [[label, value], ...]; colorFor(label, i).
function renderPieChart(target, entries, colorFor) {
  if (!target) return;
  const data = entries.filter(([, v]) => v > 0);
  if (!data.length) return emptyChart(target);
  const total = data.reduce((s, [, v]) => s + v, 0);

  const cx = 150;
  const cy = 150;
  const r = 130;
  let angle = -Math.PI / 2; // start at 12 o'clock

  const slices = data.map(([label, value], i) => {
    const frac = value / total;
    const color = colorFor(label, i) || 'var(--accent)';
    const pct = Math.round(frac * 100);
    let shape;
    if (data.length === 1) {
      // A single category is a full circle (the arc path would be degenerate).
      shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"></circle>`;
    } else {
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      const x0 = (cx + r * Math.cos(a0)).toFixed(2);
      const y0 = (cy + r * Math.sin(a0)).toFixed(2);
      const x1 = (cx + r * Math.cos(a1)).toFixed(2);
      const y1 = (cy + r * Math.sin(a1)).toFixed(2);
      const large = frac > 0.5 ? 1 : 0;
      shape = `<path d="M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="${color}"><title>${escapeHtml(label)}: ${value} (${pct}%)</title></path>`;
      angle = a1;
    }
    return { label, value, pct, color, shape };
  });

  const svg =
    `<svg viewBox="0 0 300 300" class="pie-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    `<g>${slices.map((s) => s.shape).join('')}</g></svg>`;

  const legend =
    `<ul class="pie-legend">` +
    slices
      .map(
        (s) =>
          `<li class="pie-legend-row">` +
          `<span class="pie-swatch" style="background:${s.color}"></span>` +
          `<span class="pie-legend-label">${escapeHtml(s.label)}</span>` +
          `<span class="pie-legend-value">${s.value} · ${s.pct}%</span></li>`,
      )
      .join('') +
    `</ul>`;

  target.innerHTML = `<div class="pie-wrap">${svg}${legend}</div>`;
}

// The single plot: when a specific product is chosen it breaks down by category;
// "All products" compares feedback counts across products.
function renderFilteredChart(items) {
  const hasData = items && items.length > 0;
  if (els.fvFigure) els.fvFigure.hidden = !hasData;
  if (els.fvEmpty) els.fvEmpty.hidden = hasData;
  if (!hasData) {
    if (els.fvChart) emptyChart(els.fvChart);
    return;
  }
  const setCaption = (t) => {
    if (els.fvCaption) els.fvCaption.textContent = t;
  };
  const product = els.platform ? els.platform.value : '';

  if (product) {
    const catRaw = Object.entries(countBy(items, (it) => it.category)).sort((a, b) => b[1] - a[1]);
    const catColor = {};
    const entries = catRaw.map(([cat, n]) => {
      const l = labelize(cat);
      catColor[l] = categoryColor(cat);
      return [l, n];
    });
    setCaption('Feedback by category');
    renderPieChart(els.fvChart, entries, (l) => catColor[l] || 'var(--accent)');
  } else {
    const entries = Object.entries(countBy(items, (it) => it.provider)).sort((a, b) => b[1] - a[1]);
    setCaption('Feedback by product');
    renderBarChart(els.fvChart, entries, (_l, i) => PLATFORM_COLORS[i % PLATFORM_COLORS.length], 'Product', 'Posts');
  }
}

// Render the next page of cards (appends), then update the count + Load-more.
function renderFeedbackPage() {
  const next = feedbackItems.slice(feedbackShown, feedbackShown + FEEDBACK_PAGE);
  els.cardGrid.insertAdjacentHTML('beforeend', next.map(renderCard).join(''));
  feedbackShown += next.length;

  const total = feedbackItems.length;
  els.resultCount.textContent =
    feedbackShown < total
      ? `Showing ${feedbackShown} of ${total} items`
      : `${total} ${total === 1 ? 'item' : 'items'}`;
  if (els.loadMore) els.loadMore.hidden = feedbackShown >= total;
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
  if (els.source) els.source.addEventListener('change', loadFeedback);
  if (els.sentiment) els.sentiment.addEventListener('change', loadFeedback);
  if (els.verified) els.verified.addEventListener('change', loadFeedback);
  if (els.dateFrom) els.dateFrom.addEventListener('change', loadFeedback);
  if (els.dateTo) els.dateTo.addEventListener('change', loadFeedback);

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

  // Reveal the next page of feedback cards.
  if (els.loadMore) {
    els.loadMore.addEventListener('click', renderFeedbackPage);
  }

  // Re-render the type-by-category chart when its dropdown changes.
  if (els.tcType) {
    els.tcType.addEventListener('change', renderTypeCategorySingle);
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
    if (els.source) els.source.value = '';
    if (els.sentiment) els.sentiment.value = '';
    if (els.verified) els.verified.value = '';
    if (els.dateFrom) els.dateFrom.value = '';
    if (els.dateTo) els.dateTo.value = '';
    els.q.value = '';
    loadFeedback();
  });
}

async function init() {
  wireEvents();
  // Summary first (populates category + source options, health, etc.),
  // then restore any filters from the URL, then load the matching list.
  await loadSummary();
  applyUrlToFilters();
  loadFeedback();
}

document.addEventListener('DOMContentLoaded', init);
