# Output Formats — Azure Machine Learning Complaints

Always produce **both** a JSON file and a Markdown file.

## 1. JSON (`azure-machine-learning-complaints.json`)

Machine-readable, consumed by the website. Use this exact schema.

```json
{
  "provider": "Azure Machine Learning",
  "generated_at": "2026-06-27T00:00:00Z",
  "window": "last 180 days",
  "source_count": 0,
  "complaints": [
    {
      "id": "aml-0001",
      "complaint": "User-reported summary of the issue in one or two sentences.",
      "quote": "Optional short verbatim quote from the public post.",
      "category": "downtime",
      "sentiment": "negative",
      "author_handle": "public_handle_or_null",
      "source": "github",
      "source_url": "https://...",
      "corroborating_urls": [],
      "date": "2026-06-01",
      "verified": false
    }
  ]
}
```

### Field rules
- `id`: sequential, prefix `aml-` (e.g. `aml-0001`).
- `category`: one of `latency`, `downtime`, `billing`, `rate_limits`, `model_quality`, `api_change`, `support`, `docs`, `pricing`, `other`.
- `sentiment`: one of `negative`, `neutral`, `mixed`.
- `source`: one of `reddit`, `hackernews`, `github`, `status_page`, `trustpilot`, `g2`, `x`, `blog`, `forum`.
- `source_url`: required, must be a real public URL.
- `verified`: `true` only if corroborated by an official source (Azure status / release notes) or 2+ independent sources.
- `author_handle`: public handle only, or `null`. Never include real names, emails, or other PII.

## 2. Markdown (`azure-machine-learning-complaints.md`)

Human-readable report. Suggested structure:

```markdown
# Azure Machine Learning — Public Developer Feedback (as of 2026-06-27)

> Sourced from publicly available posts. Each item is user-reported and links to its source. Window: last 180 days.

## Summary
- Total items: N
- By category: downtime (x), api_change (x), rate_limits (x), ...
- Date range: YYYY-MM-DD to YYYY-MM-DD

## Complaints

### Downtime
- **[user-reported]** Short summary. _(handle, 2026-06-01)_ — [source](https://...) ✅ verified
- ...

### Api_change
- ...
```

Use ✅ for `verified: true` items and leave it off otherwise. Group by category, ordered by date (newest first).
