import { DEFAULT_DOCUMENT_LINK_TERMS } from '../keywords.js';
import {
    canonicalizeMunicipalUrl,
    extractDate,
    htmlToText,
    inferDocumentType,
    sha256,
} from '../normalize.js';
import {
    DiscoveredMunicipalDocument,
    HtmlMunicipalSourceConfig,
    MunicipalAdapterContext,
    MunicipalSourceAdapter,
    NormalizedMunicipalDocument,
} from '../types.js';
import { fetchAndNormalizeDocument, fetchMunicipalResource } from './http.js';

interface HtmlLink {
    href: string;
    text: string;
}

function extractLinks(html: string): HtmlLink[] {
    const links: HtmlLink[] = [];
    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
        if (!href) continue;
        links.push({ href, text: htmlToText(match[2]) });
    }
    return links;
}

function sourceOf(context: MunicipalAdapterContext): HtmlMunicipalSourceConfig {
    if (context.source.type !== 'html') throw new Error('HtmlMunicipalAdapter received a non-html source');
    return context.source;
}

function discoveredBase(context: MunicipalAdapterContext) {
    return {
        municipalityId: context.municipality.id,
        municipality: context.municipality.name,
        state: context.municipality.state,
        county: context.municipality.county || null,
        sourceId: context.source.id,
        sourcePlatform: 'official-html' as const,
        boardBody: context.source.body || null,
    };
}

export class HtmlMunicipalAdapter implements MunicipalSourceAdapter {
    readonly type = 'html' as const;

    async discover(context: MunicipalAdapterContext): Promise<DiscoveredMunicipalDocument[]> {
        const source = sourceOf(context);
        const resource = await fetchMunicipalResource(source.url, context);
        if (!resource.mediaType.includes('html')) {
            throw new Error(`HTML source returned ${resource.mediaType}`);
        }
        const html = new TextDecoder('utf-8').decode(resource.bytes);
        const baseUrl = new URL(source.url);
        const allowedHosts = new Set([baseUrl.hostname.toLowerCase(), ...(source.allowedDocumentHosts || []).map(h => h.toLowerCase())]);
        const terms = [...DEFAULT_DOCUMENT_LINK_TERMS, ...(source.documentLinkTerms || [])].map(term => term.toLowerCase());
        const documents: DiscoveredMunicipalDocument[] = [];

        if (source.includeSourcePage) {
            documents.push({
                ...discoveredBase(context),
                sourceDocumentId: `html-page:${sha256(canonicalizeMunicipalUrl(source.url)).slice(0, 20)}`,
                sourcePageUrl: source.url,
                documentUrl: source.url,
                title: `${source.body} official meeting page`,
                meetingDate: extractDate(htmlToText(html)),
                documentType: 'meeting-page',
                platformMetadata: { discovery: 'configured-source-page' },
            });
        }

        for (const link of extractLinks(html)) {
            let resolved: URL;
            try {
                resolved = new URL(link.href, source.url);
            } catch {
                continue;
            }
            if (!['http:', 'https:'].includes(resolved.protocol) || !allowedHosts.has(resolved.hostname.toLowerCase())) continue;
            const combined = `${link.text} ${resolved.pathname} ${resolved.search}`.toLowerCase();
            if (!terms.some(term => combined.includes(term))) continue;
            const canonical = canonicalizeMunicipalUrl(resolved.toString());
            documents.push({
                ...discoveredBase(context),
                sourceDocumentId: `html-link:${sha256(canonical).slice(0, 20)}`,
                sourcePageUrl: source.url,
                documentUrl: canonical,
                title: link.text || resolved.pathname.split('/').filter(Boolean).pop() || 'Official municipal document',
                meetingDate: extractDate(combined),
                documentType: inferDocumentType(combined),
                platformMetadata: { discovery: 'official-page-link' },
            });
        }

        const unique = new Map<string, DiscoveredMunicipalDocument>();
        for (const document of documents) unique.set(document.documentUrl, document);
        return [...unique.values()];
    }

    fetchDocument(
        document: DiscoveredMunicipalDocument,
        context: MunicipalAdapterContext,
    ): Promise<NormalizedMunicipalDocument> {
        sourceOf(context);
        return fetchAndNormalizeDocument(document, context);
    }
}
