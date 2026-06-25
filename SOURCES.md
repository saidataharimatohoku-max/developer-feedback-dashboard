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
- **NOT yet wired:** Reddit, X (Twitter), Discord, GitHub issues/discussions, status pages, Trustpilot/G2.
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
| **Official status pages / changelogs** | Both (each provider's status page + changelog) | RSS/Atom feed where offered; otherwise public HTML | No | N/A (polite polling, e.g. every 5–15 min) | Public; use RSS/Atom if available; light polling only | Together: `https://status.together.ai/` · Fireworks: `https://status.fireworks.ai/` (poll RSS/Atom or incident JSON if exposed) | summary, original_text, source_url, date, (category=downtime, verified=true) |
| **Trustpilot / G2 / Capterra** | Both (where a provider profile exists) | Public review pages (HTML); official partner/review APIs are paid/gated | No (read) — API tiers require auth | Polite crawl; avoid aggressive scraping | Check each site's `robots.txt` and ToS — several restrict automated scraping; prefer official API if available | Trustpilot: `https://www.trustpilot.com/review/together.ai` · G2: provider category/profile search | summary, original_text, source_url, date, author_handle, sentiment |
| **X (Twitter)** | Together AI: official handle **@togethercompute**; Fireworks AI: official handle + "Fireworks AI" mentions | Official X API v2 (search/recent) | Yes (Bearer token / paid tier) | Free tier very limited; recent-search needs Basic+ paid tier | API access constrained and metered; scraping the site violates ToS — use official API only | `https://api.twitter.com/2/tweets/search/recent?query=%22Together%20AI%22%20OR%20from%3Atogethercompute` (and analogous for Fireworks) | summary, original_text, source_url, date, author_handle, sentiment |

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
