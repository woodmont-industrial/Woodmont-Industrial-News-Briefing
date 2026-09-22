import { extractDate, normalizeWhitespace } from './normalize.js';
import {
    MunicipalEventDraft,
    MunicipalExtractionInput,
    MunicipalExtractor,
    MunicipalLifecycleStatus,
    MunicipalUseType,
} from './types.js';

function labelledValue(text: string, labels: string[]): string | null {
    const label = labels.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const match = text.match(new RegExp(`^\\s*(?:${label})\\s*:\\s*(.+?)\\s*$`, 'im'));
    if (!match) return null;
    const value = normalizeWhitespace(match[1]).replace(/[.;]+$/, '').trim();
    return value && value.length <= 240 ? value : null;
}

function siteAddress(text: string): string | null {
    const labelled = labelledValue(text, ['Site Address', 'Address', 'Property']);
    if (labelled && /^\d/.test(labelled)) return labelled;
    const match = text.match(/\b\d{1,6}\s+(?:[A-Za-z0-9][A-Za-z0-9.'-]*\s+){1,8}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Highway|Hwy\.?|Route|Parkway|Pkwy\.?|Turnpike|Court|Ct\.?|Way)\b(?:,\s*[A-Za-z .'-]+)?/i);
    return match ? normalizeWhitespace(match[0]).replace(/[.,;]+$/, '') : null;
}

function largestNumber(text: string, regex: RegExp, multiplier: (unit: string | undefined) => number): number | null {
    let best: number | null = null;
    for (const match of text.matchAll(regex)) {
        const value = Number(match[1].replace(/,/g, '')) * multiplier(match[2]);
        if (Number.isFinite(value)) best = Math.max(best || 0, value);
    }
    return best;
}

export function inferMunicipalStatus(text: string): MunicipalLifecycleStatus {
    if (/\b(revised|amended|resubmitted)\s+(?:site\s+plan|application|plans?)\b/i.test(text)) return 'REVISED';
    if (/\b(appeal|appealed|appealing)\b/i.test(text)) return 'APPEAL';
    if (/\b(denied|denial|rejected|disapproved)\b/i.test(text)) return 'DENIED';
    if (/\b(conditionally\s+approved|approved|approval\s+granted|adopted)\b/i.test(text)) return 'APPROVED';
    if (/\b(continued|adjourned|tabled|carried)\b/i.test(text)) return 'CONTINUED';
    if (/\b(testimony\s+(?:was\s+)?heard|hearing\s+(?:was\s+)?held|heard\s+by)\b/i.test(text)) return 'HEARD';
    if (/\b(scheduled|will\s+hear|to\s+be\s+heard|upcoming\s+hearing|public\s+hearing\s+(?:on|set))\b/i.test(text)) return 'SCHEDULED';
    if (/\b(new\s+application|application\s+(?:submitted|filed|received))\b/i.test(text)) return 'NEW_APPLICATION';
    return 'UNKNOWN';
}

function inferDecision(status: MunicipalLifecycleStatus): string | null {
    if (status === 'APPROVED') return 'approved';
    if (status === 'DENIED') return 'denied';
    if (status === 'CONTINUED') return 'continued';
    return null;
}

function inferUseType(text: string): MunicipalUseType {
    if (/\bdata\s+cent(?:er|re)s?\b/i.test(text)) return 'data-center';
    if (/\bcold\s+storage\b/i.test(text)) return 'cold-storage';
    if (/\bdistribution\s+cent(?:er|re)s?\b/i.test(text)) return 'distribution-center';
    if (/\bfulfillment\b/i.test(text)) return 'fulfillment';
    if (/\bwarehous(?:e|es|ing)\b/i.test(text)) return 'warehouse';
    if (/\blogistics\b/i.test(text)) return 'logistics';
    if (/\bmanufactur(?:ing|er|ers)\b/i.test(text)) return 'manufacturing';
    if (/\bflex\s+industrial\b/i.test(text)) return 'flex-industrial';
    if (/\bindustrial\b/i.test(text)) return 'industrial';
    return 'unknown';
}

