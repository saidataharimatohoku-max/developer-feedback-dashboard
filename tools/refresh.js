'use strict';

/**
 * Automated public-feedback refresh (Phase 2).
 *
 * Pulls recent public mentions of each provider from Hacker News (Algolia
 * search API), GitHub (public issue search) and Reddit (official OAuth API),
 * keeps only negative-leaning items (likely complaints), maps them to the
 * canonical raw schema, de-duplicates against what is already stored, and
 * appends genuinely new items to data/*.json.
 *
 * Zero dependencies: uses Node's built-in global `fetch` (Node 18+).
 * Run:  node tools/refresh.js
 *
 * Notes / honesty:
 * - Hacker News and GitHub are public and unauthenticated. Reddit blocks all
 *   anonymous access, so it is collected only when free OAuth credentials are
 *   present (env vars REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET, or a local
 *   untracked tools/reddit-credentials.json). Without them Reddit is skipped
 *   silently and the other sources still run. Trustpilot / G2 / X remain
 *   auth-gated / paid and are not collected.
 * - Categorization & sentiment are keyword heuristics, so auto-added items are
 *   flagged `"auto_collected": true` and always `verified: false`. They are
 *   coarser than hand-curated items; treat their category/sentiment as a guess.
 * - Existing (hand-curated) items are never modified or removed.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WINDOW_DAYS = 365;
const MAX_NEW_PER_PROVIDER = 25; // safety cap per run
const HITS_PER_PAGE = 50;
const GITHUB_PER_PAGE = 30;
const REDDIT_PER_PAGE = 25;
const REDDIT_CREDS_FILE = path.join(__dirname, 'reddit-credentials.json');
const REDDIT_UA = 'web:dev-feedback-dashboard:1.0 (public feedback monitor)';

// Human-readable label per source, used in the generated complaint text.
const SOURCE_LABELS = {
  hackernews: 'Hacker News',
  github: 'GitHub',
  reddit: 'Reddit',
};

const PROVIDERS = [
  {
    provider: 'Together AI',
    file: 'together-ai-complaints.json',
    idPrefix: 'tg',
    queries: ['Together AI', 'together.ai'],
    // GitHub is searched by the provider's domains only (the bare brand name
    // "Together AI" is far too common and pulls in unrelated repos).
    githubQueries: ['together.ai', 'api.together.xyz'],
    // a mention must reference the provider to count
    nameCues: ['together ai', 'together.ai', 'api.together.xyz', 'togethercompute'],
  },
  {
    provider: 'Fireworks AI',
    file: 'fireworks-ai-complaints.json',
    idPrefix: 'fw',
    queries: ['Fireworks AI', 'fireworks.ai'],
    githubQueries: ['fireworks.ai', 'api.fireworks.ai'],
    nameCues: ['fireworks ai', 'fireworks.ai', 'api.fireworks.ai'],
  },
  {
    provider: 'Tinker API',
    file: 'tinker-api-complaints.json',
    idPrefix: 'tk',
    // "Tinker" alone is a generic English word, so the public queries are
    // anchored to the product / company name to avoid unrelated hardware,
    // gaming and DIY "tinker" chatter.
    queries: ['Tinker API', 'Thinking Machines Tinker', 'thinkingmachines.ai'],
    // GitHub is searched by the company domain and the official org/repo.
    githubQueries: ['thinkingmachines.ai', 'thinking-machines-lab', 'tinker-cookbook'],
    nameCues: ['tinker api', 'thinking machines', 'thinkingmachines.ai', 'thinking-machines-lab', 'tinker-cookbook', 'tinkerapi'],
  },
  {
    provider: 'Azure Kubernetes Service',
    file: 'azure-kubernetes-service-complaints.json',
    idPrefix: 'aks',
    // Tracked as the self-hosted / DIY way to run models. "AKS" alone is an
    // ambiguous acronym (it appears inside words like "speaks"/"breaks"), so
    // the queries and cues use the full product name and AKS-specific phrases.
    queries: ['Azure Kubernetes Service'],
    githubQueries: ['Azure Kubernetes Service'],
    // Genuine AKS feedback is filed in the official issue tracker, so we also
    // pull recent issues straight from the Azure/AKS repo.
    githubRepos: ['Azure/AKS'],
    nameCues: ['azure kubernetes service', 'azure/aks', 'aks cluster', 'aks node pool', 'managed kubernetes'],
  },
  {
    provider: 'Azure Machine Learning',
    file: 'azure-machine-learning-complaints.json',
    idPrefix: 'aml',
    // Microsoft's managed ML platform (training + managed online endpoints for
    // inference). "Azure ML" / "AzureML" are anchored to the full product name
    // and official repos to avoid unrelated "ml" chatter.
    queries: ['Azure Machine Learning'],
    githubQueries: ['Azure Machine Learning'],
    // Genuine Azure ML feedback is filed in the official example/SDK repos, so
    // we also pull recent issues straight from those repos.
    githubRepos: ['Azure/azureml-examples', 'Azure/MachineLearningNotebooks'],
    nameCues: ['azure machine learning', 'azure ml', 'azureml', 'azure/azureml', 'managed online endpoint', 'aml compute', 'azure ml studio'],
  },
  {
    provider: 'OpenAI',
    file: 'openai-complaints.json',
    idPrefix: 'oa',
    // OpenAI's inference API (api.openai.com). "OpenAI" alone pulls in endless
    // company/news chatter, so queries and cues are anchored to the API surface
    // and the official SDK package names to keep developer feedback specific.
    queries: ['OpenAI API'],
    githubQueries: ['api.openai.com', 'openai-python'],
    // Genuine API/SDK feedback is filed in OpenAI's official client repos, so we
    // also pull recent issues straight from those repos.
    githubRepos: ['openai/openai-python', 'openai/openai-node'],
    nameCues: ['openai api', 'api.openai.com', 'openai-python', 'openai-node', 'chat.completions', 'responses api', 'azureopenai'],
  },
];

// Negative-leaning cues: an item is only kept if it contains at least one.
const NEGATIVE_CUES = [
  'down', 'outage', 'outages', 'unreliable', 'slow', 'slower', 'latency',
  'error', 'errors', 'broken', 'broke', 'fail', 'failed', 'failing',
  'expensive', 'overcharged', 'overpriced', 'bill', 'billing', 'charged',
  'rate limit', 'rate-limit', 'throttle', 'throttled', '429', 'timeout',
  'timed out', 'disappointed', 'disappointing', 'mediocre', 'buggy', 'bug',
  'missing', 'lacks', 'lacked', 'lack of', 'poor', 'worse', 'worst', 'issue',
  'problem', 'complaint', 'crippled', 'degraded', 'flaky',
];

// First-match-wins category keyword map (mirrors normalizer CATEGORIES).
const CATEGORY_RULES = [
  ['downtime', ['down', 'outage', 'unreliable', 'degraded', 'flaky', '5xx', '503', 'incident']],
  ['latency', ['latency', 'slow', 'slower', 'timeout', 'timed out', 'lag']],
  ['rate_limits', ['rate limit', 'rate-limit', 'throttle', 'throttled', '429', 'quota']],
  ['billing', ['bill', 'billing', 'charged', 'overcharged', 'invoice', 'refund']],
  ['pricing', ['expensive', 'overpriced', 'price', 'pricing', 'cost', 'costs']],
  ['model_quality', ['model', 'quality', 'hallucinat', 'accuracy', 'mediocre', 'disappointed']],
  ['support', ['support', 'ticket', 'no response', 'unresponsive', 'customer service']],
  ['docs', ['docs', 'documentation', 'example', 'guide', 'unclear']],
];

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(text) {
  const t = text.toLowerCase();
  for (const [cat, cues] of CATEGORY_RULES) {
    if (cues.some((c) => t.includes(c))) return cat;
  }
  return 'other';
}

// Reject text that is mostly non-Latin script (e.g. CJK aggregator feeds that
// merely contain a provider URL). Keeps the dashboard readable and on-topic.
function isLatinText(text) {
  if (!text) return false;
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af\u3040-\u30ff]/g) || []).length;
  return cjk <= 4;
}

// Reject machine-generated noise: posts authored by bots/CI (e.g. GitHub Actions)
// and auto-generated diagnostic/telemetry dumps that aren't real human feedback.
function isBotNoise(author, text) {
  const a = String(author || '').toLowerCase();
  if (/\[bot\]$|(^|[^a-z])bot([^a-z]|$)|github-actions|dependabot|renovate|codecov/.test(a)) {
    return true;
  }
  const t = String(text || '').toLowerCase();
  // Telemetry / automated incident dumps rather than user-written complaints.
  if (/usagenanocores|telemetry set|read-only telemetry|0% success rate|downstream cascade|resource-state evidence/.test(t)) {
    return true;
  }
  return false;
}

// Max characters allowed between the provider name and a negative cue for the
// item to count as an on-topic complaint (keeps passing mentions out).
const PROXIMITY = 80;

/**
 * Decide whether `text` is an on-topic complaint about the provider.
 * Requires a negative cue to appear within PROXIMITY characters of a mention
 * of the provider name. Returns a local snippet + category, or null.
 */
