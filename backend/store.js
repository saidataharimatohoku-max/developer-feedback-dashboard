'use strict';

const fs = require('fs');
const path = require('path');
const { loadRaw, SOURCE_FILES, DATA_DIR } = require('./loader');
const { normalizeAll, FEEDBACK_TYPES, CATEGORIES } = require('./normalizer');

// Pick the single biggest issue to surface in the dashboard headline.
// Prefers the most recent month with data; falls back to all-time totals.
function computeTopIssue(sortedMonths, categoryMonth, byCategory) {
  // "other" is a catch-all bucket with no actionable meaning, so it is never
  // surfaced as the headline issue — we pick the most common *specific* category.
  const pickTop = (counts) => {
    const entries = Object.entries(counts || {}).filter(([cat]) => cat !== 'other');
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0];
  };
  for (let i = sortedMonths.length - 1; i >= 0; i -= 1) {
    const month = sortedMonths[i];
    const top = pickTop(categoryMonth[month]);
    if (top) {
      return { category: top[0], count: top[1], month, scope: 'month' };
    }
  }
  const allTime = pickTop(byCategory);
  if (allTime) {
    return { category: allTime[0], count: allTime[1], month: null, scope: 'all' };
  }
  return null;
}

/**
 * In-memory store built once from data/*.json (ARCHITECTURE.md §5/§9).
 * Exposes load(), all(), filter(query), summary(query).
 */
