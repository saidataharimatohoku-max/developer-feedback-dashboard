# Output Formats — Together AI Complaints

Always produce **both** a JSON file and a Markdown file.

## 1. JSON (`together-ai-complaints.json`)

Machine-readable, consumed by the website. Use this exact schema.

```json
{
  "provider": "Together AI",
  "generated_at": "2026-06-24T00:00:00Z",
  "window": "last 180 days",
  "source_count": 0,
  "complaints": [
    {
      "id": "tg-0001",
      "complaint": "User-reported summary of the issue in one or two sentences.",
      "quote": "Optional short verbatim quote from the public post.",
      "category": "latency",
      "sentiment": "negative",
      "author_handle": "public_handle_or_null",
      "source": "reddit",
      "source_url": "https://...",
      "corroborating_urls": [],
      "date": "2026-06-01",
      "verified": false
    }
  ]
}
```

### Field rules
- `id`: sequential, prefix `tg-` (e.g. `tg-0001`).
- `category`: one of `latency`, `downtime`, `billing`, `rate_limits`, `model_quality`, `api_change`, `support`, `docs`, `pricing`, `other`.
- `sentiment`: one of `negative`, `neutral`, `mixed`.
- `source`: one of `reddit`, `hackernews`, `github`, `status_page`, `trustpilot`, `g2`, `x`, `blog`, `forum`.
- `source_url`: required, must be a real public URL.
- `verified`: `true` only if corroborated by the official status page or 2+ independent sources.
- `author_handle`: public handle only, or `null`. Never include real names, emails, or other PII.

## 2. Markdown (`together-ai-complaints.md`)

Human-readable report. Suggested structure:

```markdown
# Together AI — Public Developer Feedback (as of 2026-06-24)

> Sourced from publicly available posts. Each item is user-reported and links to its source. Window: last 180 days.

## Summary
- Total items: N
- By category: latency (x), downtime (x), billing (x), ...
- Date range: YYYY-MM-DD to YYYY-MM-DD

## Complaints

### Latency
- **[user-reported]** Short summary. _(handle, 2026-06-01)_ — [source](https://...) ✅ verified
- ...

### Downtime
- ...
```

Use ✅ for `verified: true` items and leave it off otherwise. Group by category, ordered by date (newest first).
