"""Extract plain text from a source (PDF / DOCX / TXT / URL / sitemap).

Returns one or more (title, text) documents. A single file is one document; a sitemap
fans out to one document per crawled page.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from xml.etree import ElementTree

# A bare httpx client (no UA) gets 403'd by many sites' bot protection. Present a
# realistic browser User-Agent so the lightweight fetch path isn't blocked outright.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class LoadedDoc:
    title: str
    text: str
    metadata: dict


def load_pdf(data: bytes, *, title: str) -> list[LoadedDoc]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "") for page in reader.pages]
    text = "\n\n".join(p.strip() for p in pages if p.strip())
    return [LoadedDoc(title=title, text=text, metadata={"pages": len(pages)})]


def load_docx(data: bytes, *, title: str) -> list[LoadedDoc]:
    from docx import Document

    doc = Document(io.BytesIO(data))
    text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return [LoadedDoc(title=title, text=text, metadata={})]


def load_txt(data: bytes, *, title: str) -> list[LoadedDoc]:
    return [LoadedDoc(title=title, text=data.decode("utf-8", errors="replace"), metadata={})]


def load_url(url: str) -> list[LoadedDoc]:
    import httpx
    import trafilatura

    resp = httpx.get(url, follow_redirects=True, timeout=30.0, headers=_BROWSER_HEADERS)
    resp.raise_for_status()
    extracted = trafilatura.extract(resp.text) or ""
    title = trafilatura.extract_metadata(resp.text)
    title_str = (title.title if title and title.title else url)
    return [LoadedDoc(title=title_str, text=extracted, metadata={"url": url})]


def load_sitemap(sitemap_url: str, *, max_pages: int = 50) -> list[LoadedDoc]:
    """Fetch a sitemap.xml, crawl up to max_pages URLs, extract each."""
    import httpx

    resp = httpx.get(sitemap_url, follow_redirects=True, timeout=30.0, headers=_BROWSER_HEADERS)
    resp.raise_for_status()
    root = ElementTree.fromstring(resp.text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [loc.text for loc in root.findall(".//sm:url/sm:loc", ns) if loc.text]

    docs: list[LoadedDoc] = []
    for url in urls[:max_pages]:
        try:
            docs.extend(load_url(url))
        except Exception:  # noqa: BLE001 — skip individual page failures
            continue
    return docs


def load_bytes(source_type: str, data: bytes, *, title: str) -> list[LoadedDoc]:
    """Dispatch a downloaded file by source type."""
    if source_type == "pdf":
        return load_pdf(data, title=title)
    if source_type == "docx":
        return load_docx(data, title=title)
    if source_type == "txt":
        return load_txt(data, title=title)
    raise ValueError(f"load_bytes does not handle source type: {source_type}")
