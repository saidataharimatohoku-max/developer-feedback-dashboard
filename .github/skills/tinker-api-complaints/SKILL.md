---
name: tinker-api-complaints
description: 'Collect, refresh, and summarize PUBLICLY available developer feedback and complaints about Tinker API (the model fine-tuning/training API from Thinking Machines Lab, thinkingmachines.ai/tinker). Use when building or updating the developer-complaints website, researching Tinker reliability, latency, downtime, billing, rate limits, training/fine-tuning quality, onboarding/beta access, or support issues. Gathers public posts from Reddit, Hacker News, GitHub issues/discussions, the official docs/changelog, Trustpilot/G2, and X, deduplicates them, categorizes by issue type, attributes every item to a source URL, and outputs BOTH structured JSON and Markdown. Public sources only; cite every claim.'
argument-hint: 'Optional: time window (e.g. "last 90 days") or category (e.g. "support")'
---

# Tinker API — Public Developer Complaints Collector

## When to Use
- Building or refreshing the developer-complaints website with Tinker API data.
- Researching what developers publicly report about Tinker: latency, downtime, rate limits, billing, training/fine-tuning quality, API changes, beta/onboarding access, support responsiveness, documentation.
- Producing a structured dataset (JSON) plus a human-readable report (Markdown).

## Scope & Guardrails (read first)
- **Public sources only.** Only collect information that is already publicly visible. Never scrape private channels, paywalled content, or anything behind authentication.
- **Respect each site's Terms of Service and `robots.txt`.** Prefer official APIs/RSS where available; rate-limit requests; do not bulk-scrape aggressively.
- **Attribute everything.** Every complaint MUST include a working `source_url`. No source = do not include it.
- **No defamation.** Present items as *user-reported* opinions/experiences, never as stated fact. Use phrasing like "a user reported…". Do not include personal data (names, emails) beyond a public handle.
- **Mark confidence.** Set `verified: true` only when corroborated by an official source or multiple independent sources; otherwise `false`.
- **Disambiguate "Tinker."** "Tinker" is a very common English word (hardware boards, gaming, DIY). ONLY include items that clearly reference *this* product. Anchor matches to the product's own identifiers: the phrase **"Tinker API"**, **Thinking Machines**, the **thinkingmachines.ai** domain, the **thinking-machines-lab** GitHub org, the **tinker-cookbook** repo, or the **@tinkerapi** handle. Discard generic "tinker" chatter.

## Approved Public Sources
1. **Reddit** — r/LocalLLaMA, r/MachineLearning, general search for "Tinker API" / "Thinking Machines".
2. **Hacker News** — Algolia HN Search (`https://hn.algolia.com/`) for "Tinker API" / "Thinking Machines" / "thinkingmachines.ai".
3. **GitHub** — Issues/Discussions in the `thinking-machines-lab` org (e.g. `tinker`, `tinker-cookbook`) and in projects that depend on Tinker (search "thinkingmachines.ai" / "tinker-cookbook" in issues).
4. **Official docs / changelog** — `tinker-docs.thinkingmachines.ai` and `thinkingmachines.ai/tinker` for confirmed changes, limitations, and beta-access notes.
5. **Trustpilot / G2 / Capterra** — public reviews (if any).
6. **X (Twitter)** — public posts mentioning @tinkerapi / "Tinker API" / "Thinking Machines".
7. **Dev blogs / forum threads** that are publicly indexed.

## Issue Categories (use these exact values)
`latency` · `downtime` · `billing` · `rate_limits` · `model_quality` · `api_change` · `support` · `docs` · `pricing` · `other`

> Note: Tinker is a fine-tuning/training API, so `model_quality` covers training/fine-tuning result quality (e.g. LoRA results, reproducibility), and `support` covers private-beta onboarding/access friction.

## Procedure
1. Determine the **time window** and optional **category** filter from the user's argument (default: last 180 days, all categories).
2. Search each approved source for product-specific mentions (see the disambiguation rule) that describe a problem or complaint.
3. For each candidate item, capture: the quoted/summarized complaint, source URL, date, author handle (if public), category, and sentiment.
4. **Deduplicate** items that describe the same incident — keep one canonical entry and list extra source URLs under `corroborating_urls`.
5. Set `verified` per the guardrails above.
6. Emit **both** outputs exactly as defined in [output-formats](./references/output-formats.md):
   - `tinker-api-complaints.json`
   - `tinker-api-complaints.md`
7. End with a short summary: total items, breakdown by category, and date range covered.

## Output
Produce both files following [output-formats](./references/output-formats.md). The `provider` field is always `"Tinker API"`.
