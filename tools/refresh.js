'use strict';

/**
 * Automated public-feedback refresh (Phase 2).
 *
 * Pulls recent public mentions of each provider from Hacker News (Algolia
 * search API), GitHub (public issue search), Stack Overflow (public Stack
 * Exchange API), Discourse community forums (public search.json, e.g. the
 * OpenAI community forum), the DEV Community / Forem articles API (dev.to) and
 * Reddit (official OAuth API),
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
const STACKOVERFLOW_PER_PAGE = 30;
const DEVTO_PER_PAGE = 30;
const BLUESKY_PER_PAGE = 25;
// Bluesky's public AppView needs no auth, but some networks block it (HTTP 403),
// so it is opt-in to keep the daily run quiet where it is unreachable.
const ENABLE_BLUESKY = process.env.ENABLE_BLUESKY === '1';
// Stack Exchange API is public/unauthenticated. An optional free key only
// raises the daily quota (set env var STACKEXCHANGE_KEY to use one).
const STACKEXCHANGE_KEY = process.env.STACKEXCHANGE_KEY || null;
const REDDIT_CREDS_FILE = path.join(__dirname, 'reddit-credentials.json');
const REDDIT_UA = 'web:dev-feedback-dashboard:1.0 (public feedback monitor)';

// Human-readable label per source, used in the generated complaint text.
const SOURCE_LABELS = {
  hackernews: 'Hacker News',
  github: 'GitHub',
  reddit: 'Reddit',
  stackoverflow: 'Stack Overflow',
  discourse: 'Community Forum',
  devto: 'DEV Community',
  bluesky: 'Bluesky',
  statuspage: 'Status page',
  serverfault: 'Server Fault',
  'devops-stackexchange': 'DevOps Stack Exchange',
  'ai-stackexchange': 'AI Stack Exchange',
  superuser: 'Super User',
};

// Stack Exchange network site -> canonical `source` value stored on each item.
const SE_SITE_SOURCE = {
  stackoverflow: 'stackoverflow',
  serverfault: 'serverfault',
  devops: 'devops-stackexchange',
  ai: 'ai-stackexchange',
  superuser: 'superuser',
  softwareengineering: 'softwareengineering',
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
    // Third-party integration repos where users file real Together AI bugs.
    githubScopedQueries: [{ repo: 'langchain-ai/langchain', term: 'together' }],
    // a mention must reference the provider to count
    nameCues: ['together ai', 'together.ai', 'api.together.xyz', 'togethercompute'],
  },
  {
    provider: 'Fireworks AI',
    file: 'fireworks-ai-complaints.json',
    idPrefix: 'fw',
    queries: ['Fireworks AI', 'fireworks.ai'],
    githubQueries: ['fireworks.ai', 'api.fireworks.ai'],
    // Third-party integration repos where users file real Fireworks AI bugs.
    githubScopedQueries: [{ repo: 'langchain-ai/langchain', term: 'fireworks' }],
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
    // Public DEV Community (dev.to) articles tagged `aks`.
    devtoTags: ['aks'],
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
    // Third-party integration repos where users file real OpenAI API bugs.
    githubScopedQueries: [
      { repo: 'langchain-ai/langchain', term: 'openai' },
      { repo: 'run-llama/llama_index', term: 'openai' },
      { repo: 'vercel/ai', term: 'openai' },
    ],
    // Official Statuspage incident history (Atom) -> verified downtime items.
    statuspageAtom: 'https://status.openai.com/history.atom',
    // Also search the AI Stack Exchange site, not just Stack Overflow.
    stackSites: ['stackoverflow', 'ai'],
    // OpenAI runs a public Discourse community forum; its search.json endpoint
    // needs no auth and is a strong developer-feedback source.
    discourseHosts: ['community.openai.com'],
    // Public DEV Community (dev.to) articles tagged `openai`.
    devtoTags: ['openai'],
    nameCues: ['openai api', 'api.openai.com', 'openai-python', 'openai-node', 'chat.completions', 'responses api', 'azureopenai'],
  },
  {
    provider: 'Azure AI Foundry',
    file: 'azure-ai-foundry-complaints.json',
    idPrefix: 'aif',
    // Microsoft's unified AI app/agent platform (formerly Azure AI Studio).
    // Tracked broadly to include the Azure OpenAI model deployments that now
    // run under Foundry. Cues are anchored to the product names and SDK surface
    // to keep developer feedback specific.
    queries: ['Azure AI Foundry', 'Azure AI Studio', 'Azure OpenAI'],
    githubQueries: ['azure-ai-foundry', 'azure.ai.inference', 'Azure AI Foundry'],
    nameCues: ['azure ai foundry', 'azure ai studio', 'ai foundry', 'azure openai', 'azure-ai-foundry', 'azure.ai.inference', 'cognitive services openai'],
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
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
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

// Search issues *within a specific repo* that also mention a provider term
// (e.g. `repo:langchain-ai/langchain "fireworks"`). Used for third-party
// integration repos where users file real provider bugs; the provider term
// keeps the match on-topic inside an otherwise huge, general repo.
async function fetchGithubScopedIssues(repo, term, sinceDate) {
  const q = `repo:${repo} "${term}" in:title,body type:issue created:>=${sinceDate}`;
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
  if (!res.ok) throw new Error(`GitHub scoped search ${res.status} for "${repo}"/"${term}"`);
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

// --- Official status page incident history (Atom; no auth) -------------------
// Atlassian Statuspage exposes an unauthenticated Atom feed of past incidents at
// `<host>/history.atom`. Each <entry> is a real, provider-confirmed incident, so
// these become verified downtime items. Parsed with regex (no XML dependency).
async function fetchStatuspageAtom(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'dev-feedback-refresh/1.0' } });
  if (!res.ok) throw new Error(`Statuspage ${res.status} for ${url}`);
  const xml = await res.text();
  const entries = [];
  const rx = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = rx.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return mm ? mm[1] : '';
    };
    const linkM = block.match(/<link[^>]*href=['"]([^'"]+)['"]/);
    entries.push({
      title: stripHtml(pick('title')),
      updated: pick('updated') || pick('published'),
      link: linkM ? linkM[1] : url,
      content: stripHtml(pick('content')),
    });
  }
  return entries;
}

// --- Stack Overflow (public Stack Exchange API; no auth) ---------------------
// The Stack Exchange API is public and unauthenticated; an optional free key
// only raises the daily quota. We search a given SE network `site` newest-first
// within the window and return the questions for the same proximity analysis as
// the other web sources. Responses are gzip-encoded and Node's fetch
// decompresses them automatically.
async function fetchStackOverflowQuestions(query, sinceUnix, site = 'stackoverflow') {
  const url =
    'https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation' +
    '&site=' + encodeURIComponent(site) + '&filter=withbody&pagesize=' +
    STACKOVERFLOW_PER_PAGE +
    '&fromdate=' +
    sinceUnix +
    '&q=' +
    encodeURIComponent(query) +
    (STACKEXCHANGE_KEY ? '&key=' + encodeURIComponent(STACKEXCHANGE_KEY) : '');
  const res = await fetch(url, { headers: { 'User-Agent': 'dev-feedback-refresh/1.0' } });
  if (!res.ok) throw new Error(`Stack Exchange (${site}) ${res.status} for "${query}"`);
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

// --- Discourse community forums (public search.json; no auth) ----------------
// Many developer products run a public Discourse forum (e.g. the OpenAI
// community forum at community.openai.com). Discourse exposes an unauthenticated
// `search.json` endpoint. We search newest-first and resolve each matching
// post's topic slug so we can build a stable permalink. Returns rows of
// { post, slug, title, host } for the caller to filter by date/proximity.
async function fetchDiscoursePosts(host, query) {
  const url =
    `https://${host}/search.json?q=` + encodeURIComponent(`${query} order:latest`);
  const res = await fetch(url, { headers: { 'User-Agent': 'dev-feedback-refresh/1.0' } });
  if (!res.ok) throw new Error(`Discourse ${host} ${res.status} for "${query}"`);
  const json = await res.json();
  const posts = Array.isArray(json.posts) ? json.posts : [];
  const topics = Array.isArray(json.topics) ? json.topics : [];
  const slugById = new Map(topics.map((t) => [t.id, t.slug]));
  const titleById = new Map(topics.map((t) => [t.id, t.title]));
  return posts.map((p) => ({
    post: p,
    slug: slugById.get(p.topic_id) || null,
    title: titleById.get(p.topic_id) || '',
    host,
  }));
}

// --- DEV Community / Forem (public articles API; no auth) --------------------
// Dev.to (a Forem instance) exposes a public, unauthenticated articles API. We
// pull recent articles for a given tag and let the same proximity analysis keep
// only on-topic, negative-leaning mentions of the provider.
async function fetchDevtoArticles(tag) {
  const url =
    'https://dev.to/api/articles?per_page=' + DEVTO_PER_PAGE +
    '&tag=' + encodeURIComponent(tag);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'dev-feedback-refresh/1.0',
      Accept: 'application/vnd.forem.api-v1+json',
    },
  });
  if (!res.ok) throw new Error(`Dev.to ${res.status} for tag "${tag}"`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

// --- Bluesky (public AppView; no auth) ---------------------------------------
// Bluesky's public AppView exposes an unauthenticated post search. It is opt-in
// (ENABLE_BLUESKY=1) because some networks return HTTP 403 for it; enable it
// wherever public.api.bsky.app is reachable.
async function fetchBlueskyPosts(query) {
  const url =
    'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?limit=' +
    BLUESKY_PER_PAGE + '&sort=latest&q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'User-Agent': 'dev-feedback-refresh/1.0' } });
  if (!res.ok) throw new Error(`Bluesky ${res.status} for "${query}"`);
  const json = await res.json();
  return Array.isArray(json.posts) ? json.posts : [];
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

  // --- GitHub issues in third-party integration repos mentioning the provider ---
  for (const sc of cfg.githubScopedQueries || []) {
    try {
      const items = await fetchGithubScopedIssues(sc.repo, sc.term, sinceDate);
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

  // --- Stack Exchange network (public API; no auth) ---
  const seSites = cfg.stackSites && cfg.stackSites.length ? cfg.stackSites : ['stackoverflow'];
  for (const site of seSites) {
    for (const q of cfg.queries) {
      try {
        const questions = await fetchStackOverflowQuestions(q, sinceUnix, site);
        for (const item of questions) {
          if (!item.link) continue;
          candidates.push({
            text: stripHtml(`${item.title || ''}. ${item.body || ''}`),
            sourceUrl: item.link,
            source: SE_SITE_SOURCE[site] || 'stackoverflow',
            author: item.owner && item.owner.display_name ? item.owner.display_name : null,
            dateISO: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : null,
          });
        }
      } catch (err) {
        console.warn(`  [warn] ${err.message}`);
      }
    }
  }

  // --- Official status page incident history (Atom; verified downtime) ---
  if (cfg.statuspageAtom) {
    try {
      const entries = await fetchStatuspageAtom(cfg.statuspageAtom);
      for (const e of entries) {
        const createdUnix = e.updated ? Math.floor(new Date(e.updated).getTime() / 1000) : 0;
        if (createdUnix < sinceUnix) continue;
        candidates.push({
          text: stripHtml([e.title, e.content].filter(Boolean).join('. ')),
          sourceUrl: e.link,
          source: 'statuspage',
          author: null,
          dateISO: e.updated || null,
          statuspage: true,
        });
      }
    } catch (err) {
      console.warn(`  [warn] ${err.message}`);
    }
  }

  // --- Discourse community forums (public search.json; no auth) ---
  for (const host of cfg.discourseHosts || []) {
    for (const q of cfg.queries) {
      try {
        const rows = await fetchDiscoursePosts(host, q);
        for (const row of rows) {
          const p = row.post;
          const createdUnix = p.created_at ? Math.floor(new Date(p.created_at).getTime() / 1000) : 0;
          if (createdUnix < sinceUnix) continue;
          const permalink = row.slug
            ? `https://${row.host}/t/${row.slug}/${p.topic_id}`
            : `https://${row.host}/t/${p.topic_id}`;
          candidates.push({
            text: stripHtml(`${row.title}. ${p.blurb || ''}`),
            sourceUrl: permalink,
            source: 'discourse',
            author: p.username || null,
            dateISO: p.created_at || null,
          });
        }
      } catch (err) {
        console.warn(`  [warn] ${err.message}`);
      }
    }
  }

  // --- DEV Community / Forem (public articles API; no auth) ---
  for (const tag of cfg.devtoTags || []) {
    try {
      const articles = await fetchDevtoArticles(tag);
      for (const a of articles) {
        if (!a.url) continue;
        const createdUnix = a.published_at ? Math.floor(new Date(a.published_at).getTime() / 1000) : 0;
        if (createdUnix < sinceUnix) continue;
        candidates.push({
          text: stripHtml(`${a.title || ''}. ${a.description || ''}`),
          sourceUrl: a.url,
          source: 'devto',
          author: a.user && a.user.username ? a.user.username : null,
          dateISO: a.published_at || null,
        });
      }
    } catch (err) {
      console.warn(`  [warn] ${err.message}`);
    }
  }

  // --- Bluesky (public AppView; opt-in via ENABLE_BLUESKY=1) ---
  if (ENABLE_BLUESKY) {
    for (const q of cfg.queries) {
      try {
        const posts = await fetchBlueskyPosts(q);
        for (const p of posts) {
          if (!p.uri) continue;
          const createdUnix = p.indexedAt ? Math.floor(new Date(p.indexedAt).getTime() / 1000) : 0;
          if (createdUnix < sinceUnix) continue;
          const handle = p.author && p.author.handle ? p.author.handle : null;
          const rkey = String(p.uri).split('/').pop();
          if (!handle || !rkey) continue;
          candidates.push({
            text: stripHtml((p.record && p.record.text) || ''),
            sourceUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
            source: 'bluesky',
            author: handle,
            dateISO: p.indexedAt || (p.record && p.record.createdAt) || null,
          });
        }
      } catch (err) {
        console.warn(`  [warn] ${err.message}`);
      }
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

    // Status-page incidents are provider-confirmed downtime, so they bypass the
    // negative-cue proximity test and are stored as verified items.
    let verdict;
    let verified = false;
    let sentiment = 'negative';
    if (cand.statuspage) {
      verdict = { snippet: text, category: 'downtime' };
      verified = true;
    } else {
      verdict = cand.repoScoped ? analyzeRepoIssue(text) : analyze(text, cfg.nameCues);
    }
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
      sentiment,
      author_handle: cand.author || null,
      source: cand.source,
      source_url: cand.sourceUrl,
      corroborating_urls: [],
      date: cand.dateISO ? new Date(cand.dateISO).toISOString().slice(0, 10) : null,
      verified,
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

// --- Keep DATA_SOURCES_SUMMARY.{md,docx} in sync with the live data ----------
// Recomputes the volatile counts straight from data/*.json, rewrites the marked
// blocks in the Markdown, then rebuilds the Word .docx (Windows only). The
// hand-written narrative is left untouched — only the auto-stats markers move.
const ROOT_DIR = path.join(__dirname, '..');
const SUMMARY_MD = path.join(ROOT_DIR, 'DATA_SOURCES_SUMMARY.md');
// data/ artifacts kept in step with the live data (computed, not hand-curated).
const SUMMARY_JSON = path.join(DATA_DIR, 'summary.json');
const WEEKLY_MD = path.join(DATA_DIR, 'weekly-summary.md');
// Provider display order + the JSON file each lives in (mirrors PROVIDERS).
const DOC_SOURCE_LABELS = { hackernews: 'Hacker News', github: 'GitHub issues', reddit: 'Reddit', stackoverflow: 'Stack Overflow', serverfault: 'serverfault', 'devops-stackexchange': 'devops-stackexchange', 'ai-stackexchange': 'AI Stack Exchange', superuser: 'Super User', discourse: 'Community Forum', devto: 'DEV Community', bluesky: 'Bluesky', statuspage: 'Status page' };

function replaceBetween(text, startMarker, endMarker, replacement) {
  const rx = new RegExp(
    `(${startMarker}\\r?\\n)[\\s\\S]*?(\\r?\\n${endMarker})`,
  );
  if (!rx.test(text)) return text;
  return text.replace(rx, `$1${replacement}$2`);
}

function computeDocStats() {
  let total = 0;
  const curatedByProvider = []; // { provider, count } in PROVIDERS order
  const autoBySource = {};
  for (const cfg of PROVIDERS) {
    let curated = 0;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, cfg.file), 'utf8'));
      const complaints = Array.isArray(data.complaints) ? data.complaints : [];
      for (const c of complaints) {
        total += 1;
        if (c.auto_collected) {
          autoBySource[c.source] = (autoBySource[c.source] || 0) + 1;
        } else {
          curated += 1;
        }
      }
    } catch (_) {
      /* missing/unreadable provider file — skip it */
    }
    if (curated > 0) curatedByProvider.push({ provider: cfg.provider, count: curated });
  }
  const curatedTotal = curatedByProvider.reduce((s, p) => s + p.count, 0);
  const autoTotal = Object.values(autoBySource).reduce((s, n) => s + n, 0);
  return { total, curatedTotal, autoTotal, curatedByProvider, autoBySource };
}