function analyze(text, nameCues) {
  const t = text.toLowerCase();

  const namePositions = [];
  for (const c of nameCues) {
    let i = t.indexOf(c);
    while (i !== -1) {
      namePositions.push([i, i + c.length]);
      i = t.indexOf(c, i + 1);
    }
  }
  if (namePositions.length === 0) return null;

  for (const cue of NEGATIVE_CUES) {
    let i = t.indexOf(cue);
    while (i !== -1) {
      const cueStart = i;
      const cueEnd = i + cue.length;
      for (const [ns, ne] of namePositions) {
        let dist;
        if (cueStart >= ne) dist = cueStart - ne;
        else if (cueEnd <= ns) dist = ns - cueEnd;
        else dist = 0;
        if (dist <= PROXIMITY) {
          const start = Math.max(0, ns - 140);
          const end = Math.min(text.length, ns + 200);
          const snippet = text.slice(start, end).trim();
          return { snippet, category: classify(snippet) };
        }
      }
      i = t.indexOf(cue, i + 1);
    }
  }
  return null;
}

async function fetchHits(query, sinceUnix) {
  const url =
    'https://hn.algolia.com/api/v1/search?query=' +
    encodeURIComponent(query) +
    '&tags=(story,comment)&hitsPerPage=' +
    HITS_PER_PAGE +
    '&numericFilters=created_at_i>' +
    sinceUnix;
  const res = await fetch(url, { headers: { 'User-Agent': 'dev-feedback-refresh/1.0' } });
  if (!res.ok) throw new Error(`HN Algolia ${res.status} for "${query}"`);
  const json = await res.json();
  return Array.isArray(json.hits) ? json.hits : [];
}

