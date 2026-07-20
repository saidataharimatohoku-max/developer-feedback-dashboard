# Developer Feedback Dashboard — Data Sources & Status

<!-- AUTOSTATS:DATE:START -->
_As of 2026-07-20_
<!-- AUTOSTATS:DATE:END -->

The dashboard tracks public developer feedback about **Together AI**, **Fireworks AI**,
**Tinker API** (the model fine-tuning API from Thinking Machines Lab), **Azure Kubernetes
Service** (included as the self-hosted / do-it-yourself (DIY) way to run models), **Azure
Machine Learning** — Microsoft's managed ML platform for model training and managed online
endpoints (inference) — and the **OpenAI API** (api.openai.com), OpenAI's hosted inference API
for chat/Responses, embeddings, audio, images, and the Realtime API.
<!-- AUTOSTATS:COUNTS:START -->
It currently displays **424 items** — **37 hand-curated** (10 Together AI, 3 Fireworks AI, 11 Azure Machine Learning, 13 OpenAI) plus **387 auto-collected** (99 from Status page, 26 from Hacker News, 138 from GitHub issues, 97 from Stack Overflow, 12 from serverfault, 6 from devops-stackexchange, 9 from Community Forum). Every item is linked to its original public source.
<!-- AUTOSTATS:COUNTS:END -->

---

## What was built — from start to finish

### 1. Core dashboard (MVP)
- A zero-dependency Node.js backend (built-in `http` server — no frameworks, no `npm install`)
  serving a REST API and a static frontend.
- Canonical data schema: every feedback item is normalized to the same fields (provider,
  feedback type, category, sentiment, date, summary, original text, source, source URL, verified).
- Frontend dashboard with **filters** (platform, feedback type, category), **full-text search**,
  and a card list of every feedback item with a link to its real source.

### 2. Summary & visualizations
- **Stat cards** — total items and per-platform counts.
- **Charts** (hand-built SVG, no chart library): feedback by platform, feedback by type, and a
  month-by-month trend line.
- **By-category breakdown** bar list.

### 3. Automation (self-updating)
- **Daily data refresh** — a Windows scheduled task (`DevFeedbackDashboard-DailyRefresh`) runs each
  morning at 9:00 AM, pulls new **Hacker News** and **GitHub issue** mentions of all six providers,
  removes duplicates, and adds any new items.
- **Auto-start server** — a second scheduled task (`DevFeedbackDashboard-StartServer`) launches the
  dashboard at login, so http://localhost:3000 is always available.
- **Live reload** — the running dashboard picks up newly collected items automatically, with **no
  restart required** (verified live).
- **1-year collection window** — automated collection now scans the **last 365 days** of public
  Hacker News posts and GitHub issues (widened from the original 6 months).
- Both tasks are scoped to the current user (no admin needed) and are fully reversible.

### 4. Executive summary
- A plain-language **Executive Summary** at the top of the page, auto-generated from the live data
  (totals, complaint share, top issue categories, and a data-freshness note). It rewrites itself
  whenever the data changes — no manual editing.

### 5. Sentiment over time
- A **stacked bar chart** showing how the tone of feedback (negative / mixed / neutral / positive)
  shifts month over month, so trends in developer mood are visible at a glance.

### 6. Quick-win additions (latest)
- **"Most common issue" callout** — a headline banner highlighting the top complaint category in the
  most recent month (e.g. _"pricing — 3 reports in Jun 2026"_).
- **Provider comparison** — a side-by-side **Together AI vs Fireworks AI vs Tinker API vs Azure
  Kubernetes Service vs Azure Machine Learning vs OpenAI** view of feedback by category, so you can
  instantly see which provider draws more complaints in each area.
- **CSV / JSON export** — "download this data" buttons (CSV opens cleanly in Excel; JSON for
  developers). Exports respect the active filters.
- **"Last updated" timestamp** — shows when the data was last refreshed, reinforcing that it is live.
- **Guided demo mode** — an opt-in **▶ Demo** button (and `?demo=1` URL) plays a self-driving,
  captioned auto-tour of the whole dashboard (scrolling, spotlighting each section, toggling the
  trend breakdown, filtering, searching, and exporting) so the project can be screen-recorded
  hands-free. It uses the real filters and leaves the normal experience untouched.

---

## API connection: ✅ Connected and live

The frontend is fully wired to the backend REST API (`/api/summary`, `/api/feedback`, and
`/api/feedback.csv`) running on the same server. Filters, search, charts, comparison, and exports
all pull live data from the API — confirmed working end to end.

## Data quality & honesty

- **Hand-curated items** are written and source-cited by hand.
- **Auto-collected items** carry a yellow **"⚙ Auto · unverified"** badge so they are clearly
  distinguishable. They use keyword-based category/sentiment and are coarser than the curated items.
