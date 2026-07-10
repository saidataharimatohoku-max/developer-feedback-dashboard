# Public Developer-Feedback Sources — Together AI & Fireworks AI

> **Documentation only.** This file is a *reference* for future data collection. The MVP does **not** call, scrape, or connect to any source described here. At MVP time, the only data loaded is the Hacker News–derived sample in [data/together-ai-complaints.json](data/together-ai-complaints.json) and [data/fireworks-ai-complaints.json](data/fireworks-ai-complaints.json).

## Guardrails

These rules apply to every source listed below and to any future collector that reads them:

- **Public sources only.** Never scrape private channels, paywalled, or authenticated-only content. Prefer official APIs / RSS over HTML scraping.
- **Respect ToS and `robots.txt`.** Rate-limit requests; do not bulk-scrape aggressively.
- **Cite every claim.** Every record MUST carry a working `source_url`. No source = not included.
- **User-reported phrasing.** Present items as *user-reported* experiences ("a user reported…"), never as stated fact. No defamation.
- **No PII.** Only a public author handle may be stored — no names, emails, or other personal data.
- **Verified flag.** Set `verified: true` only when corroborated by an official status page or multiple independent sources; otherwise `false`.

## Current MVP status

- **Loaded now:** Hacker News (Algolia) sample data only, for both providers.
- **NOT yet wired:** X (Twitter), Discord, Trustpilot/G2, Microsoft Q&A. **Now wired live** (no auth): Hacker News, GitHub issues, Stack Exchange, **Discourse community forums** (OpenAI), and **DEV Community / dev.to**. Reddit is wired but only runs when free OAuth credentials are present.
- During the sample run, Reddit's public `search.json` returned **HTTP 403** to the automated request and was excluded. See note in [data/together-ai-complaints.json](data/together-ai-complaints.json).

> **Phase 1 (current):** the dashboard and its charts run **local-only** and read **exclusively** from the pre-collected `data/*.json` files. **Hacker News (Algolia API) is NOT implemented as a live source in Phase 1** — it is documented here and can be considered later as the first **real** source to wire in (it needs no auth and has a generous rate limit, making it the recommended starting point for a future phase). No live HN calls, scraping, or other network requests are made by the MVP.

## Canonical schema fields

Each source row below maps to the canonical feedback schema:

`summary` · `original_text` · `source_url` · `date` · `author_handle` · `category` · `sentiment`

(In the current sample JSON these correspond to `complaint` → summary, `quote` → original_text, plus `source_url`, `date`, `author_handle`, `category`, `sentiment`, and a `verified` flag.)

## Sources

