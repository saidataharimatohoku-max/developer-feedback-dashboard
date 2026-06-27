---
name: azure-machine-learning-complaints
description: 'Collect, refresh, and summarize PUBLICLY available developer feedback and complaints about Azure Machine Learning (Azure ML / AzureML) — Microsoft''s managed ML platform for model training and managed online endpoints (inference). Use when building or updating the developer-complaints website, researching Azure ML reliability, training/compute, managed endpoints, latency, downtime, billing/cost, quotas/GPU availability, SDK/API changes, pipelines, or support issues. Gathers public posts from Reddit, Hacker News, GitHub issues/discussions (the Azure/azureml-examples and Azure/MachineLearningNotebooks repos), the official docs/release notes, Trustpilot/G2, and X, deduplicates them, categorizes by issue type, attributes every item to a source URL, and outputs BOTH structured JSON and Markdown. Public sources only; cite every claim.'
argument-hint: 'Optional: time window (e.g. "last 90 days") or category (e.g. "downtime")'
---

# Azure Machine Learning — Public Developer Complaints Collector

## When to Use
- Building or refreshing the developer-complaints website with Azure Machine Learning data.
- Researching what developers publicly report about Azure ML: training jobs and compute clusters, managed online/batch endpoints, GPU availability and quotas, pipelines, the Python SDK (v1/v2) and CLI, model registry, latency, downtime, billing/cost, API/version changes, support responsiveness, documentation.
- Producing a structured dataset (JSON) plus a human-readable report (Markdown).

## Scope & Guardrails (read first)
- **Public sources only.** Only collect information that is already publicly visible. Never scrape private channels, paywalled content, or anything behind authentication.
- **Respect each site's Terms of Service and `robots.txt`.** Prefer official APIs/RSS where available; rate-limit requests; do not bulk-scrape aggressively.
- **Attribute everything.** Every complaint MUST include a working `source_url`. No source = do not include it.
- **No defamation.** Present items as *user-reported* opinions/experiences, never as stated fact. Use phrasing like "a user reported…". Do not include personal data (names, emails) beyond a public handle.
- **Mark confidence.** Set `verified: true` only when corroborated by an official source (Azure status / release notes) or multiple independent sources; otherwise `false`.
- **Disambiguate "Azure ML."** "ML" alone is generic. ONLY include items that clearly reference *Azure Machine Learning*. Anchor matches to specific identifiers: the phrase **"Azure Machine Learning"**, **"Azure ML"** / **"AzureML"**, the **Azure/azureml-examples** and **Azure/MachineLearningNotebooks** GitHub repos, and Azure ML-specific phrases like **"managed online endpoint"**, **"AML compute"**, or **"Azure ML Studio"**. Discard generic "ml" chatter.

## Approved Public Sources
1. **Reddit** — r/AZURE, r/MachineLearning, r/datascience, general search for "Azure Machine Learning" / "Azure ML".
2. **Hacker News** — Algolia HN Search (`https://hn.algolia.com/`) for "Azure Machine Learning".
3. **GitHub** — Issues/Discussions in the official `Azure/azureml-examples` and `Azure/MachineLearningNotebooks` repos (where users file Azure ML bugs/feature requests), and projects that reference Azure ML in issues.
4. **Official docs / release notes** — `learn.microsoft.com/azure/machine-learning` and the Azure ML release notes/changelog for confirmed changes, known issues, and incidents.
5. **Trustpilot / G2 / Capterra** — public reviews.
6. **X (Twitter)** — public posts mentioning "Azure Machine Learning" / "Azure ML".
7. **Dev blogs / forum threads** that are publicly indexed.

## Issue Categories (use these exact values)
`latency` · `downtime` · `billing` · `rate_limits` · `model_quality` · `api_change` · `support` · `docs` · `pricing` · `other`

> Note: map common Azure ML themes as follows — endpoint/service outages → `downtime`; quotas/GPU-capacity/compute limits → `rate_limits`; SDK/CLI/API (v1→v2) breaking changes → `api_change`; cost/SKU surprises → `billing`/`pricing`; training-job/pipeline/compute friction → `other`.

## Procedure
1. Determine the **time window** and optional **category** filter from the user's argument (default: last 180 days, all categories).
2. Search each approved source for product-specific mentions (see the disambiguation rule) that describe a problem or complaint.
3. For each candidate item, capture: the quoted/summarized complaint, source URL, date, author handle (if public), category, and sentiment.
4. **Deduplicate** items that describe the same incident — keep one canonical entry and list extra source URLs under `corroborating_urls`.
5. Set `verified` per the guardrails above.
6. Emit **both** outputs exactly as defined in [output-formats](./references/output-formats.md):
   - `azure-machine-learning-complaints.json`
   - `azure-machine-learning-complaints.md`
7. End with a short summary: total items, breakdown by category, and date range covered.

## Output
Produce both files following [output-formats](./references/output-formats.md). The `provider` field is always `"Azure Machine Learning"`.