function buildCountsSentence(stats) {
  const curatedList = stats.curatedByProvider
    .map((p) => `${p.count} ${p.provider}`)
    .join(', ');
  const sourceOrder = ['statuspage', 'hackernews', 'github', 'stackoverflow', 'serverfault', 'devops-stackexchange', 'ai-stackexchange', 'superuser', 'reddit', 'discourse', 'devto', 'bluesky'];
  const autoList = Object.keys(stats.autoBySource)
    .sort((a, b) => {
      const ia = sourceOrder.indexOf(a);
      const ib = sourceOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((s) => `${stats.autoBySource[s]} from ${DOC_SOURCE_LABELS[s] || s}`)
    .join(', ');
  const curatedPart = curatedList ? ` (${curatedList})` : '';
  const autoPart = autoList ? ` (${autoList})` : '';
  return (
    `It currently displays **${stats.total} items** — ` +
    `**${stats.curatedTotal} hand-curated**${curatedPart} plus ` +
    `**${stats.autoTotal} auto-collected**${autoPart}. ` +
    `Every item is linked to its original public source.`
  );
}

function regenerateDoc() {
  let md;
  try {
    md = fs.readFileSync(SUMMARY_MD, 'utf8');
  } catch (_) {
    return; // no summary file to maintain
  }
  const stats = computeDocStats();
  const today = new Date().toISOString().slice(0, 10);
  md = replaceBetween(md, '<!-- AUTOSTATS:DATE:START -->', '<!-- AUTOSTATS:DATE:END -->', `_As of ${today}_`);
  md = replaceBetween(md, '<!-- AUTOSTATS:COUNTS:START -->', '<!-- AUTOSTATS:COUNTS:END -->', buildCountsSentence(stats));
  fs.writeFileSync(SUMMARY_MD, md, 'utf8');
  console.log(`[refresh] summary updated — ${stats.total} items (${stats.curatedTotal} curated, ${stats.autoTotal} auto).`);

  if (process.platform !== 'win32') return; // .docx rebuild needs PowerShell
  // Rebuild every tracked Markdown -> Word .docx pair so no doc file drifts from
  // its source Markdown when the data (and therefore the summary) changes.
  const DOCX_PAIRS = [
    { in: 'DATA_SOURCES_SUMMARY.md', out: 'DATA_SOURCES_SUMMARY.docx' },
    { in: path.join('workflow', 'WORKFLOW.md'), out: path.join('workflow', 'WORKFLOW.docx') },
  ];
  for (const pair of DOCX_PAIRS) {
    if (!fs.existsSync(path.join(ROOT_DIR, pair.in))) continue; // only rebuild docs that exist
    try {
      const { spawnSync } = require('child_process');
      const r = spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
          path.join(__dirname, 'md-to-docx.ps1'),
          '-In', pair.in, '-Out', pair.out],
        { cwd: ROOT_DIR, encoding: 'utf8' },
      );
      if (r.status === 0) console.log(`[refresh] ${pair.out} rebuilt.`);
      else console.warn(`  [warn] ${pair.out} rebuild skipped (PowerShell exit ${r.status}).`);
    } catch (err) {
      console.warn(`  [warn] ${pair.out} rebuild skipped: ${err.message}`);
    }
  }
}

