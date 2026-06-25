---
name: fireworks-ai-complaints
description: 'Collect, refresh, and summarize PUBLICLY available developer feedback and complaints about Fireworks AI (the LLM/inference API provider). Use when building or updating the developer-complaints website, researching Fireworks AI reliability, latency, downtime, billing, rate limits, model quality, or support issues. Gathers public posts from Reddit, Hacker News, GitHub issues/discussions, the official status page, Trustpilot/G2, and X, deduplicates them, categorizes by issue type, attributes every item to a source URL, and outputs BOTH structured JSON and Markdown. Public sources only; cite every claim.'
argument-hint: 'Optional: time window (e.g. "last 90 days") or category (e.g. "billing")'
---

# Fireworks AI — Public Developer Complaints Collector

## When to Use
- Building or refreshing the developer-complaints website with Fireworks AI data.
- Researching what developers publicly report about Fireworks AI: latency, downtime, rate limits, billing, model accuracy/quality, API changes, support responsiveness.
- Producing a structured dataset (JSON) plus a human-readable report (Markdown).

## Scope & Guardrails (read first)
- **Public sources only.** Only collect information that is already publicly visible. Never scrape private channels, paywalled content, or anything behind authentication.
- **Respect each site's Terms of Service and `robots.txt`.** Prefer official APIs/RSS where available; rate-limit requests; do not bulk-scrape aggressively.
- **Attribute everything.** Every complaint MUST include a working `source_url`. No source = do not include it.
- **No defamation.** Present items as *user-reported* opinions/experiences, never as stated fact. Use phrasing like "a user reported…". Do not include personal data (names, emails) beyond a public handle.
- **Mark confidence.** Set `verified: true` only when corroborated by an official status page or multiple independent sources; otherwise `false`.

## Approved Public Sources
1. **Reddit** — r/LocalLLaMA, r/MachineLearning, r/OpenAI, general search for "Fireworks AI".
2. **Hacker News** — Algolia HN Search (`https://hn.algolia.com/`) for "Fireworks AI".
3. **GitHub** — Issues/Discussions in `fw-ai` / Fireworks repos and in projects that depend on Fireworks (search "fireworks" in issues).
4. **Official status page / changelog** — for confirmed incidents and downtime.
5. **Trustpilot / G2 / Capterra** — public reviews.
6. **X (Twitter)** — public posts mentioning @FireworksAI_HQ / "Fireworks AI".
7. **Dev blogs / forum threads** that are publicly indexed.

## Issue Categories (use these exact values)
`latency` · `downtime` · `billing` · `rate_limits` · `model_quality` · `api_change` · `support` · `docs` · `pricing` · `other`

## Procedure
1. Determine the **time window** and optional **category** filter from the user's argument (default: last 180 days, all categories).
2. Search each approved source for "Fireworks AI" mentions that describe a problem or complaint.
3. For each candidate item, capture: the quoted/summarized complaint, source URL, date, author handle (if public), category, and sentiment.
4. **Deduplicate** items that describe the same incident (e.g., a status-page outage echoed across Reddit/X) — keep one canonical entry and list extra source URLs under `corroborating_urls`.
5. Set `verified` per the guardrails above.
6. Emit **both** outputs exactly as defined in [output-formats](./references/output-formats.md):
   - `fireworks-ai-complaints.json`
   - `fireworks-ai-complaints.md`
7. End with a short summary: total items, breakdown by category, and date range covered.

## Output
Produce both files following [output-formats](./references/output-formats.md). The `provider` field is always `"Fireworks AI"`.
