# Project Status — Developer Feedback Dashboard

Status: **Phase 1 complete** · Scope: **Local MVP, no external network calls**
Last updated: 2026-06-24

---

## 1. Project Overview

### What was built
A local, zero-build dashboard that visualizes **public developer feedback** about
**Together AI** and **Fireworks AI**. It reads pre-collected JSON, normalizes it into a
canonical schema, and serves it through a small REST API to a static frontend with
filters, search, summary counts, and SVG charts.

### MVP goals
- Show developer complaints/feedback for the two providers in one place.
- Let a user **filter** (platform, feedback type, category), **search** (full-text), and
  see **summary visualizations** (counts and a monthly trend).
- Stay simple: **no database, no build step, no third-party runtime dependencies**, and
  **no live network calls** — everything runs locally from on-disk JSON.

### Current architecture
- **Backend:** zero-dependency **Node.js** using only the built-in `http` module
  (no Express). It loads `data/*.json` at startup, normalizes records in memory, exposes
  a REST API, and serves the static frontend.
- **Data store:** an **in-memory array** built once at startup from the JSON files.
- **Frontend:** static **HTML + CSS + vanilla JS** (no framework, no bundler). It calls
  the API with `fetch()` and renders inline **SVG charts** (no chart library).
- **Tests:** Node's built-in `node:test` runner (`node --test`).
- **Data flow:** `data/*.json → loader → normalizer (derives feedback_type) → in-memory
  store → Node http API → static dashboard`.

Full detail lives in [ARCHITECTURE.md](ARCHITECTURE.md) and [README.md](README.md).

---

## 2. Completed Features

### Backend API
A zero-dependency Node `http` server exposing three GET endpoints:
- `GET /api/health` → `{ status, items_loaded, sources }`.
- `GET /api/feedback` → `{ count, filters_applied, items }`; supports `platform`,
  `feedback_type`, `category`, and `q` (search) query params; returns `400` on invalid
  enum values.
- `GET /api/summary` → `{ total, by_platform, by_feedback_type, by_category,
  trend_by_month, undated_count }`; optional `platform` filter.

### Dashboard
Static page served at `/` by the same Node server. Shows stat cards, a charts grid, a
by-category breakdown, filter controls, and a list of feedback cards. No build step.

### Filters
Filter by **platform** (Together AI / Fireworks AI), **feedback type**, and **category**.
Invalid filter values are rejected by the API with `400`.

### Search
Full-text **search** (`q`) across feedback text, applied server-side so results stay
consistent with the rest of the API contract.

### Summary section
Stat cards plus aggregate counts driven by `/api/summary`: totals, by-platform,
by-feedback-type, by-category, and a monthly trend (with an undated count).

### Charts
Three inline **SVG charts** (no chart library): by-platform, by-feedback-type, and a
monthly **trend** line/area chart. Each includes **legends**, **y-axis gridlines and
labels**, and **value labels**, with axes scaled to clean integer ticks.

### Documentation
[README.md](README.md) (setup, run, usage), [ARCHITECTURE.md](ARCHITECTURE.md) (tech
stack, folder structure, API contract, data flow, future-skill integration), and
[SOURCES.md](SOURCES.md) (public sources documented for Phase 2).

### Tests
A suite run with `node --test` covering the normalizer mapping rules, the store
filters/summary aggregation, and the live HTTP endpoint contract (including the `400`
validation cases). All tests pass.

---

## 3. Current Constraints

- **Local-only.** The app runs entirely on `localhost`; there are **no external network
  calls** at runtime.
- **`data/*.json` only.** The two pre-collected JSON files in `data/` are the **sole data
  source**. The loader consumes whatever is on disk.
- **No real APIs.** The backend does not call any provider, search, or third-party API.
- **No scraping.** There is **no scraping** of Reddit, Discord, X, GitHub, or any other
  site. Nothing is fetched live.

---

## 4. Future — Phase 2

These are **planned** and intentionally **not implemented** in Phase 1. No new features,
architecture changes, or data sources are added here — this section only records intent.

- **Together AI Complaint Skill integration** — the `together-ai-complaints` skill refreshes
  `data/together-ai-complaints.json` with the same-shaped JSON the MVP already consumes.
- **Fireworks AI Complaint Skill integration** — the `fireworks-ai-complaints` skill
  refreshes `data/fireworks-ai-complaints.json` in the same way.
- **Optional Hacker News integration** — an additional public source feeding the same
  JSON shape, if/when added.
- **Automated JSON refresh pipeline** — schedule the skills so the dataset refreshes
  without manual steps. Because the loader reads whatever is on disk, the integration
  point stays: `Skill (refresh) → data/*.json → loader → normalizer → store → API → UI`.
  Picking up new data currently requires restarting the server; a future enhancement
  (file-watch or a reload endpoint) could remove the restart.

---

## 5. Known Limitations

- **Mock/local data.** The dashboard reflects only the pre-collected sample records in
  `data/*.json`, not the full body of real-world public feedback.
- **Manual refresh process.** Updating the data means replacing the JSON files and
  restarting the server; there is no automated refresh in Phase 1.
- **No live external sources.** Nothing is fetched at runtime — no provider APIs, no
  search APIs, and no scraping of Reddit / Discord / X / GitHub.