- Hacker News is noisy — many matches are general market/pricing discussions that merely mention a
  provider — so auto items may include some off-topic results. GitHub collection is kept precise by
  searching the providers' own domains (`together.ai`, `api.together.xyz`, `fireworks.ai`,
  `api.fireworks.ai`, `thinkingmachines.ai`) and identifiers (the `thinking-machines-lab` GitHub org
  and `tinker-cookbook` repo for Tinker), and filtering out non-English results. Because "Tinker" is
  a common English word, its matching is deliberately restricted to those product identifiers, and
  because "AKS" is an ambiguous acronym, Azure Kubernetes Service is matched on its full product
  name plus issues filed directly in the official **`Azure/AKS`** GitHub repository. Likewise,
  because "ML" is generic, Azure Machine Learning is matched on its full product name ("Azure
  Machine Learning" / "AzureML") plus the official **`Azure/azureml-examples`** and
  **`Azure/MachineLearningNotebooks`** repositories. A
  **bot/telemetry filter** drops machine-generated CI posts (e.g. `github-actions[bot]` runs and
  automated diagnostic dumps) so only human-written feedback is kept. This is the accepted trade-off
  of auto-publishing without manual review.

## Live sources feeding the dashboard today

- **Hacker News** (official Algolia public API) — both curated and auto-collected items. No
  authentication required.
- **GitHub issues** (official public Search API) — auto-collected items, matched on the providers'
  own domains and identifiers for precision (Together AI / Fireworks AI domains; for Tinker API the
  `thinkingmachines.ai` domain, the `thinking-machines-lab` org, and the `tinker-cookbook` repo; for
  Azure Kubernetes Service the full product name and issues filed in the official `Azure/AKS` repo;
  for Azure Machine Learning the full product name and issues filed in the official
  `Azure/azureml-examples` and `Azure/MachineLearningNotebooks` repos).
  No authentication required.
- **Official status pages** (status.together.ai / status.fireworks.ai) — used for verified
  uptime/downtime data. (Tinker API is a newer, researcher-focused product without an equivalent
  public status feed yet; Azure Kubernetes Service and Azure Machine Learning feedback comes from
  their official GitHub issue trackers. These rely on Hacker News and GitHub.)

## Documented and ready to add, pending access

- **Reddit** — blocked for automated access (HTTP 403); requires an OAuth API token.
- **Trustpilot / G2** — blocked / scraping-restricted; require paid API tiers.
- **X (Twitter)** — requires a paid API tier.

## Quality safeguards

- The automated test suite (**50 tests**) passes. Tests read a frozen copy of a curated fixture
  dataset, so daily collection can never break them.
- All data is public, source-cited, and presented as user-reported.

## Backup & recovery

The entire project is backed up to **OneDrive**, so it is no longer a single copy on one machine.

- **Live cloud mirror** — `OneDrive\Project-Backups\Microsoft (Project 3)\` is kept as an exact,
  always-current copy of the working folder. A lightweight background watcher
  (`tools/backup-watcher.ps1`) re-mirrors the project (via `robocopy /MIR`) within ~15 seconds of any
  change, with a safety sync every 10 minutes. `node_modules` is excluded (regenerable); the full
  `.git` history is included.
- **Weekly rollback snapshots** — `OneDrive\Project-Backups\Snapshots\` receives a dated ZIP
  (e.g. `Microsoft (Project 3) 2026-06-26.zip`) at most once every 7 days, and the **8 most recent**
  snapshots are retained (older ones pruned automatically). This allows rolling back to an earlier
  point in time, not just the latest state.
- **Auto-start, no admin** — the watcher launches at sign-in from the user's Startup folder
  (`DevFeedbackBackup.vbs`), so the backup keeps itself current without any manual step. Activity is
  logged to `%LOCALAPPDATA%\DevFeedbackDashboard\onedrive-backup.log`.
- **Restore** — open the OneDrive folder and copy the live mirror (latest) or extract a dated ZIP
  (an earlier version).

## Bottom line

The dashboard is connected to its API, serving live data, and maintains itself — refreshing from a
full year of Hacker News and GitHub issues daily and restarting automatically at login. It now
tracks six providers (Together AI, Fireworks AI, Tinker API, Azure Kubernetes Service — the
self-hosted / DIY option —, Azure Machine Learning — Microsoft's managed ML platform — and the
OpenAI API). On top of the core MVP it now
includes an auto-written executive summary, a sentiment-over-time chart, a
"most common issue" callout, a side-by-side provider comparison, CSV/JSON export, a last-updated
timestamp, and a one-click guided demo / auto-tour for screen recordings. Hacker News, GitHub issues, and the official status pages are the feedback sources
feeding it right now; the remaining sources are researched and ready to wire in once access
constraints (OAuth tokens, paid API tiers) are resolved.