// Render a counts object ({ key: n }) as a "key n · key n" string, largest first.
function fmtCounts(obj, limit) {
  const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const use = limit ? entries.slice(0, limit) : entries;
  return use.map(([k, v]) => `${k} ${v}`).join(' · ') || '—';
}

// Regenerate the computed data/ artifacts so they never drift from the live data:
//  - data/summary.json      -> full stats snapshot, identical to /api/summary
//  - data/weekly-summary.md  -> only the marked LIVE snapshot block is rewritten;
//                               the hand-curated narrative + bias flags are preserved.
function regenerateSummaries() {
  let store;
  try {
    const { createStore } = require('../backend/store');
    store = createStore({ dataDir: DATA_DIR });
    store.load();
  } catch (err) {
    console.warn(`  [warn] summary regen skipped: ${err.message}`);
    return;
  }
  const s = store.summary();
  const stats = computeDocStats();
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  // Deterministic "top issues": the 5 most recent dated complaint/feature_request items.
  const topIssues = store
    .all()
    .filter((it) => it.feedback_type === 'complaint' || it.feedback_type === 'feature_request')
    .filter((it) => it.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 5)
    .map((it) => ({
      id: it.id,
      provider: it.provider,
      feedback_type: it.feedback_type,
      category: it.category,
      summary: it.summary,
      source_url: it.source_url,
      date: it.date,
    }));

  const summaryJson = {
    generated_at: nowIso,
    note:
      'Auto-generated from the live normalized data in data/ by tools/refresh.js; ' +
      'computed figures match /api/summary. Includes auto-collected items (verified:false). ' +
      'top_issues = the 5 most recent dated complaint/feature_request items.',
    total: s.total,
    curated_total: stats.curatedTotal,
    auto_collected_total: stats.autoTotal,
    by_platform: s.by_platform,
    by_feedback_type: s.by_feedback_type,
    by_category: s.by_category,
    by_sentiment: s.by_sentiment,
    by_source: s.by_source,
    trend_by_month: s.trend_by_month,
    undated_count: s.undated_count,
    top_issues: topIssues,
  };
  try {
    fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summaryJson, null, 2) + '\n', 'utf8');
    console.log(`[refresh] data/summary.json updated — ${s.total} items.`);
  } catch (err) {
    console.warn(`  [warn] summary.json write skipped: ${err.message}`);
  }

  // weekly-summary.md: refresh only the marked LIVE snapshot; leave the curated
  // narrative (with its bias flags) intact.
  try {
    let md = fs.readFileSync(WEEKLY_MD, 'utf8');
    const live =
      `_Live snapshot — auto-updated by tools/refresh.js as of ${today}:_\n\n` +
      `- **Total items tracked:** ${s.total} (${stats.curatedTotal} hand-curated + ${stats.autoTotal} auto-collected; all auto items \`verified: false\`)\n` +
      `- **By platform:** ${fmtCounts(s.by_platform)}\n` +
      `- **By feedback type:** ${fmtCounts(s.by_feedback_type)}\n` +
      `- **By category (top 6):** ${fmtCounts(s.by_category, 6)}\n` +
      `- **By sentiment:** ${fmtCounts(s.by_sentiment)}\n\n` +
      `_The curated deep-dive below covers the initial hand-reviewed sample and is intentionally narrower than these live totals._`;
    if (md.includes('<!-- AUTOSTATS:LIVE:START -->')) {
      md = replaceBetween(md, '<!-- AUTOSTATS:LIVE:START -->', '<!-- AUTOSTATS:LIVE:END -->', live);
      fs.writeFileSync(WEEKLY_MD, md, 'utf8');
      console.log('[refresh] data/weekly-summary.md live snapshot updated.');
    } else {
      console.warn('  [warn] weekly-summary.md has no AUTOSTATS:LIVE markers — skipped.');
    }
  } catch (err) {
    console.warn(`  [warn] weekly-summary.md update skipped: ${err.message}`);
  }
}

async function main() {
  if (typeof fetch !== 'function') {
    console.error('global fetch is unavailable; Node 18+ is required.');
    process.exit(1);
  }
  const sinceUnix = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  const sources = ['Hacker News', 'GitHub', 'Stack Exchange', 'Discourse', 'Dev.to', 'Status pages'];
  if (ENABLE_BLUESKY) sources.push('Bluesky');
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

  // Keep the data-sources summary (md + docx) in step with the live data.
  regenerateDoc();
  // Keep the computed data/ summaries (summary.json + weekly-summary.md) in step.
  regenerateSummaries();
}

main().catch((err) => {
  console.error('[refresh] failed:', err);
  process.exit(1);
});
