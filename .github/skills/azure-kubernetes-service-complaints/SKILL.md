---
name: azure-kubernetes-service-complaints
description: 'Collect, refresh, and summarize PUBLICLY available developer feedback and complaints about Azure Kubernetes Service (AKS) — tracked as the self-hosted / do-it-yourself (DIY) way to run models, in contrast to managed inference APIs. Use when building or updating the developer-complaints website, researching AKS reliability, cluster/node upgrades, networking, scaling, latency, downtime, billing/cost, quotas, GPU availability, or support issues. Gathers public posts from Reddit, Hacker News, GitHub issues/discussions (the Azure/AKS repo), the official docs/release notes, Trustpilot/G2, and X, deduplicates them, categorizes by issue type, attributes every item to a source URL, and outputs BOTH structured JSON and Markdown. Public sources only; cite every claim.'
argument-hint: 'Optional: time window (e.g. "last 90 days") or category (e.g. "downtime")'
---

# Azure Kubernetes Service (DIY) — Public Developer Complaints Collector

## When to Use
- Building or refreshing the developer-complaints website with Azure Kubernetes Service data.
- Researching what developers publicly report about running their own models/workloads on AKS: cluster/node-pool upgrades, GPU availability and quotas, networking/CNI, autoscaling, latency, downtime, billing/cost, API/version changes, support responsiveness, documentation.
- Producing a structured dataset (JSON) plus a human-readable report (Markdown).

## Scope & Guardrails (read first)
- **Public sources only.** Only collect information that is already publicly visible. Never scrape private channels, paywalled content, or anything behind authentication.
- **Respect each site's Terms of Service and `robots.txt`.** Prefer official APIs/RSS where available; rate-limit requests; do not bulk-scrape aggressively.
- **Attribute everything.** Every complaint MUST include a working `source_url`. No source = do not include it.
- **No defamation.** Present items as *user-reported* opinions/experiences, never as stated fact. Use phrasing like "a user reported…". Do not include personal data (names, emails) beyond a public handle.
- **Mark confidence.** Set `verified: true` only when corroborated by an official source (Azure status / release notes) or multiple independent sources; otherwise `false`.
- **Disambiguate "AKS."** "AKS" alone is an ambiguous acronym (it appears inside unrelated words like "speaks"/"breaks" and other products). ONLY include items that clearly reference *Azure Kubernetes Service*. Anchor matches to specific identifiers: the phrase **"Azure Kubernetes Service"**, the **Azure/AKS** GitHub repo, and AKS-specific phrases like **"AKS cluster"**, **"AKS node pool"**, or **"managed kubernetes"** on Azure. Discard generic "aks" chatter.

## Approved Public Sources
1. **Reddit** — r/AZURE, r/kubernetes, r/devops, general search for "Azure Kubernetes Service" / "AKS".
2. **Hacker News** — Algolia HN Search (`https://hn.algolia.com/`) for "Azure Kubernetes Service".
3. **GitHub** — Issues/Discussions in the official `Azure/AKS` repo (where users file AKS bugs/feature requests), and projects that reference AKS in issues.
4. **Official docs / release notes** — `learn.microsoft.com/azure/aks` and the AKS release notes/changelog for confirmed changes, known issues, and incidents.
5. **Trustpilot / G2 / Capterra** — public reviews.
6. **X (Twitter)** — public posts mentioning "Azure Kubernetes Service" / "AKS".
7. **Dev blogs / forum threads** that are publicly indexed.

## Issue Categories (use these exact values)
`latency` · `downtime` · `billing` · `rate_limits` · `model_quality` · `api_change` · `support` · `docs` · `pricing` · `other`

> Note: for AKS (the DIY/self-hosted option), map common themes as follows — cluster/control-plane outages → `downtime`; throttling/quotas/GPU-capacity limits → `rate_limits`; version/upgrade/breaking changes → `api_change`; cost/SKU surprises → `billing`/`pricing`; node-pool/networking/scaling friction → `other`.

## Procedure
1. Determine the **time window** and optional **category** filter from the user's argument (default: last 180 days, all categories).
2. Search each approved source for product-specific mentions (see the disambiguation rule) that describe a problem or complaint.
3. For each candidate item, capture: the quoted/summarized complaint, source URL, date, author handle (if public), category, and sentiment.
4. **Deduplicate** items that describe the same incident — keep one canonical entry and list extra source URLs under `corroborating_urls`.
5. Set `verified` per the guardrails above.
6. Emit **both** outputs exactly as defined in [output-formats](./references/output-formats.md):
   - `azure-kubernetes-service-complaints.json`
   - `azure-kubernetes-service-complaints.md`
7. End with a short summary: total items, breakdown by category, and date range covered.

## Output
Produce both files following [output-formats](./references/output-formats.md). The `provider` field is always `"Azure Kubernetes Service"`.
