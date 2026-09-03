# Agents — Developer Feedback Monitoring Squad

**8 agents were created** — the Developer Feedback Monitoring Squad.

## 1. Squad (orchestrator)
The lead coordinator and only agent you talk to directly. Breaks your request into tasks,
delegates to the specialists, tracks progress with a todo list, and integrates everyone's
work. It plans, it doesn't do the hands-on work.

## 2. Squad Architect
Designs the system: folder structure, tech stack, and the frontend/backend contract and
data schema. Produces `ARCHITECTURE.md`. Design only, no code.

## 3. Squad Research
Finds where public feedback lives (Reddit, Hacker News, GitHub, status pages, Trustpilot/G2,
X) and documents each source's API, rate limits, and terms into `SOURCES.md`. Research only.

## 4. Squad Backend
Builds the server: the fetchers, the normalizer (reshapes everything into one common JSON
format), the data store, and the REST endpoints the dashboard uses. No UI.

## 5. Squad Frontend
Builds the dashboard: filters (provider, category, date, verified), search, and trend/summary
views. Only consumes the backend API.

## 6. Squad Summarization
Categorizes feedback by issue type, detects trends over time, and produces weekly summaries.
Works only on data the backend already produced.

## 7. Squad Testing
Verifies APIs return valid data, confirms the UI works, and tests edge cases (empty results,
missing fields, malformed data, rate limits). Reports pass/fail; doesn't build features.

## 8. Squad Scribe
Maintains the README, architecture docs, and decision log. Documentation only.

---

**Order of work:** Architect → Research → Backend → Frontend & Summarization → Testing → Scribe.

Only Squad is user-invocable; the other 7 are subagents it calls.