| Source | Provider coverage | Access method | Auth required | Rate limit | ToS / robots notes | Example query | Schema fields it can populate |
|---|---|---|---|---|---|---|---|
| **Hacker News (Algolia API)** | Both (Together AI, Fireworks AI) | Official Algolia search REST API — **works without auth** (source of current sample data) | No | ~10,000 requests/hour/IP (generous; unauthenticated) | Public, documented API intended for programmatic use; respect rate limits | `https://hn.algolia.com/api/v1/search?query=Together%20AI&tags=(story,comment)&hitsPerPage=50` and `...?query=Fireworks%20AI&tags=(story,comment)&hitsPerPage=50` | summary, original_text, source_url, date, author_handle, (category & sentiment derived) |
| **Reddit** | Both | Official Reddit Data API (OAuth2) recommended. Public `search.json` endpoint **returned HTTP 403** to automated requests (observed) | Yes (OAuth2 app + token) for reliable access | 100 queries/min per OAuth client (free tier); strict on unauthenticated | API Terms require registered app; unauthenticated JSON access blocked/403; respect `robots.txt` | OAuth: `https://oauth.reddit.com/search?q=%22Together%20AI%22&sort=new&limit=50` (e.g., r/LocalLLaMA, r/MachineLearning, r/OpenAI) | summary, original_text, source_url, date, author_handle, (category & sentiment derived) |
| **GitHub issues/discussions** | Both — e.g. `togethercomputer` org repos for Together AI; Fireworks SDK repos; plus third-party repos mentioning either provider | REST API v3 / GraphQL v4; or Search API for issues/discussions | Token recommended (PAT/GitHub App) | Unauthenticated: 60 req/hr. Authenticated: 5,000 req/hr (REST); Search API: 30 req/min | Public API; respect secondary rate limits and abuse detection; ToS permits API use | `https://api.github.com/search/issues?q=%22together.ai%22+in:title,body+is:issue` and `...q=%22fireworks.ai%22+...` | summary, original_text, source_url, date, author_handle, (category derived) |
| **Official status pages / changelogs** | OpenAI (Atom, wired); Together / Fireworks (no Atom) | Atlassian **Statuspage** exposes an unauthenticated **`<host>/history.atom`** incident feed. **Wired live** in [tools/refresh.js](tools/refresh.js) for OpenAI (`statuspageAtom`); each `<entry>` is a provider-confirmed incident stored as a **`verified: true`** downtime item. Together's (`status.together.ai`) and Fireworks' (`status.fireworks.ai`) pages are SPAs with **no Atom feed** (probed 2026-07-06 → HTML), so they are not wired | No | Polite polling (once/day) | Public feed; cite each incident URL; verified downtime | `https://status.openai.com/history.atom` | summary/original_text (incident title + body), source_url (incident URL), date (updated), category=downtime, **verified=true** |
| **Third-party integration repos** (GitHub, scoped) | Together AI, Fireworks AI, OpenAI | Public GitHub issue search **scoped to a repo + provider term** (e.g. `repo:langchain-ai/langchain "fireworks"`). **Wired live** in [tools/refresh.js](tools/refresh.js) (`githubScopedQueries`): LangChain for all three, plus LlamaIndex and Vercel AI SDK for OpenAI. Catches real provider bugs users file against integration libraries | Token recommended (same 60/hr unauth limit as other GitHub search) | Public API; respect secondary rate limits | `https://api.github.com/search/issues?q=repo:langchain-ai/langchain+%22fireworks%22+in:title,body+type:issue` | summary, original_text, source_url, date, author_handle, (category & sentiment derived) |
| **Trustpilot / G2 / Capterra** | Both (where a provider profile exists) | Public review pages (HTML); official partner/review APIs are paid/gated | No (read) — API tiers require auth | Polite crawl; avoid aggressive scraping | Check each site's `robots.txt` and ToS — several restrict automated scraping; prefer official API if available | Trustpilot: `https://www.trustpilot.com/review/together.ai` · G2: provider category/profile search | summary, original_text, source_url, date, author_handle, sentiment |
| **X (Twitter)** | Together AI: official handle **@togethercompute**; Fireworks AI: official handle + "Fireworks AI" mentions | Official X API v2 (search/recent) | Yes (Bearer token / paid tier) | Free tier very limited; recent-search needs Basic+ paid tier | API access constrained and metered; scraping the site violates ToS — use official API only | `https://api.twitter.com/2/tweets/search/recent?query=%22Together%20AI%22%20OR%20from%3Atogethercompute` (and analogous for Fireworks) | summary, original_text, source_url, date, author_handle, sentiment |
| **Stack Exchange network** (Stack Overflow, Server Fault, DevOps SE, **AI SE**, **Super User**) | Azure Kubernetes Service, Azure Machine Learning, Azure AI Foundry, OpenAI (Together AI / Fireworks AI / Tinker return no relevant results) | Official Stack Exchange REST API v2.3 — **works without auth**; wired via [tools/fetch-stackoverflow.js](tools/fetch-stackoverflow.js) and, for the daily run, [tools/refresh.js](tools/refresh.js) (`stackSites` per provider — OpenAI now also searches **`site=ai`**). AKS additionally pulls from **Server Fault** (`site=serverfault`) and **DevOps Stack Exchange** (`site=devops`) | No | ~300 requests/day/IP unauthenticated (10,000/day with a free key); honor `backoff` / `quota_remaining` | Public, documented API; cite each question `link`; store only the public owner display name | Tag (SO): `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&tagged=azure-aks&site=stackoverflow&filter=withbody` · Free-text (Server Fault): `...&q=azure%20kubernetes%20service&site=serverfault...` · AI SE: `...&site=ai...` | summary (title), original_text (body excerpt), source_url (question link), date, author_handle (owner), (category & sentiment derived) |
| **Discourse community forums** (e.g. OpenAI community forum) | OpenAI (any provider that runs a public Discourse instance) | Official Discourse **`search.json`** endpoint — **works without auth**; wired live in [tools/refresh.js](tools/refresh.js) (`discourseHosts` per provider). Topic slug is resolved from the response to build a stable permalink | No | Polite polling (once/day here); respect per-instance rate limits | Public, documented Discourse API; cite each post's topic URL; store only the public username | `https://community.openai.com/search.json?q=OpenAI%20API%20order%3Alatest` | summary (topic title), original_text (post blurb), source_url (topic permalink), date, author_handle (username), (category & sentiment derived) |
| **DEV Community / Forem (dev.to)** | OpenAI, Azure Kubernetes Service (any provider with a matching tag) | Official Forem **articles API** (`/api/articles?tag=`) — **works without auth**; wired live in [tools/refresh.js](tools/refresh.js) (`devtoTags` per provider). Article `description` is used as the snippet | No | ~unauthenticated is fine for a once-a-day run; send `Accept: application/vnd.forem.api-v1+json` | Public, documented Forem API; cite each article `url`; store only the public username. Mostly tutorial content, so few items pass the negative-cue filter (quality over quantity) | `https://dev.to/api/articles?tag=openai&per_page=30` | summary (title), original_text (description), source_url (article url), date (published_at), author_handle (username), (category & sentiment derived) |
| **Bluesky** | All providers | Public **AppView** post search (`app.bsky.feed.searchPosts`) — no auth. Wired in [tools/refresh.js](tools/refresh.js) but **opt-in** (`ENABLE_BLUESKY=1`) because `public.api.bsky.app` returned **HTTP 403** from this environment (WAF/proxy). Enable it wherever the host is reachable | No (public AppView) | Polite polling; respect returned rate-limit headers | Public API; cite each post permalink; store only the public handle | `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=OpenAI%20API&sort=latest&limit=25` | summary/original_text (post text), source_url (bsky.app permalink), date (indexedAt), author_handle (handle), (category & sentiment derived) |
| **Microsoft Q&A (learn.microsoft.com/answers)** | Azure services (AKS, Azure ML, Azure AI Foundry) | **No public RSS/Atom or unauthenticated API** as of 2026-06 — the tag pages (e.g. `…/answers/tags/164/azure-kubernetes-service`) are server-rendered HTML with no feed/API link. Would require fragile HTML scraping; **not wired**. | n/a | n/a | Prefer official API/RSS per guardrails — none offered, so excluded for now | Tag page (HTML only): `https://learn.microsoft.com/en-us/answers/tags/164/azure-kubernetes-service` | — (not collected) |

