'use strict';

const { loadRaw, SOURCE_FILES } = require('./loader');
const { normalizeAll, FEEDBACK_TYPES, CATEGORIES } = require('./normalizer');

/**
 * In-memory store built once from data/*.json (ARCHITECTURE.md §5/§9).
 * Exposes load(), all(), filter(query), summary(query).
 */
function createStore() {
  let items = [];
  let platforms = new Set();

  function load() {
    items = normalizeAll(loadRaw());
    platforms = new Set();
    for (const it of items) {
      if (it.provider_slug) platforms.add(it.provider_slug);
      if (it.provider) platforms.add(it.provider.toLowerCase());
    }
    return items;
  }

  function all() {
    return items;
  }

  function knownPlatform(value) {
    return platforms.has(String(value).toLowerCase());
  }

  function filter({ platform, feedback_type, category, q } = {}) {
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
    const monthCounts = {};
    let undatedCount = 0;

    // feedback_type keys always present (even when 0), per the documented shape.
    for (const ft of FEEDBACK_TYPES) byFeedbackType[ft] = 0;

    for (const it of scoped) {
      byPlatform[it.provider] = (byPlatform[it.provider] || 0) + 1;
      byFeedbackType[it.feedback_type] = (byFeedbackType[it.feedback_type] || 0) + 1;
      if (it.category != null) {
        byCategory[it.category] = (byCategory[it.category] || 0) + 1;
      }
      if (it.date) {
        const month = it.date.slice(0, 7); // YYYY-MM
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      } else {
        undatedCount += 1;
      }
    }

    const trendByMonth = Object.keys(monthCounts)
      .sort()
      .map((month) => ({ month, count: monthCounts[month] }));

    return {
      total: scoped.length,
      by_platform: byPlatform,
      by_feedback_type: byFeedbackType,
      by_category: byCategory,
      trend_by_month: trendByMonth,
      undated_count: undatedCount,
    };
  }

  return {
    load,
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
