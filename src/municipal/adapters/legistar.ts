import { inferDocumentType, parsePlatformDate } from '../normalize.js';
import {
    DiscoveredMunicipalDocument,
    LegistarMunicipalSourceConfig,
    MunicipalAdapterContext,
    MunicipalSourceAdapter,
    NormalizedMunicipalDocument,
} from '../types.js';
import { fetchAndNormalizeDocument, fetchMunicipalResource } from './http.js';

interface LegistarEvent {
    EventId?: number;
    EventGuid?: string;
    EventBodyName?: string;
    EventDate?: string;
    EventTime?: string;
    EventAgendaStatusName?: string;
    EventAgendaFile?: string;
    EventMinutesFile?: string;
    EventInSiteURL?: string;
    EventLastModifiedUtc?: string;
}

function sourceOf(context: MunicipalAdapterContext): LegistarMunicipalSourceConfig {
    if (context.source.type !== 'legistar') throw new Error('LegistarMunicipalAdapter received a non-legistar source');
    return context.source;
}

function discoveryUrl(source: LegistarMunicipalSourceConfig, now: Date): string {
    const url = new URL(source.url);
    const cutoff = new Date(now.getTime() - (source.lookbackDays || 45) * 86_400_000).toISOString().slice(0, 10);
    if (!url.searchParams.has('$filter')) url.searchParams.set('$filter', `EventDate ge datetime'${cutoff}T00:00:00'`);
    if (!url.searchParams.has('$orderby')) url.searchParams.set('$orderby', 'EventDate desc');
    if (!url.searchParams.has('$top')) url.searchParams.set('$top', String(source.eventLimit || 100));
    return url.toString();
}

function absoluteUrl(value: string, sourceUrl: string): string | null {
    try {
        const url = new URL(value, sourceUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch {
        return null;
    }
}

export class LegistarMunicipalAdapter implements MunicipalSourceAdapter {
    readonly type = 'legistar' as const;

    async discover(context: MunicipalAdapterContext): Promise<DiscoveredMunicipalDocument[]> {
        const source = sourceOf(context);
        const resource = await fetchMunicipalResource(discoveryUrl(source, context.now()), context);
        const text = new TextDecoder('utf-8').decode(resource.bytes);
        let events: LegistarEvent[];
        try {
            const parsed = JSON.parse(text);
            events = Array.isArray(parsed) ? parsed : [];
        } catch {
            throw new Error('Legistar events endpoint returned invalid JSON');
        }
        const bodyFilters = (source.bodies || []).map(body => body.toLowerCase());
        const documents: DiscoveredMunicipalDocument[] = [];

        for (const event of events) {
            const body = event.EventBodyName || source.body;
            if (bodyFilters.length && !bodyFilters.some(filter => body.toLowerCase().includes(filter))) continue;
            if (event.EventId === undefined) continue;
            const meetingDate = parsePlatformDate(event.EventDate);
            const pageUrl = absoluteUrl(event.EventInSiteURL || '', source.url) || source.url;
            const files = [
                { kind: 'agenda', url: event.EventAgendaFile },
                { kind: 'minutes', url: event.EventMinutesFile },
            ];
            for (const file of files) {
                if (!file.url) continue;
                const documentUrl = absoluteUrl(file.url, source.url);
                if (!documentUrl) continue;
                const title = `${body} ${meetingDate || ''} ${file.kind}`.replace(/\s+/g, ' ').trim();
                documents.push({
                    municipalityId: context.municipality.id,
                    municipality: context.municipality.name,
                    state: context.municipality.state,
                    county: context.municipality.county || null,
                    sourceId: source.id,
                    sourcePlatform: 'legistar',
                    sourceDocumentId: `legistar:${event.EventId}:${file.kind}`,
                    sourcePageUrl: pageUrl,
                    documentUrl,
                    title,
                    boardBody: body || null,
                    meetingDate,
                    documentType: inferDocumentType(file.kind),
                    platformMetadata: {
                        eventId: event.EventId,
                        eventGuid: event.EventGuid || null,
                        agendaStatus: event.EventAgendaStatusName || null,
                        eventTime: event.EventTime || null,
                        lastModifiedUtc: event.EventLastModifiedUtc || null,
                    },
                });
            }
        }
        return documents;
    }

    fetchDocument(
        document: DiscoveredMunicipalDocument,
        context: MunicipalAdapterContext,
    ): Promise<NormalizedMunicipalDocument> {
        sourceOf(context);
        return fetchAndNormalizeDocument(document, context);
    }
}
