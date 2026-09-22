import {
    DiscoveredMunicipalDocument,
    MunicipalAdapterContext,
    NormalizedMunicipalDocument,
} from '../types.js';
import { canonicalizeMunicipalUrl, htmlToText, normalizeWhitespace, sha256, stableMunicipalId } from '../normalize.js';

export interface FetchedMunicipalResource {
    bytes: Uint8Array;
    mediaType: string;
}

export async function fetchMunicipalResource(
    url: string,
    context: MunicipalAdapterContext,
): Promise<FetchedMunicipalResource> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.request.timeoutMs);
    try {
        const response = await context.fetcher(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': context.request.userAgent,
                Accept: 'text/html,application/json,text/plain,application/pdf,*/*;q=0.5',
            },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (declaredLength > context.request.maxBytes) {
            throw new Error(`Response exceeds maxBytes (${declaredLength} > ${context.request.maxBytes})`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > context.request.maxBytes) {
            throw new Error(`Response exceeds maxBytes (${bytes.byteLength} > ${context.request.maxBytes})`);
        }
        return {
            bytes,
            mediaType: (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].toLowerCase(),
        };
    } catch (error) {
        if ((error as Error).name === 'AbortError') throw new Error(`Request timed out after ${context.request.timeoutMs}ms`);
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function resourceText(resource: FetchedMunicipalResource): { text: string; notes: string[] } {
    const raw = new TextDecoder('utf-8').decode(resource.bytes);
    if (resource.mediaType === 'application/pdf') {
        return { text: '', notes: ['PDF_TEXT_EXTRACTION_DEFERRED_V1'] };
    }
    if (resource.mediaType.includes('html') || resource.mediaType.includes('xml')) {
        return { text: htmlToText(raw), notes: [] };
    }
    if (resource.mediaType.includes('json')) {
        try {
            return { text: normalizeWhitespace(JSON.stringify(JSON.parse(raw), null, 2)), notes: [] };
        } catch {
            return { text: normalizeWhitespace(raw), notes: ['INVALID_JSON_TREATED_AS_TEXT'] };
        }
    }
    if (resource.mediaType.startsWith('text/')) return { text: normalizeWhitespace(raw), notes: [] };
    return { text: '', notes: [`UNSUPPORTED_MEDIA_TYPE:${resource.mediaType}`] };
}

export async function fetchAndNormalizeDocument(
    document: DiscoveredMunicipalDocument,
    context: MunicipalAdapterContext,
): Promise<NormalizedMunicipalDocument> {
    const resource = await fetchMunicipalResource(document.documentUrl, context);
    const contentHash = sha256(resource.bytes);
    const documentKey = stableMunicipalId(
        'mdoc',
        document.municipalityId,
        document.sourceId,
        document.sourceDocumentId || canonicalizeMunicipalUrl(document.documentUrl),
    );
    const documentRevisionId = stableMunicipalId('mrev', documentKey, contentHash);
    const fetched = resourceText(resource);
    const now = context.now().toISOString();
    return {
        ...document,
        documentKey,
        documentRevisionId,
        mediaType: resource.mediaType,
        text: fetched.text,
        contentHash,
        retrievedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        extractionStatus: fetched.text ? 'text-ready' : 'metadata-only',
        acquisitionNotes: fetched.notes,
    };
}
