"""Score and prioritize sitemap URLs so the most useful pages index first.

Higher score = crawled sooner → fast time-to-first-answer. Pages visitors actually ask
about (home, pricing, docs, contact…) get indexed before low-value pages
(tag/author/archive listings, legal boilerplate).
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

_HIGH = {
    r"^/?$": 100,                      # home
    r"/(about|about-us)(/|$)": 60,
    r"/(pricing|plans)(/|$)": 60,
    r"/(features?|product)(/|$)": 55,
    r"/(contact|support|help)(/|$)": 55,
    r"/(docs?|documentation)(/|$)": 50,
    r"/(getting-started|quickstart|start)(/|$)": 50,
    r"/faq(s)?(/|$)": 50,
    r"/(guide|tutorial)(/|$)": 30,
}
_LOW = {
    r"/tag/": -60,
    r"/tags/": -60,
    r"/author/": -60,
    r"/category/": -30,
    r"/page/\d+": -50,
    r"/archive": -50,
    r"/(privacy|terms|cookie|legal|gdpr)(/|$)": -40,
    r"/\d{4}/\d{2}/": -30,             # dated blog archives
}


def score_url(url: str) -> float:
    path = (urlparse(url).path or "/").lower()
    score = 10.0
    for pat, delta in _HIGH.items():
        if re.search(pat, path):
            score += delta
    for pat, delta in _LOW.items():
        if re.search(pat, path):
            score += delta
    score -= path.strip("/").count("/") * 4  # shallower = more important
    return score


def prioritize_urls(urls: list[str]) -> list[str]:
    """De-dupe and sort URLs by descending value (highest-priority first)."""
    seen: set[str] = set()
    unique = [u for u in urls if not (u in seen or seen.add(u))]
    return sorted(unique, key=score_url, reverse=True)
