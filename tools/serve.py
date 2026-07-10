#!/usr/bin/env python3
"""Zero-dependency Python port of backend/server.js.

Serves the same routes (/api/health, /api/feedback, /api/feedback.csv,
/api/summary) and the static frontend, reading the same data/*.json files and
applying the same normalization rules. Lets the dashboard run when Node.js is
not installed. Nothing here changes the JS backend; it just mirrors it.

Run:  python tools/serve.py   (then open http://localhost:3000)
"""

import csv
import io
import json
import os
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
FRONTEND_DIR = os.path.join(ROOT, "frontend")
PORT = int(os.environ.get("PORT", "3000"))

# ---------------------------------------------------------------------------
# loader.js
# ---------------------------------------------------------------------------
SOURCE_FILES = [
    "together-ai-complaints.json",
    "fireworks-ai-complaints.json",
    "tinker-api-complaints.json",
    "azure-kubernetes-service-complaints.json",
    "azure-machine-learning-complaints.json",
    "azure-ai-foundry-complaints.json",
    "openai-complaints.json",
]

# ---------------------------------------------------------------------------
# normalizer.js
# ---------------------------------------------------------------------------
FEEDBACK_TYPES = ["complaint", "question", "feature_request", "positive"]
CATEGORIES = [
    "latency", "downtime", "billing", "rate_limits", "model_quality",
    "api_change", "support", "docs", "pricing", "other",
]
QUESTION_CUES = ["how do i", "how to", "is it possible", "can i ", "why does", "?"]
FEATURE_CUES = [
    "lacked", "missing", "lack of", "wish", "feature request",
    "would be nice", "ability to", "support for",
]
COMPLAINT_CATEGORIES = {
    "latency", "downtime", "billing", "rate_limits", "pricing",
    "model_quality", "support",
}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def slugify(provider):
    s = str(provider or "").lower()
    s = re.sub(r"[\s.]+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    return s


def empty_to_null(value):
    if value is None:
        return None
    s = str(value).strip()
    return None if s == "" else s


def feedback_type(summary=None, quote=None, category=None, sentiment=None):
    text = f"{summary or ''} {quote or ''}".lower()
    has_question = any(cue in text for cue in QUESTION_CUES)
    has_feature = any(cue in text for cue in FEATURE_CUES)
    if has_question or (category == "docs" and sentiment != "negative" and not has_feature):
        return "question"
    if has_feature or category == "api_change":
        return "feature_request"
    if sentiment == "negative" or category in COMPLAINT_CATEGORIES:
        return "complaint"
    if sentiment == "neutral" or sentiment == "mixed":
        return "positive"
    return "complaint"


def normalize(raw, provider):
    summary = str(raw["complaint"]) if raw and raw.get("complaint") is not None else ""
    quote = raw.get("quote") if raw else None
    category = raw.get("category") if raw else None
    sentiment = raw.get("sentiment") if raw else None
    date = raw.get("date") if raw else None
    return {
        "id": raw.get("id") if raw else None,
        "provider": provider,
        "provider_slug": slugify(provider),
        "feedback_type": feedback_type(summary, quote, category, sentiment),
        "category": category,
        "sentiment": sentiment,
        "summary": summary,
        "original_text": empty_to_null(quote),
        "source": raw.get("source") if raw else None,
        "source_url": empty_to_null(raw.get("source_url") if raw else None),
        "corroborating_urls": raw.get("corroborating_urls") if raw and isinstance(raw.get("corroborating_urls"), list) else [],
        "author_handle": empty_to_null(raw.get("author_handle") if raw else None),
        "date": date if isinstance(date, str) and DATE_RE.match(date) else None,
        "verified": bool(raw and raw.get("verified") is True),
        "auto_collected": bool(raw and raw.get("auto_collected") is True),
    }


def load_raw():
    records = []
    for file in SOURCE_FILES:
        full = os.path.join(DATA_DIR, file)
        if not os.path.exists(full):
            continue
        with open(full, "r", encoding="utf-8") as f:
            parsed = json.load(f)
        provider = parsed.get("provider")
        for raw in parsed.get("complaints", []) or []:
            records.append((provider, raw))
    return records


# ---------------------------------------------------------------------------
# store.js
# ---------------------------------------------------------------------------
class Store:
    def __init__(self):
        self.items = []
        self.platforms = set()
        self.last_mtime = 0.0

    def data_mtime(self):
        mx = 0.0
        for file in SOURCE_FILES:
            try:
                m = os.path.getmtime(os.path.join(DATA_DIR, file))
                if m > mx:
                    mx = m
            except OSError:
                pass
        return mx

    def load(self):
        self.items = [normalize(raw, provider) for provider, raw in load_raw()]
        self.platforms = set()
        for it in self.items:
            if it.get("provider_slug"):
                self.platforms.add(it["provider_slug"])
            if it.get("provider"):
                self.platforms.add(it["provider"].lower())
        self.last_mtime = self.data_mtime()
        return self.items

    def reload_if_changed(self):
        m = self.data_mtime()
        if m > self.last_mtime:
            self.load()
            return True
        return False

    def known_platform(self, value):
        return str(value).lower() in self.platforms

    def filter(self, platform=None, feedback_type=None, category=None, q=None):
        result = self.items
        if platform:
            p = platform.lower()
            result = [it for it in result if it["provider_slug"] == p or (it.get("provider") and it["provider"].lower() == p)]
        if feedback_type:
            ft = feedback_type.lower()
            result = [it for it in result if it["feedback_type"] == ft]
        if category:
            c = category.lower()
            result = [it for it in result if it["category"] == c]
        if q:
            needle = q.lower()
            result = [it for it in result if needle in f"{it.get('summary') or ''} {it.get('original_text') or ''}".lower()]
        return result

    def summary(self, platform=None):
        scoped = self.filter(platform=platform) if platform else self.items
        by_platform, by_feedback_type, by_category = {}, {}, {}
        by_sentiment, by_platform_category = {}, {}
        month_counts, sentiment_month, category_month, platform_month = {}, {}, {}, {}
        undated = 0
        for ft in FEEDBACK_TYPES:
            by_feedback_type[ft] = 0
        for it in scoped:
            by_platform[it["provider"]] = by_platform.get(it["provider"], 0) + 1
            by_feedback_type[it["feedback_type"]] = by_feedback_type.get(it["feedback_type"], 0) + 1
            if it.get("category") is not None:
                by_category[it["category"]] = by_category.get(it["category"], 0) + 1
                pc = by_platform_category.setdefault(it["provider"], {})
                pc[it["category"]] = pc.get(it["category"], 0) + 1
            if it.get("sentiment") is not None:
                by_sentiment[it["sentiment"]] = by_sentiment.get(it["sentiment"], 0) + 1
            if it.get("date"):
                month = it["date"][:7]
                month_counts[month] = month_counts.get(month, 0) + 1
                sm = sentiment_month.setdefault(month, {})
                if it.get("sentiment") is not None:
                    sm[it["sentiment"]] = sm.get(it["sentiment"], 0) + 1
                if it.get("category") is not None:
                    cm = category_month.setdefault(month, {})
                    cm[it["category"]] = cm.get(it["category"], 0) + 1
                pm = platform_month.setdefault(month, {})
                pm[it["provider"]] = pm.get(it["provider"], 0) + 1
            else:
                undated += 1

        sorted_months = sorted(month_counts.keys())
        trend_by_month = [{"month": m, "count": month_counts[m]} for m in sorted_months]
        sentiment_trend_by_month = [dict(month=m, **sentiment_month[m]) for m in sorted(sentiment_month.keys())]
        trend_by_platform_month = {
            "months": sorted_months,
            "series": [
                {"key": name, "counts": [platform_month.get(m, {}).get(name, 0) for m in sorted_months]}
                for name in by_platform.keys()
            ],
        }
        trend_by_category_month = {
            "months": sorted_months,
            "series": [
                {"key": name, "counts": [category_month.get(m, {}).get(name, 0) for m in sorted_months]}
                for name in by_category.keys()
            ],
        }
        top_issue = self._compute_top_issue(sorted_months, category_month, by_category)
        mtime = self.data_mtime()
        last_updated = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z") if mtime else None
        return {
            "total": len(scoped),
            "by_platform": by_platform,
            "by_feedback_type": by_feedback_type,
            "by_category": by_category,
            "by_platform_category": by_platform_category,
            "by_sentiment": by_sentiment,
            "trend_by_month": trend_by_month,
            "sentiment_trend_by_month": sentiment_trend_by_month,
            "trend_by_platform_month": trend_by_platform_month,
            "trend_by_category_month": trend_by_category_month,
            "top_issue": top_issue,
            "undated_count": undated,
            "last_updated": last_updated,
        }

    @staticmethod
    def _compute_top_issue(sorted_months, category_month, by_category):
        # "other" is a catch-all bucket with no actionable meaning, so it is
        # never surfaced as the headline issue — pick the top *specific* category.
        def pick_top(counts):
            entries = [(c, n) for c, n in (counts or {}).items() if c != "other"]
            if not entries:
                return None
            return sorted(entries, key=lambda kv: kv[1], reverse=True)[0]

        for i in range(len(sorted_months) - 1, -1, -1):
            month = sorted_months[i]
            top = pick_top(category_month.get(month))
            if top:
                return {"category": top[0], "count": top[1], "month": month, "scope": "month"}
        top = pick_top(by_category)
        if top:
            return {"category": top[0], "count": top[1], "month": None, "scope": "all"}
        return None


STORE = Store()
STORE.load()

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".map": "application/json; charset=utf-8",
}