// Public GitHub issue/discussion search (no auth; low unauthenticated rate
// limit is fine for a once-a-day run). Looks for the provider name in the
// title/body of issues created within the window.
async function fetchGithubIssues(query, sinceDate) {
  const q = `"${query}" in:title,body type:issue created:>=${sinceDate}`;
  const url =
    'https://api.github.com/search/issues?q=' +
    encodeURIComponent(q) +
    '&sort=created&order=desc&per_page=' +
    GITHUB_PER_PAGE;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'dev-feedback-refresh/1.0',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub search ${res.status} for "${query}"`);
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

// Pull recent issues filed *inside* a specific repository (e.g. Azure/AKS).
// For products whose feedback lives in their own issue tracker rather than in
// loose web mentions, an issue filed in the official repo is itself the signal,
// so we fetch the repo's newest issues and let the caller score them.
async function fetchGithubRepoIssues(repo, sinceDate) {
  const q = `repo:${repo} type:issue created:>=${sinceDate}`;
  const url =
    'https://api.github.com/search/issues?q=' +
    encodeURIComponent(q) +
    '&sort=created&order=desc&per_page=' +
    GITHUB_PER_PAGE;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'dev-feedback-refresh/1.0',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub repo search ${res.status} for "${repo}"`);
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

// --- Reddit (official OAuth API) ---------------------------------------------
// Reddit blocks all anonymous access, so we authenticate with free OAuth
// credentials. App-only (client_credentials) grant is enough for public search
// and needs only a client id + secret; if a username/password are also given a
// password grant is used. Credentials come from env vars or a local untracked
// JSON file. `undefined` = not tried yet, `null` = unavailable, string = token.
let _redditToken;

function loadRedditCreds() {
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    return {
      id: process.env.REDDIT_CLIENT_ID,
      secret: process.env.REDDIT_CLIENT_SECRET,
      username: process.env.REDDIT_USERNAME || null,
      password: process.env.REDDIT_PASSWORD || null,
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(REDDIT_CREDS_FILE, 'utf8'));
    if (raw.client_id && raw.client_secret) {
      return {
        id: raw.client_id,
        secret: raw.client_secret,
        username: raw.username || null,
        password: raw.password || null,
      };
    }
  } catch (_) {
    /* no local credentials file — Reddit will be skipped */
  }
  return null;
}