function createStore({ dataDir = DATA_DIR } = {}) {
  let items = [];
  let platforms = new Set();
  let lastMtime = 0;

  // Newest modification time across the source files (0 if none readable).
  function dataMtime() {
    let max = 0;
    for (const file of SOURCE_FILES) {
      try {
        const s = fs.statSync(path.join(dataDir, file));
        if (s.mtimeMs > max) max = s.mtimeMs;
      } catch {
        /* missing file: ignore */
      }
    }
    return max;
  }

  function load() {
    items = normalizeAll(loadRaw(dataDir));
    platforms = new Set();
    for (const it of items) {
      if (it.provider_slug) platforms.add(it.provider_slug);
      if (it.provider) platforms.add(it.provider.toLowerCase());
    }
    lastMtime = dataMtime();
    return items;
  }

  // Re-read the data files only if they changed on disk since the last load.
  // Lets a background refresh job update the dashboard without a server restart.
  function reloadIfChanged() {
    const m = dataMtime();
    if (m > lastMtime) {
      load();
      return true;
    }
    return false;
  }

  function all() {
    return items;
  }

  function knownPlatform(value) {
    return platforms.has(String(value).toLowerCase());
  }

  function filter({ platform, feedback_type, category, q, source, sentiment, verified, date_from, date_to } = {}) {
    let result = items;

    if (platform) {
      const p = platform.toLowerCase();
      result = result.filter(
        (it) => it.provider_slug === p || (it.provider && it.provider.toLowerCase() === p),
      );
    }
    if (feedback_type) {
      const ft = feedback_type.toLowerCase();
      result = result.filter((it) => it.feedback_type === ft);
    }
    if (category) {
      const c = category.toLowerCase();
      result = result.filter((it) => it.category === c);
    }
    if (source) {
      const s = source.toLowerCase();
      result = result.filter((it) => (it.source || '').toLowerCase() === s);
    }
    if (sentiment) {
      const sv = sentiment.toLowerCase();
      result = result.filter((it) => (it.sentiment || '').toLowerCase() === sv);
    }
    if (verified === true || verified === 'true') {
      result = result.filter((it) => it.verified === true);
    } else if (verified === false || verified === 'false') {
      result = result.filter((it) => it.verified !== true);
    }
    if (date_from) {
      result = result.filter((it) => it.date && it.date >= date_from);
    }
    if (date_to) {
      result = result.filter((it) => it.date && it.date <= date_to);
    }
    if (q) {
      const needle = q.toLowerCase();
      result = result.filter((it) =>
        `${it.summary || ''} ${it.original_text || ''}`.toLowerCase().includes(needle),
      );
    }

    return result;
  }

  function summary({ platform } = {}) {
    const scoped = platform ? filter({ platform }) : items;

    const byPlatform = {};
    const byFeedbackType = {};
    const byCategory = {};
    const bySentiment = {};
    const bySource = {};
    const byPlatformCategory = {};
    const byFeedbackTypeCategory = {};
    const monthCounts = {};
    const sentimentMonth = {};
    const categoryMonth = {};
    const platformMonth = {};
    let undatedCount = 0;

    // feedback_type keys always present (even when 0), per the documented shape.
    for (const ft of FEEDBACK_TYPES) byFeedbackType[ft] = 0;

    for (const it of scoped) {
      byPlatform[it.provider] = (byPlatform[it.provider] || 0) + 1;
      byFeedbackType[it.feedback_type] = (byFeedbackType[it.feedback_type] || 0) + 1;
      if (it.category != null) {
        byCategory[it.category] = (byCategory[it.category] || 0) + 1;
        const pc = byPlatformCategory[it.provider] || (byPlatformCategory[it.provider] = {});
        pc[it.category] = (pc[it.category] || 0) + 1;
        const tc = byFeedbackTypeCategory[it.feedback_type] || (byFeedbackTypeCategory[it.feedback_type] = {});
        tc[it.category] = (tc[it.category] || 0) + 1;
      }
      if (it.sentiment != null) {
        bySentiment[it.sentiment] = (bySentiment[it.sentiment] || 0) + 1;
      }
      if (it.source != null && it.source !== '') {
        bySource[it.source] = (bySource[it.source] || 0) + 1;
      }
      if (it.date) {
        const month = it.date.slice(0, 7); // YYYY-MM
        monthCounts[month] = (monthCounts[month] || 0) + 1;
        const sm = sentimentMonth[month] || (sentimentMonth[month] = {});
        if (it.sentiment != null) sm[it.sentiment] = (sm[it.sentiment] || 0) + 1;
        if (it.category != null) {
          const cm = categoryMonth[month] || (categoryMonth[month] = {});
          cm[it.category] = (cm[it.category] || 0) + 1;
        }
        const pm = platformMonth[month] || (platformMonth[month] = {});
        pm[it.provider] = (pm[it.provider] || 0) + 1;
      } else {
        undatedCount += 1;
      }
    }

    const sortedMonths = Object.keys(monthCounts).sort();

    const trendByMonth = sortedMonths.map((month) => ({ month, count: monthCounts[month] }));

    const sentimentTrendByMonth = Object.keys(sentimentMonth)
      .sort()
      .map((month) => ({ month, ...sentimentMonth[month] }));

    // Per-provider and per-category monthly timelines (one series each), aligned
    // to the same ascending `months` axis so the dashboard can draw multi-line
    // "complaints per month" charts broken down by provider or by category.
    const trendByPlatformMonth = {
      months: sortedMonths,
      series: Object.keys(byPlatform).map((name) => ({
        key: name,
        counts: sortedMonths.map((m) => (platformMonth[m] && platformMonth[m][name]) || 0),
      })),
    };

    const trendByCategoryMonth = {
      months: sortedMonths,
      series: Object.keys(byCategory).map((name) => ({
        key: name,
        counts: sortedMonths.map((m) => (categoryMonth[m] && categoryMonth[m][name]) || 0),
      })),
    };

    // "Most common issue right now": top category in the most recent month that
    // has dated items; falls back to the all-time top category when no months
    // are present. Used by the dashboard's headline callout.
    const topIssue = computeTopIssue(sortedMonths, categoryMonth, byCategory);

    return {
      total: scoped.length,
      by_platform: byPlatform,
      by_feedback_type: byFeedbackType,
      by_category: byCategory,
      by_platform_category: byPlatformCategory,
      by_feedback_type_category: byFeedbackTypeCategory,
      by_sentiment: bySentiment,
      by_source: bySource,
      trend_by_month: trendByMonth,
      sentiment_trend_by_month: sentimentTrendByMonth,
      trend_by_platform_month: trendByPlatformMonth,
      trend_by_category_month: trendByCategoryMonth,
      top_issue: topIssue,
      undated_count: undatedCount,
      last_updated: dataMtime() ? new Date(dataMtime()).toISOString() : null,
    };
  }

  return {
    load,
    reloadIfChanged,
    all,
    filter,
    summary,
    knownPlatform,
    get platforms() {
      return platforms;
    },
    SOURCE_FILES,
    FEEDBACK_TYPES,
    CATEGORIES,
  };
}

module.exports = { createStore };