function inferActionRequested(text: string): string | null {
    const phrases = [
        'preliminary and final major site plan', 'preliminary and final site plan',
        'preliminary site plan', 'final site plan', 'major site plan', 'site plan approval',
        'zoning amendment', 'redevelopment application', 'redevelopment plan', 'land development', 'conditional use',
        'special exception', 'use variance', 'bulk variance', 'rezoning', 'subdivision',
        'site plan', 'variance', 'ordinance', 'moratorium',
    ];
    const lower = text.toLowerCase();
    return phrases.find(phrase => lower.includes(phrase)) || null;
}

function nextHearingDate(text: string): string | null {
    const match = text.match(/\b(?:(?:continued|adjourned|next\s+hearing|rescheduled)(?:\s+(?:to|until|for|on|is))?|(?:public\s+)?hearing\s+(?:is\s+)?scheduled\s+(?:for|on))\s+([^\n.;]{3,60})/i);
    return match ? extractDate(match[1]) : null;
}

export class BaselineMunicipalExtractor implements MunicipalExtractor {
    readonly name = 'deterministic-baseline-v1';

    async extract(input: MunicipalExtractionInput): Promise<MunicipalEventDraft[]> {
        const { document, screening } = input;
        const text = [document.title, document.boardBody || '', document.text].filter(Boolean).join('\n');
        const projectName = labelledValue(text, ['Project', 'Project Name', 'Application Name']);
        const address = siteAddress(text);
        const applicantDeveloper = labelledValue(text, ['Applicant', 'Applicant/Developer', 'Developer']);
        const owner = labelledValue(text, ['Owner', 'Property Owner']);
        const squareFeet = largestNumber(
            text,
            /\b(\d[\d,]*(?:\.\d+)?)\s*(million)?\s*(?:square\s*(?:feet|foot)|sq\.?\s*ft|sf)\b/gi,
            unit => unit ? 1_000_000 : 1,
        );
        const acreage = largestNumber(text, /\b(\d[\d,]*(?:\.\d+)?)\s*()\s*-?\s*acres?\b/gi, () => 1);
        const status = inferMunicipalStatus(text);
        const actionRequested = inferActionRequested(text);
        const useType = inferUseType(text);

        let confidence = 0.35;
        if (useType !== 'unknown') confidence += 0.15;
        if (address) confidence += 0.15;
        if (applicantDeveloper) confidence += 0.1;
        if (actionRequested) confidence += 0.1;
        if (status !== 'UNKNOWN') confidence += 0.1;
        if (projectName) confidence += 0.05;
        if (document.extractionStatus === 'metadata-only') confidence = Math.min(confidence, 0.45);

        const extractionNotes = [`extractor:${this.name}`];
        if (document.extractionStatus === 'metadata-only') extractionNotes.push(...document.acquisitionNotes);
        if (!projectName && !address && !applicantDeveloper) extractionNotes.push('NO_STRONG_PROJECT_IDENTITY_EXTRACTED');

        return [{
            municipalityId: document.municipalityId,
            municipality: document.municipality,
            state: document.state,
            county: document.county,
            boardBody: document.boardBody,
            meetingDate: document.meetingDate,
            documentType: document.documentType,
            projectName,
            siteAddress: address,
            applicantDeveloper,
            owner,
            useType,
            squareFeet,
            acreage,
            actionRequested,
            status,
            decision: inferDecision(status),
            nextHearingDate: nextHearingDate(text),
            matchedKeywords: screening.matchedKeywords,
            sourcePlatform: document.sourcePlatform,
            sourcePageUrl: document.sourcePageUrl,
            documentUrl: document.documentUrl,
            sourceDocumentId: document.sourceDocumentId,
            documentRevisionId: document.documentRevisionId,
            retrievedAt: document.retrievedAt,
            contentHash: document.contentHash,
            confidence: Number(Math.min(confidence, 0.95).toFixed(2)),
            extractionNotes,
        }];
    }
}