async function ensureRedditToken() {
  if (_redditToken !== undefined) return _redditToken;
  const creds = loadRedditCreds();
  if (!creds) {
    _redditToken = null;
    return null;
  }
  try {
    const body =
      creds.username && creds.password
        ? `grant_type=password&username=${encodeURIComponent(creds.username)}` +
          `&password=${encodeURIComponent(creds.password)}`
        : 'grant_type=client_credentials';
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${creds.id}:${creds.secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_UA,
      },
      body,
    });
    if (!res.ok) throw new Error(`Reddit auth ${res.status}`);
    const json = await res.json();
    _redditToken = json.access_token || null;
  } catch (err) {
    console.warn(`  [warn] Reddit auth failed: ${err.message}`);
    _redditToken = null;
  }
  return _redditToken;
}

// Search Reddit posts (link + self posts) site-wide for a query, newest first,
// keeping only those created within the window.
async function fetchRedditPosts(query, token, sinceUnix) {
  const url =
    'https://oauth.reddit.com/search?q=' +
    encodeURIComponent(query) +
    '&sort=new&limit=' +
    REDDIT_PER_PAGE +
    '&type=link&raw_json=1';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': REDDIT_UA },
  });
  if (!res.ok) throw new Error(`Reddit search ${res.status} for "${query}"`);
  const json = await res.json();
  const children = json && json.data && Array.isArray(json.data.children) ? json.data.children : [];
  return children
    .map((c) => c.data)
    .filter(Boolean)
    .filter((d) => (d.created_utc || 0) >= sinceUnix);
}

// Score an issue that was filed *inside* a product's own repo. The repo context
// already proves relevance, so instead of requiring the product name we just
// require a negative cue somewhere in the issue and build a snippet around it.
function analyzeRepoIssue(text) {
  const t = text.toLowerCase();
  for (const cue of NEGATIVE_CUES) {
    const i = t.indexOf(cue);
    if (i !== -1) {
      const start = Math.max(0, i - 140);
      const end = Math.min(text.length, i + 200);
      const snippet = text.slice(start, end).trim();
      return { snippet, category: classify(snippet) };
    }
  }
  return null;
}