CSV_COLUMNS = [
    "id", "provider", "feedback_type", "category", "sentiment", "date",
    "summary", "original_text", "source", "source_url", "verified", "auto_collected",
]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # quiet

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        pathname = parsed.path
        query = parse_qs(parsed.query)

        def get(name):
            vals = query.get(name)
            return vals[0] if vals else None

        if pathname.startswith("/api/"):
            STORE.reload_if_changed()

        if pathname == "/api/health":
            return self._send_json(200, {
                "status": "ok",
                "items_loaded": len(STORE.items),
                "sources": SOURCE_FILES,
            })
        if pathname == "/api/feedback":
            return self._handle_feedback(get)
        if pathname == "/api/feedback.csv":
            return self._handle_feedback_csv(get)
        if pathname == "/api/summary":
            platform = get("platform")
            if platform is not None and not STORE.known_platform(platform):
                return self._send_json(400, {"error": "invalid platform", "allowed": sorted(STORE.platforms)})
            return self._send_json(200, STORE.summary(platform=platform))
        if pathname.startswith("/api/"):
            return self._send_json(404, {"error": "not found"})
        return self._serve_static(pathname)

    def _validate(self, platform, feedback_type, category):
        if platform is not None and not STORE.known_platform(platform):
            self._send_json(400, {"error": "invalid platform", "allowed": sorted(STORE.platforms)})
            return False
        if feedback_type is not None and feedback_type.lower() not in FEEDBACK_TYPES:
            self._send_json(400, {"error": "invalid feedback_type", "allowed": FEEDBACK_TYPES})
            return False
        if category is not None and category.lower() not in CATEGORIES:
            self._send_json(400, {"error": "invalid category", "allowed": CATEGORIES})
            return False
        return True

    def _handle_feedback(self, get):
        platform, ft, category, q = get("platform"), get("feedback_type"), get("category"), get("q")
        if not self._validate(platform, ft, category):
            return
        filters = {"platform": platform, "feedback_type": ft, "category": category, "q": q}
        items = STORE.filter(platform=platform, feedback_type=ft, category=category, q=q)
        self._send_json(200, {"count": len(items), "filters_applied": filters, "items": items})

    def _handle_feedback_csv(self, get):
        platform, ft, category, q = get("platform"), get("feedback_type"), get("category"), get("q")
        if not self._validate(platform, ft, category):
            return
        items = STORE.filter(platform=platform, feedback_type=ft, category=category, q=q)
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\r\n")
        writer.writerow(CSV_COLUMNS)
        for it in items:
            writer.writerow(["" if it.get(c) is None else it.get(c) for c in CSV_COLUMNS])
        body = ("\ufeff" + buf.getvalue()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="developer-feedback.csv"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, pathname):
        rel = "index.html" if pathname == "/" else unquote(pathname.lstrip("/"))
        root = os.path.realpath(FRONTEND_DIR)
        target = os.path.realpath(os.path.join(root, rel))
        if target != root and not target.startswith(root + os.sep):
            return self._send_json(403, {"error": "forbidden"})
        if not os.path.isfile(target):
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Not found")
            return
        ext = os.path.splitext(target)[1].lower()
        with open(target, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Developer Feedback API (Python) listening on http://localhost:{PORT}")
    print(f"Loaded {len(STORE.items)} normalized items from {', '.join(SOURCE_FILES)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
