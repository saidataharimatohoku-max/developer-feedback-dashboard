# Weekly Developer Feedback Summary

_Generated: 2026-06-24 · Window: last 365 days (plus a few older notable items)_

**Scope & caveats:** The **curated deep-dive** in this document reviews an initial
hand-picked sample of **7 items (6 Together AI, 1 Fireworks AI)** — see the auto-updated
**Live snapshot** below for current totals across all providers. The curated sample is
small, so its figures and trends are framed as **"based on the current sample"
and are not definitive**. Every curated item is `verified: false`; nothing here is independently
confirmed. `feedback_type` follows the ARCHITECTURE.md §3.1 mapping rules.

<!-- AUTOSTATS:LIVE:START -->
_Live snapshot — auto-updated by tools/refresh.js as of 2026-07-20:_

- **Total items tracked:** 424 (37 hand-curated + 387 auto-collected; all auto items `verified: false`)
- **By platform:** OpenAI 186 · Azure Kubernetes Service 74 · Azure AI Foundry 50 · Azure Machine Learning 39 · Fireworks AI 33 · Together AI 21 · Tinker API 21
- **By feedback type:** complaint 332 · question 69 · feature_request 23 · neutral 0 · positive 0
- **By category (top 6):** downtime 131 · other 79 · latency 46 · model_quality 39 · support 32 · docs 30
- **By sentiment:** negative 396 · neutral 21 · mixed 7

_The curated deep-dive below covers the initial hand-reviewed sample and is intentionally narrower than these live totals._
<!-- AUTOSTATS:LIVE:END -->

## Overall snapshot (current sample)

- **By feedback type:** complaint 6 · feature_request 1 · question 0 · positive 0
- **By category:** latency 3 · pricing 2 · docs 1 · other 1
- **By sentiment:** negative 5 · mixed 2 · neutral 0 — **sentiment skews negative**, but
  note both source skills report that *most* public mentions in-window were neutral or
  positive (cheap pricing, wide model support, speed); the negatives below are the
  clearest critical items surfaced, not a representative average.
- **Volume trend:** sparse and spread across 2024–2026; the only month with more than one
  item is **2026-06 (2 items)** — too thin to call a real trend.

---

## Together AI

6 items in the current sample (latency 3, pricing 2, docs 1, other 1); sentiment
negative 4 / mixed 2.

> **Bias flag (carried over from source data):** several critical Together AI items were
> posted by competitors launching rival inference products — **IonRouter / ApeKey /
> Promptma** — so their comparative claims should be treated as biased. **`tg-0006` is an
> unverified accusation/opinion, not a confirmed fact.**

Top issues:

- **Latency — slowest in an informal benchmark (`tg-0002`, negative, 2024-04-23):** Together AI
  measured 2.60s vs. Fireworks 1.42s and Groq 1.28s on a Llama-3-70B request. Source:
  <https://news.ycombinator.com/item?id=40129707>
- **Pricing — VC-subsidized pricing concern (`tg-0005`, negative, 2026-06-09):** a commenter
  argued the low $1/Mtok pricing is "heavily subsidized by more than $1B in VC money,"
  questioning long-term true cost (not a service defect). Source:
  <https://news.ycombinator.com/item?id=48467489>
- **Docs / feature gap (`tg-0001`, feature_request, mixed, 2024-05-17):** reported missing
  prompt history, parameter adjustments, and prompt/cost comparison — said while launching
  a tool built on top of Together AI (vendor-launch context). Source:
  <https://news.ycombinator.com/item?id=40387824>
- **Latency — "cheap but slower" + unpredictable bills (`tg-0003`, negative, 2026-02-24):**
  posted while launching a competing routing product — **competitor bias.** Source:
  <https://news.ycombinator.com/item?id=47137266>
- **Latency / throughput — competitor benchmark (`tg-0004`, mixed, 2026-03-12):** a rival
  claimed 588 tok/s vs. Together AI's 298 on the same VLM workload — **competitor launch,
  treat as biased/comparative.** Source:
  <https://news.ycombinator.com/item?id=47355410>
- **Other — unverified "mining scheme" accusation (`tg-0006`, negative, 2026-06-06):** a
  'Tell HN' post alleged a proof-of-work GPU scheme via a $PRL/Pearl partnership, calling
  it "snake oil and vaporware." **Unverified opinion/accusation — not confirmed.** Source:
  <https://news.ycombinator.com/item?id=48422809> ·
  context: <https://www.together.ai/blog/together-ai-partners-with-pearl-research-labs>

---

## Fireworks AI

1 item in the current sample (pricing, negative). The source skill notes most in-window
public mentions were neutral or positive (fast, cheap, recommended); the item below was
the clearest negative.

Top issue:

- **Pricing — fine-tuning bill shock (`fw-0001`, complaint, negative, 2025-09-19):** a user
  reported an SFT job (gpt-oss-20b, ~10k records) ran ~8 minutes but was billed **$192**,
  estimated at roughly a 1000x markup vs. renting equivalent GPUs; also called the service
  "mediocre." Single unverified report. Source:
  <https://news.ycombinator.com/item?id=45305173>

---

_All claims above cite a `source_url`; no item is independently verified
(`verified: false`). Counts are computed directly from the 7 normalized items in `data/`._