## Tested candidate sources — not usable without auth (2026-07-06)

These public sources were probed directly and are **not wired** because they do not
return usable data without authentication (or are blocked in this environment). They are
recorded here so the research isn't repeated:

| Source | Probe result | Verdict |
|---|---|---|
| **Bluesky** (`public.api.bsky.app`) | HTTP **403 Forbidden** from this network (WAF/proxy) | Legitimately no-auth normally — wired but **opt-in** (`ENABLE_BLUESKY=1`); enable where reachable |
| **Lobsters** (`lobste.rs/search.json`) | Returns the **HTML search page**, not JSON | No usable JSON full-text search — skip |
| **Mastodon** (`mastodon.social/api/v2/search?type=statuses`) | HTTP 200 but `statuses: []` | Unauthenticated full-text status search returns nothing — needs an app token; skip |
| **GitHub Discussions** | Discussions search requires the **GraphQL API (auth token)** | Not no-auth; revisit with a token |


## How the complaint skills feed this

The two workspace skills are the mechanism that will collect from the sources above and write the `data/*.json` (and `data/*.md`) files:

- [.github/skills/together-ai-complaints/SKILL.md](.github/skills/together-ai-complaints/SKILL.md)
- [.github/skills/fireworks-ai-complaints/SKILL.md](.github/skills/fireworks-ai-complaints/SKILL.md)

Each skill enumerates the same approved public sources, applies the guardrails (public-only, cite every `source_url`, user-reported phrasing, no PII, `verified` flag), deduplicates repeated incidents into a canonical record with `corroborating_urls`, categorizes each item, and emits the structured JSON plus a human-readable Markdown report. SOURCES.md is the access reference those skills follow when wiring up real collection.

## Recommended primary sources for the next phase

1. **Hacker News (Algolia API)** — already proven, no auth, high rate limit. Keep as the baseline collector.
2. **GitHub issues/discussions** — high-signal, well-structured, official API with a token; covers concrete bugs/regressions (`togethercomputer` org and SDK repos).
3. **Reddit (official OAuth API)** — strong developer-sentiment source, but **must** use the authenticated API (public `search.json` is 403-blocked).
4. **Official status pages/changelogs** — best for `verified: true` downtime/incident corroboration.

Secondary / lower-priority for later: Trustpilot/G2 (sparse, scraping-restricted) and X (auth-gated, metered).

### Additional no-auth sources now wired

- **Discourse community forums** (`search.json`) — live for the OpenAI community forum; add more via each provider's `discourseHosts` in [tools/refresh.js](tools/refresh.js).
- **DEV Community / dev.to** (Forem articles API) — live via per-provider `devtoTags`. Mostly tutorial content, so it contributes few but on-topic complaint items.
