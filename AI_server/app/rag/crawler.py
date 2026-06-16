"""Browser-based web crawling via crawl4ai (Playwright), with graceful fallback.

crawl4ai renders JavaScript and emits clean, LLM-ready markdown — far better RAG input
than raw HTML. It's a heavy dependency (bundles a headless Chromium), so every entry
point here degrades to the lightweight httpx + trafilatura loaders if the browser engine
is unavailable or errors out. That keeps ingestion working even where Chromium can't run.

Three entry points, all returning `list[LoadedDoc]`:
  • crawl_single  — one page (JS-rendered)
  • crawl_deep    — BFS over internal links, depth/page capped
  • crawl_sitemap — parse sitemap.xml, then crawl each listed URL

`load_sitemap_urls` is the (sync) sitemap XML parser, shared with the fallback path.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse
from xml.etree import ElementTree

from app.core.config import get_settings
from app.rag import loaders
from app.rag.loaders import LoadedDoc

logger = logging.getLogger(__name__)


# ── Sitemap parsing (engine-independent) ─────────────────────────────────────
def load_sitemap_urls(sitemap_url: str) -> list[str]:
    """Fetch a sitemap.xml and return its <loc> URLs (flat sitemaps; ignores indexes)."""
    import httpx

    resp = httpx.get(
        sitemap_url, follow_redirects=True, timeout=30.0, headers=loaders._BROWSER_HEADERS
    )
    resp.raise_for_status()
    root = ElementTree.fromstring(resp.text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [loc.text for loc in root.findall(".//sm:url/sm:loc", ns) if loc.text]


# ── crawl4ai result helpers (tolerant of version differences) ────────────────
def _markdown_of(result) -> str:
    md = getattr(result, "markdown", None)
    if md is None:
        return ""
    if isinstance(md, str):
        return md
    # Newer crawl4ai returns a MarkdownGenerationResult object.
    return getattr(md, "fit_markdown", None) or getattr(md, "raw_markdown", "") or str(md)


def _title_of(result, fallback: str) -> str:
    meta = getattr(result, "metadata", None) or {}
    if isinstance(meta, dict):
        return meta.get("title") or fallback
    return fallback


def _internal_links(result) -> list[str]:
    links = getattr(result, "links", None) or {}
    internal = links.get("internal", []) if isinstance(links, dict) else []
    out: list[str] = []
    for link in internal:
        href = link.get("href") if isinstance(link, dict) else link
        if href:
            out.append(href)
    return out


def _browser_available() -> bool:
    if not get_settings().crawl_browser_enabled:
        return False
    try:
        import crawl4ai  # noqa: F401
    except Exception:  # noqa: BLE001 — not installed / import error
        return False
    return True


def _run_config():
    """Minimal, version-tolerant CrawlerRunConfig (falls back to None if the API differs)."""
    try:
        from crawl4ai import CrawlerRunConfig

        return CrawlerRunConfig(page_timeout=get_settings().crawl_page_timeout_ms)
    except Exception:  # noqa: BLE001
        return None


# ── Public entry points ──────────────────────────────────────────────────────
async def crawl_single(url: str) -> list[LoadedDoc]:
    """Render a single page and return its markdown (fallback: trafilatura)."""
    if not _browser_available():
        return loaders.load_url(url)
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig

        run_cfg = _run_config()
        async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)
        if not getattr(result, "success", True):
            raise RuntimeError(getattr(result, "error_message", "crawl failed"))
        text = _markdown_of(result)
        if not text.strip():
            raise RuntimeError("empty markdown")
        return [LoadedDoc(title=_title_of(result, url), text=text, metadata={"url": url})]
    except Exception as exc:  # noqa: BLE001 — degrade to the lightweight loader
        logger.warning("crawl4ai single-page failed for %s (%s); falling back", url, exc)
        return loaders.load_url(url)


async def crawl_deep(
    start_url: str, *, max_pages: int | None = None, max_depth: int | None = None
) -> list[LoadedDoc]:
    """BFS-crawl internal links from start_url, capped by depth and page count.

    Only follows links on the same host as start_url. One browser session is reused for
    the whole crawl. Falls back to a single-page fetch if the browser engine is missing.
    """
    settings = get_settings()
    max_pages = min(max_pages or settings.crawl_max_pages, settings.crawl_max_pages)
    max_depth = settings.crawl_max_depth if max_depth is None else max_depth

    if not _browser_available():
        return loaders.load_url(start_url)

    base_host = urlparse(start_url).netloc
    visited: set[str] = set()
    queue: list[tuple[str, int]] = [(start_url, 0)]
    docs: list[LoadedDoc] = []

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig

        run_cfg = _run_config()
        async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
            while queue and len(docs) < max_pages:
                url, depth = queue.pop(0)
                if url in visited:
                    continue
                visited.add(url)
                try:
                    result = await crawler.arun(url=url, config=run_cfg)
                except Exception as exc:  # noqa: BLE001 — skip one bad page
                    logger.warning("crawl page failed %s (%s)", url, exc)
                    continue
                if not getattr(result, "success", True):
                    continue
                text = _markdown_of(result)
                if text.strip():
                    docs.append(
                        LoadedDoc(title=_title_of(result, url), text=text, metadata={"url": url})
                    )
                if depth < max_depth:
                    for link in _internal_links(result):
                        if urlparse(link).netloc == base_host and link not in visited:
                            queue.append((link, depth + 1))
    except Exception as exc:  # noqa: BLE001
        logger.warning("crawl4ai deep crawl failed for %s (%s); falling back", start_url, exc)
        return docs or loaders.load_url(start_url)

    return docs or loaders.load_url(start_url)


async def crawl_sitemap(sitemap_url: str, *, max_pages: int | None = None) -> list[LoadedDoc]:
    """Parse a sitemap and fetch each listed URL (up to max_pages).

    Sitemaps enumerate many content pages, so this uses the fast httpx + trafilatura
    path rather than the browser — driving a headless Chromium across a whole site
    (tens of seconds per page) is prohibitively slow. The browser engine is reserved
    for single-URL (`crawl_single`) and deep (`crawl_deep`) crawls where JS rendering
    matters most. Pages are fetched concurrently with a small bound.
    """
    settings = get_settings()
    max_pages = min(max_pages or settings.crawl_max_pages, settings.crawl_max_pages)

    try:
        urls = load_sitemap_urls(sitemap_url)[:max_pages]
    except Exception as exc:  # noqa: BLE001
        logger.warning("sitemap parse failed for %s (%s)", sitemap_url, exc)
        return []

    import asyncio

    sem = asyncio.Semaphore(8)

    async def _fetch(url: str) -> list[LoadedDoc]:
        async with sem:
            try:
                # loaders.load_url is sync (httpx + trafilatura); run off the loop.
                return await asyncio.to_thread(loaders.load_url, url)
            except Exception:  # noqa: BLE001 — skip individual page failures
                return []

    results = await asyncio.gather(*(_fetch(u) for u in urls))
    return [doc for batch in results for doc in batch]
