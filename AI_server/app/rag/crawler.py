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
def load_sitemap_urls(sitemap_url: str, *, _depth: int = 0) -> list[str]:
    """Fetch a sitemap and return page URLs. Handles a flat <urlset>, a nested
    <sitemapindex> (recursing into child sitemaps), and plain-text `.txt` sitemaps
    (one URL per line) — all valid per the sitemaps.org protocol."""
    import httpx

    resp = httpx.get(
        sitemap_url, follow_redirects=True, timeout=30.0, headers=loaders._BROWSER_HEADERS
    )
    resp.raise_for_status()
    text = resp.text

    # Plain-text sitemap (.txt): one URL per line. Big sites (e.g. Razorpay docs) point
    # their <sitemapindex> at a .txt list rather than XML, so this also handles children.
    if not text.lstrip().startswith("<"):
        return [
            ln.strip()
            for ln in text.splitlines()
            if ln.strip().startswith(("http://", "https://"))
        ]

    root = ElementTree.fromstring(text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

    # Sitemap index → recurse into child sitemaps (bounded depth + count).
    children = [loc.text for loc in root.findall(".//sm:sitemap/sm:loc", ns) if loc.text]
    if children and _depth < 2:
        urls: list[str] = []
        for child in children[:50]:
            try:
                urls.extend(load_sitemap_urls(child, _depth=_depth + 1))
            except Exception:  # noqa: BLE001 — skip an unreachable child sitemap
                continue
        return urls

    return [loc.text for loc in root.findall(".//sm:url/sm:loc", ns) if loc.text]


def discover_sitemap(page_url: str) -> str | None:
    """Find a site's sitemap from any page URL: check /robots.txt for a `Sitemap:` line,
    then fall back to common locations. Returns the first sitemap URL that parses to a
    non-empty list of pages, else None. Used to turn a plain homepage + "whole-site crawl"
    into a precise, progress-tracked sitemap ingest."""
    import httpx
    from urllib.parse import urljoin

    p = urlparse(page_url)
    if not p.scheme or not p.netloc:
        return None
    root = f"{p.scheme}://{p.netloc}"

    candidates: list[str] = []
    # 1) robots.txt advertises the canonical sitemap(s).
    try:
        r = httpx.get(
            urljoin(root, "/robots.txt"), follow_redirects=True, timeout=15.0,
            headers=loaders._BROWSER_HEADERS,
        )
        if r.status_code == 200:
            for line in r.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    candidates.append(line.split(":", 1)[1].strip())
    except Exception:  # noqa: BLE001 — robots.txt is best-effort
        pass
    # 2) Common conventional paths.
    candidates += [urljoin(root, path) for path in ("/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml")]

    seen: set[str] = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        try:
            if load_sitemap_urls(cand):  # non-empty → it's a real sitemap
                logger.info("discovered sitemap %s for %s", cand, page_url)
                return cand
        except Exception:  # noqa: BLE001 — try the next candidate
            continue
    return None


async def crawl_urls(urls: list[str], *, concurrency: int | None = None) -> list[LoadedDoc]:
    """Fetch many URLs concurrently via the fast httpx+trafilatura path, with bounded
    parallelism + per-URL retries/backoff (rate-limit friendly). Failures are skipped."""
    import asyncio

    s = get_settings()
    sem = asyncio.Semaphore(concurrency or s.sitemap_concurrency)
    retries = s.crawl_fetch_retries

    async def _fetch(url: str) -> list[LoadedDoc]:
        async with sem:
            for attempt in range(retries + 1):
                try:
                    return await asyncio.to_thread(loaders.load_url, url)
                except Exception:  # noqa: BLE001
                    if attempt < retries:
                        await asyncio.sleep(0.5 * (attempt + 1))  # backoff
                    else:
                        return []
            return []

    results = await asyncio.gather(*(_fetch(u) for u in urls))
    return [doc for batch in results for doc in batch]


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
    """Version-tolerant CrawlerRunConfig. Waits a few seconds after load so JS-rendered
    content (SPA/Next.js prices, specs, etc.) is captured. Falls back gracefully if the
    installed crawl4ai doesn't accept some kwargs."""
    s = get_settings()
    try:
        from crawl4ai import CrawlerRunConfig

        try:
            return CrawlerRunConfig(
                page_timeout=s.crawl_page_timeout_ms,
                wait_until="load",
                delay_before_return_html=s.crawl_render_delay_sec,
            )
        except TypeError:
            # Older crawl4ai without these kwargs — degrade to the basic config.
            return CrawlerRunConfig(page_timeout=s.crawl_page_timeout_ms)
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
        best, title = "", url
        # JS/SPA pages (e.g. e-commerce prices) render inconsistently — sometimes only the
        # shell loads before capture. Retry a few times in one browser session and keep the
        # fullest render; stop early once it's clearly complete.
        async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
            for _ in range(3):
                result = await crawler.arun(url=url, config=run_cfg)
                if not getattr(result, "success", True):
                    continue
                text = _markdown_of(result)
                if len(text) > len(best):
                    best, title = text, _title_of(result, url)
                if len(best) > 5000:  # fully rendered, no need to retry
                    break
        if not best.strip():
            raise RuntimeError("empty markdown")
        return [LoadedDoc(title=title, text=best, metadata={"url": url})]
    except Exception as exc:  # noqa: BLE001 — degrade to the lightweight loader
        logger.warning("crawl4ai single-page failed for %s (%s); falling back", url, exc)
        return loaders.load_url(url)


async def _crawl_deep_httpx(start_url: str, max_pages: int, max_depth: int) -> list[LoadedDoc]:
    """Browser-free whole-site crawl: BFS over same-host links using httpx, extracting
    readable text with trafilatura. Used when no sitemap was found and the browser engine
    is unavailable — so 'crawl the whole site' still covers more than the landing page."""
    import re
    import httpx
    import trafilatura
    from urllib.parse import urldefrag, urljoin

    base_host = urlparse(start_url).netloc
    start = urldefrag(start_url)[0]
    seen: set[str] = {start}
    queue: list[tuple[str, int]] = [(start, 0)]
    docs: list[LoadedDoc] = []
    href_re = re.compile(r'href=["\']([^"\'#?]+)', re.IGNORECASE)

    async with httpx.AsyncClient(
        follow_redirects=True, timeout=20.0, headers=loaders._BROWSER_HEADERS
    ) as client:
        while queue and len(docs) < max_pages:
            url, depth = queue.pop(0)
            try:
                resp = await client.get(url)
            except Exception:  # noqa: BLE001 — skip an unreachable page
                continue
            if resp.status_code != 200 or "html" not in resp.headers.get("content-type", ""):
                continue
            html = resp.text
            text = trafilatura.extract(html) or ""
            if text.strip():
                meta = trafilatura.extract_metadata(html)
                title = (getattr(meta, "title", None) if meta else None) or url
                docs.append(LoadedDoc(title=title, text=text, metadata={"url": url}))
            if depth < max_depth:
                for raw in href_re.findall(html):
                    link = urldefrag(urljoin(url, raw))[0]
                    if (
                        link.startswith("http")
                        and urlparse(link).netloc == base_host
                        and link not in seen
                    ):
                        seen.add(link)
                        queue.append((link, depth + 1))
    return docs or loaders.load_url(start_url)


async def crawl_deep(
    start_url: str, *, max_pages: int | None = None, max_depth: int | None = None
) -> list[LoadedDoc]:
    """BFS-crawl internal links from start_url, capped by depth and page count.

    Only follows links on the same host as start_url. Uses a browser when available for
    JS-rendered sites; otherwise a fast httpx link-follower covers the whole site.
    """
    settings = get_settings()
    max_pages = min(max_pages or settings.crawl_max_pages, settings.crawl_max_pages)
    max_depth = settings.crawl_max_depth if max_depth is None else max_depth

    if not _browser_available():
        return await _crawl_deep_httpx(start_url, max_pages, max_depth)

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