function maxIdNumber(complaints, prefix) {
  let max = 0;
  for (const c of complaints) {
    const m = typeof c.id === 'string' && c.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// Pull raw mentions from every public source into one normalized candidate
// list: { text, sourceUrl, source, author, dateISO }.
async function collectCandidates(cfg, sinceUnix) {
  const candidates = [];

  // --- Hacker News (Algolia) ---
  for (const q of cfg.queries) {
    try {
      const hits = await fetchHits(q, sinceUnix);
      for (const hit of hits) {
        if (!hit.objectID) continue;
        candidates.push({
          text: stripHtml(hit.comment_text || hit.story_text || hit.title || ''),
          sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          source: 'hackernews',
          author: hit.author || null,
          dateISO: hit.created_at || null,
        });
      }
    } catch (err) {
      console.warn(`  [warn] ${err.message}`);
    }
  }

  // --- GitHub issues ---
  const sinceDate = new Date(sinceUnix * 1000).toISOString().slice(0, 10);
  for (const q of cfg.githubQueries || []) {
    try {
      const items = await fetchGithubIssues(q, sinceDate);
      for (const it of items) {
        if (!it.html_url) continue;
        candidates.push({
          text: stripHtml(`${it.title || ''}. ${it.body || ''}`),
          sourceUrl: it.html_url,
          source: 'github',
          author: it.user && it.user.login ? it.user.login : null,
          dateISO: it.created_at || null,
        });
      }
    } catch (err) {
      console.warn(`  [warn] ${err.message}`);
    }
  }

  // --- GitHub issues filed inside specific repos (e.g. Azure/AKS) ---
  for (const repo of cfg.githubRepos || []) {
    try {
      const items = await fetchGithubRepoIssues(repo, sinceDate);
      for (const it of items) {
        if (!it.html_url) continue;
        candidates.push({
          text: stripHtml(`${it.title || ''}. ${it.body || ''}`),
          sourceUrl: it.html_url,
          source: 'github',
          author: it.user && it.user.login ? it.user.login : null,
          dateISO: it.created_at || null,
          repoScoped: true,
        });
      }
    } catch (err) {
      console.warn(`  [warn] ${err.message}`);
    }
  }

  // --- Reddit (official OAuth API; skipped when no credentials) ---
  const redditToken = await ensureRedditToken();
  if (redditToken) {
    for (const q of cfg.queries) {
      try {
        const posts = await fetchRedditPosts(q, redditToken, sinceUnix);
        for (const p of posts) {
          if (!p.permalink) continue;
          candidates.push({
            text: stripHtml(`${p.title || ''}. ${p.selftext || ''}`),
            sourceUrl: `https://www.reddit.com${p.permalink}`,
            source: 'reddit',
            author: p.author || null,
            dateISO: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
          });
        }
      } catch (err) {
        console.warn(`  [warn] ${err.message}`);
      }
    }
  }

  return candidates;
}

async function refreshProvider(cfg, sinceUnix) {
  const file = path.join(DATA_DIR, cfg.file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const complaints = Array.isArray(data.complaints) ? data.complaints : [];

  const knownUrls = new Set(complaints.map((c) => c.source_url).filter(Boolean));
  const seenUrls = new Set(); // dedupe within this run

  const candidates = await collectCandidates(cfg, sinceUnix);

  let nextId = maxIdNumber(complaints, cfg.idPrefix) + 1;
  const added = [];

  for (const cand of candidates) {
    if (added.length >= MAX_NEW_PER_PROVIDER) break;
    if (!cand.sourceUrl || seenUrls.has(cand.sourceUrl)) continue;
    seenUrls.add(cand.sourceUrl);

    if (knownUrls.has(cand.sourceUrl)) continue; // already stored

    const text = cand.text || '';
    if (text.length < 20) continue;
    if (!isLatinText(text)) continue;
    if (isBotNoise(cand.author, text)) continue;
    const verdict = cand.repoScoped ? analyzeRepoIssue(text) : analyze(text, cfg.nameCues);
    if (!verdict) continue;

    const snippet = verdict.snippet;
    const trimmed = snippet.length > 300 ? snippet.slice(0, 297).trimEnd() + '...' : snippet;
    const category = verdict.category;
    const id = `${cfg.idPrefix}-${String(nextId).padStart(4, '0')}`;
    nextId += 1;
    const label = SOURCE_LABELS[cand.source] || cand.source;

    added.push({
      id,
      complaint: `Auto-collected ${label} mention referencing ${cfg.provider}: "${trimmed}"`,
      quote: trimmed,
      category,
      sentiment: 'negative',
      author_handle: cand.author || null,
      source: cand.source,
      source_url: cand.sourceUrl,
      corroborating_urls: [],
      date: cand.dateISO ? new Date(cand.dateISO).toISOString().slice(0, 10) : null,
      verified: false,
      auto_collected: true,
    });
  }

  if (added.length > 0) {
    data.complaints = complaints.concat(added);
    data.generated_at = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  return { provider: cfg.provider, scanned: candidates.length, added: added.length, ids: added.map((a) => a.id) };
}

async function main() {
  if (typeof fetch !== 'function') {
    console.error('global fetch is unavailable; Node 18+ is required.');
    process.exit(1);
  }
  const sinceUnix = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  const sources = ['Hacker News', 'GitHub'];
  if (await ensureRedditToken()) {
    sources.push('Reddit');
  } else {
    console.log('  [info] Reddit skipped — no OAuth credentials found (set REDDIT_CLIENT_ID/SECRET or tools/reddit-credentials.json).');
  }
  console.log(`[refresh] ${new Date().toISOString()} — ${sources.join(' + ')}, last ${WINDOW_DAYS} days`);

  let totalAdded = 0;
  for (const cfg of PROVIDERS) {
    const r = await refreshProvider(cfg, sinceUnix);
    totalAdded += r.added;
    console.log(`  ${r.provider}: scanned ${r.scanned} candidates, added ${r.added}${r.added ? ' (' + r.ids.join(', ') + ')' : ''}`);
  }
  console.log(`[refresh] done — ${totalAdded} new item(s). The running dashboard will pick these up automatically.`);
}

main().catch((err) => {
  console.error('[refresh] failed:', err);
  process.exit(1);
});
