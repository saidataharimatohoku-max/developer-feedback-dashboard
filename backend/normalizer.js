'use strict';

// Canonical enums (ARCHITECTURE.md §3 / §4).
const FEEDBACK_TYPES = ['complaint', 'question', 'feature_request', 'positive'];
const CATEGORIES = [
  'latency',
  'downtime',
  'billing',
  'rate_limits',
  'model_quality',
  'api_change',
  'support',
  'docs',
  'pricing',
  'other',
];

// Cue/keyword sets for the deterministic feedback_type derivation (§3.1).
const QUESTION_CUES = ['how do i', 'how to', 'is it possible', 'can i ', 'why does', '?'];
const FEATURE_CUES = [
  'lacked',
  'missing',
  'lack of',
  'wish',
  'feature request',
  'would be nice',
  'ability to',
  'support for',
];
const COMPLAINT_CATEGORIES = new Set([
  'latency',
  'downtime',
  'billing',
  'rate_limits',
  'pricing',
  'model_quality',
  'support',
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "Together AI" -> "together-ai" (lowercase, spaces/`.` -> `-`). */
function slugify(provider) {
  return String(provider || '')
    .toLowerCase()
    .replace(/[\s.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function emptyToNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Deterministic feedback_type mapping (ARCHITECTURE.md §3.1, first match wins).
 * `text` = lowercase of (summary + " " + quote).
 *
 * Reconciliation note: the §3.1 rule table's rule-1 "docs && !negative" sub-clause,
 * read literally, would route tg-0001 (docs, mixed, contains "lacked"/"ability to")
 * to `question`. The §3.1 *worked examples* and rationale explicitly require
 * tg-0001 -> rule 2 -> `feature_request`, and the documented summary has
 * question count 0. To honor those concrete expected outputs, the docs->question
 * shortcut is suppressed when a feature-gap cue is present, so a docs item that is
 * actually a feature gap is classified as feature_request, not question.
 *
 * @param {{summary?: string, quote?: string, category?: string, sentiment?: string}} input
 * @returns {'complaint'|'question'|'feature_request'|'positive'}
 */
function feedbackType({ summary, quote, category, sentiment } = {}) {
  const text = `${summary || ''} ${quote || ''}`.toLowerCase();
  const hasQuestionCue = QUESTION_CUES.some((cue) => text.includes(cue));
  const hasFeatureCue = FEATURE_CUES.some((cue) => text.includes(cue));

  // Rule 1 — question
  if (hasQuestionCue || (category === 'docs' && sentiment !== 'negative' && !hasFeatureCue)) {
    return 'question';
  }
  // Rule 2 — feature_request
  if (hasFeatureCue || category === 'api_change') {
    return 'feature_request';
  }
  // Rule 3 — complaint
  if (sentiment === 'negative' || COMPLAINT_CATEGORIES.has(category)) {
    return 'complaint';
  }
  // Rule 4 — positive
  if (sentiment === 'neutral' || sentiment === 'mixed') {
    return 'positive';
  }
  // Rule 5 — fallback
  return 'complaint';
}

/**
 * Map one raw complaint (+ its provider) to the canonical normalized schema (§3).
 *
 * @param {object} raw raw complaint item from data/*.json
 * @param {string} provider top-level provider name from the file
 * @returns {object} normalized feedback object
 */
function normalize(raw, provider) {
  const summary = raw && raw.complaint != null ? String(raw.complaint) : '';
  const quote = raw ? raw.quote : undefined;
  const category = raw ? raw.category : undefined;
  const sentiment = raw ? raw.sentiment : undefined;

  return {
    id: raw ? raw.id : undefined,
    provider,
    provider_slug: slugify(provider),
    feedback_type: feedbackType({ summary, quote, category, sentiment }),
    category,
    sentiment,
    summary,
    original_text: emptyToNull(quote),
    source: raw ? raw.source : undefined,
    source_url: emptyToNull(raw ? raw.source_url : undefined),
    corroborating_urls:
      raw && Array.isArray(raw.corroborating_urls) ? raw.corroborating_urls : [],
    author_handle: emptyToNull(raw ? raw.author_handle : undefined),
    date: raw && typeof raw.date === 'string' && DATE_RE.test(raw.date) ? raw.date : null,
    verified: !!(raw && raw.verified === true),
    auto_collected: !!(raw && raw.auto_collected === true),
  };
}

/**
 * Normalize a list of { provider, raw } records (as returned by loader.loadRaw()).
 * @param {{provider: string, raw: object}[]} records
 * @returns {object[]}
 */
function normalizeAll(records) {
  return records.map(({ provider, raw }) => normalize(raw, provider));
}

module.exports = {
  normalize,
  normalizeAll,
  feedbackType,
  slugify,
  FEEDBACK_TYPES,
  CATEGORIES,
};
