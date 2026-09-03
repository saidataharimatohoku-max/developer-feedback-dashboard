# Developer Feedback Dashboard — Interview Cheat Sheet

_Plain-language answers to the questions a hiring manager may ask about this resume bullet:_

_"Built a full-stack Developer Feedback Dashboard that aggregates, normalizes, and visualizes developer feedback from 7 public AI inference providers into a searchable, filterable web application with interactive trend visualizations."_

---

## 30-Second Elevator Pitch

I built a full-stack web app that pulls public developer complaints about 7 AI inference providers (Together AI, Fireworks AI, Tinker API, Azure Kubernetes Service, Azure Machine Learning, Azure AI Foundry, and OpenAI) from places like Hacker News, Reddit, GitHub, and status pages. It cleans every item into one common format, stores it, and serves a searchable, filterable dashboard with trend charts. It runs on a lightweight Node backend with a plain HTML/CSS/JavaScript frontend, and it auto-deploys to Render whenever I push to GitHub.

---

## 1. Architecture & "Full-Stack"

**Walk me through the whole thing.**
Data comes from public places like Hacker News, Reddit, GitHub, and provider status pages. I collect it into JSON files, one per provider. A normalizer cleans every item into one common format. A small Node server loads all of that into memory and exposes a simple API. The frontend (plain HTML/CSS/JavaScript) calls that API to show a searchable, filterable dashboard with charts. It's deployed on Render, which auto-updates whenever I push to GitHub.

**Why a Node backend and not just a static site?**
The backend does the filtering, searching, and the summary/trend math in one place, so the frontend stays simple and every user gets consistent results. It also lets me swap the data source later without changing the UI.

**Where does the data live?**
In JSON files in a `data/` folder — one file per provider. On startup the server reads them all into memory. For a dataset of a few hundred items that's fast and simple. If it grew large I'd move to a real database.

**Any external dependencies?**
Almost none — the server uses Node's built-in `http` module, no framework. That means it runs with plain `node`, no install step, which keeps it lightweight and easy to deploy.

---

## 2. Normalization (the deep one)

**What does "normalize" mean here?**
Every source describes feedback differently. I convert each raw item into one canonical schema with fixed fields: provider, category, sentiment, feedback_type, summary, original_text, source, source_url, date, and verified. So no matter where a complaint came from, the rest of the app sees the same shape.

**Concrete before/after example (memorize this one):**
Raw item tg-0001 has fields like `complaint`, `quote`, `category: "docs"`, `sentiment: "mixed"`. My normalizer:

- renames `complaint` to `summary` and `quote` to `original_text`
- adds a `provider_slug` ("Together AI" becomes together-ai)
- derives a `feedback_type` — this item mentions "lacked" and "ability to", so a rule classifies it as a feature_request
- forces the date into YYYY-MM-DD or sets it to null if invalid
- converts empty strings to null and guarantees `verified` is a real true/false

**How do you decide the feedback_type?**
A deterministic set of rules applied in order: if the text contains a question cue ("how do I", "?") it's a question; if it mentions a missing feature ("lacked", "wish", "support for") it's a feature_request; if the sentiment is negative or the category is something like latency/billing/downtime it's a complaint; explicit praise is positive; otherwise neutral. It's rule-based, so it's predictable and easy to explain — no black box.

**How do you handle missing or bad fields?**
Defensively. Empty strings become null, missing arrays become empty arrays, `verified` defaults to false, and a date that doesn't match YYYY-MM-DD becomes null instead of breaking a chart. The app never crashes on a messy record.

**Different sources use different labels — how do you unify them?**
I have an alias map. For example one source says `status_page` and another says `statuspage`; I canonicalize them to one value so counts and filters treat them as the same source.

---

## 3. Data Sourcing & Freshness

**Where does the data come from — API, scraping, or manual?**
Public sources: Hacker News, Reddit, GitHub issues, and official status pages. Some are collected automatically; where a site blocked automated requests — Reddit, Trustpilot, and G2 returned 403 — I noted that honestly and used what was publicly available instead.

**How is it kept fresh?**
There's a refresh script and a daily task that re-collect data and rewrite the JSON files. The server checks the files' modification timestamps and reloads automatically if they changed — so new data shows up without restarting the server.

**Did you respect rate limits and terms of service?**
Yes — I documented every source, its access method, and its limits in a SOURCES file, and I only used public data. When a site disallowed automated access, I didn't force it.

**How would this scale to 50 providers or real-time?**
I'd move from JSON files to a database, put ingestion on a queue/scheduler, and add caching. The API and frontend wouldn't have to change much because everything already goes through the normalized schema.

**How do you handle biased sources?**
I flag them. For example, some complaints were posted by people launching a competing product, so I marked those as biased in the data notes so the numbers aren't taken at face value.

---

## 4. Search, Filters & Charts

**Is filtering client-side or server-side?**
Server-side. The frontend sends the filters as query parameters to `/api/feedback`, and the server returns just the matching items. That keeps the logic in one place.

**How does search work?**
A text query does a case-insensitive match against each item's summary and original text. Simple and fast at this scale. For a huge dataset I'd add a real search index.

**What filters are supported?**
Provider, feedback type, category, source, sentiment, verified-only, and a date range — plus free-text search. The server also validates filters and returns a clear 400 error with the allowed values if something's invalid.

**How are the trend charts built?**
The server groups items by month (YYYY-MM) and produces per-month counts, including breakdowns by provider and by category on a shared time axis. The frontend just draws those series. It also computes a "top issue" headline — the most common specific category in the most recent month.

---

## 5. Engineering Practices

**How did you test it?**
I have tests for the normalizer, the API, and the HTTP layer. The HTTP tests point at a frozen fixture dataset so that scheduled data refreshes can't randomly break the assertions.

**How is it deployed?**
On Render, with auto-deploy: when I push to master on GitHub, Render rebuilds and redeploys automatically.

**Any security considerations?**
The static file server guards against path-traversal, the API is read-only (only GET; anything else returns 405), and all filter inputs are validated against fixed allowed values.

**What are the limitations / what would you change?**
File-based storage and in-memory search are the main limits — fine for an MVP, not for large scale. I'd add a database, a real search index, and automated categorization to reduce manual rules.

---

## 6. Product / Judgment

**Who's it for and what decision does it help with?**
Anyone choosing an AI inference provider, or a provider's own team. It turns scattered public complaints into a clear picture of the biggest issues per provider and how they trend over time.

**How accurate is your categorization?**
It's rule-based, so it's consistent and explainable, but it can misjudge nuance. That's a deliberate MVP tradeoff — I'd add smarter classification later, but I wanted every result to be traceable and reproducible first.

---

## Two Answers to Rehearse Cold

1. **The before/after normalization example (tg-0001)** — shows you understand the core of the project.
2. **The "file-based now, database at scale" tradeoff** — shows engineering judgment.

---

## Quick Tech Facts (memorize)

- **Stack:** Node.js (built-in `http`, zero frameworks) + vanilla HTML/CSS/JS frontend.
- **Data:** ~424 normalized items across 7 providers, stored as one JSON file per provider.
- **API endpoints:** `/api/feedback`, `/api/feedback.csv`, `/api/summary`, `/api/health`.
- **Canonical fields:** provider, provider_slug, feedback_type, category, sentiment, summary, original_text, source, source_url, date, verified, auto_collected.
- **feedback_type values:** complaint, question, feature_request, neutral, positive.
- **Deployment:** GitHub push to master triggers auto-deploy on Render.
- **Tests:** normalizer, API, and HTTP layer (using a frozen fixture dataset).
