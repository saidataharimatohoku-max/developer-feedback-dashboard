---
name: openai-complaints
description: 'Collect, refresh, and summarize PUBLICLY available developer feedback and complaints about the OpenAI API (api.openai.com) — OpenAI''s hosted inference API for chat/Responses, embeddings, audio (Whisper/TTS), images, and the Realtime API. Use when building or updating the developer-complaints website, researching OpenAI API reliability, latency/timeouts, downtime/outages, rate limits & usage tiers, pricing/billing, model quality/behavior changes, SDK/API breaking changes, or docs issues. Gathers public posts from the official GitHub SDK repos (openai/openai-python, openai/openai-node), Hacker News, OpenAI''s status page, Reddit, and the community forum, deduplicates them, categorizes by issue type, attributes every item to a source URL, and outputs BOTH structured JSON and Markdown. Public sources only; cite every claim.'
argument-hint: 'Optional: time window (e.g. "last 90 days") or category (e.g. "rate_limits")'
---

# OpenAI API — Public Developer Complaints Collector

## When to Use
- Building or refreshing the developer-complaints website with OpenAI data.
- Researching what developers publicly report about the OpenAI API: the Chat Completions / Responses API, embeddings, audio (Whisper / TTS), images, the Realtime API, the official Python/Node SDKs, AzureOpenAI usage, rate limits and usage tiers, latency/timeouts, downtime, pricing/billing, model behavior changes, API/version changes, and documentation.
- Producing a structured dataset (JSON) plus a human-readable report (Markdown).

## Scope & Guardrails (read first)
- **Public sources only.** Only collect information that is already publicly visible. Never scrape private channels, paywalled content, or anything behind authentication.
- **Respect each site's Terms of Service and `robots.txt`.** Prefer official APIs/RSS where available; rate-limit requests; do not bulk-scrape aggressively.
- **Attribute everything.** Every complaint MUST include a working `source_url`. No source = do not include it.
- **No defamation.** Present items as *user-reported* opinions/experiences, never as stated fact. Use phrasing like "a developer reported…". Do not include personal data (names, emails) beyond a public handle.
- **Mark confidence.** Set `verified: true` only when corroborated by an official source (OpenAI status page / changelog) or multiple independent sources; otherwise `false`.
- **Disambiguate "OpenAI."** "OpenAI" alone pulls in endless company/funding/news chatter. ONLY include items that clearly reference the **OpenAI API / developer platform**. Anchor matches to specific identifiers: the phrase **"OpenAI API"**, **api.openai.com**, the **openai-python** / **openai-node** SDKs, **AzureOpenAI**, or API surface terms like **chat.completions** and **Responses API**. Discard general ChatGPT-product or corporate-news chatter that isn't about the API.

## Approved Public Sources
1. **GitHub** — Issues/Discussions in the official `openai/openai-python` and `openai/openai-node` repos (where developers file genuine API/SDK bugs and feature requests), and other public repos that reference the OpenAI API in issues.
2. **Hacker News** — Algolia HN Search (`https://hn.algolia.com/`) for "OpenAI API", "OpenAI API rate limit", "OpenAI API down".
3. **OpenAI status page** — `https://status.openai.com/` incidents and uptime history for confirmed outages/degradations.
4. **Reddit** — r/OpenAI, r/LocalLLaMA, r/MachineLearning search for "OpenAI API".
5. **OpenAI community forum** — `https://community.openai.com/` (API category) public threads.
6. **Official docs / changelog** — `https://platform.openai.com/docs` and the API changelog for confirmed changes, deprecations, and known issues.
7. **X (Twitter)** — public posts mentioning "OpenAI API".

## Issue Categories (use these exact values)
`latency` · `downtime` · `billing` · `rate_limits` · `model_quality` · `api_change` · `support` · `docs` · `pricing` · `other`

> Note: map common OpenAI themes as follows — API/ChatGPT incidents on the status page → `downtime`; 429s, per-minute caps, usage-tier limits → `rate_limits`; SDK/API breaking changes (e.g. auth header or version regressions) → `api_change`; token/credit-cost and price-hike concerns → `pricing`; usage-tier/credit/billing friction → `billing`; model behavior/quality regressions → `model_quality`; streaming/connection/SDK bugs → `other`.

## Procedure
1. Determine the **time window** and optional **category** filter from the user's argument (default: last 180 days, all categories).
2. Search each approved source for product-specific mentions (see the disambiguation rule) that describe a problem or complaint.
3. For each candidate item, capture: the quoted/summarized complaint, source URL, date, author handle (if public), category, and sentiment.
4. **Deduplicate** items that describe the same incident — keep one canonical entry and list extra source URLs under `corroborating_urls`.
5. Set `verified` per the guardrails above.
6. Emit **both** outputs exactly as defined in [output-formats](./references/output-formats.md):
   - `openai-complaints.json`
   - `openai-complaints.md`
7. End with a short summary: total items, breakdown by category, and date range covered.

## Output
Produce both files following [output-formats](./references/output-formats.md). The `provider` field is always `"OpenAI"`.
