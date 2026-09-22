import {
    MunicipalKeywordConfig,
    MunicipalKeywordEvidence,
    MunicipalKeywordGroup,
    MunicipalScreeningResult,
    NormalizedMunicipalDocument,
} from './types.js';

const PROXIMITY_LIMIT = 600;
const STRONG_ACTIONS = new Set([
    'ordinance', 'denial', 'denied', 'continued', 'adjourned', 'tabled', 'moratorium',
    'prohibition', 'restriction', 'planning board', 'zoning board', 'opposition',
    'ban', 'banned', 'pause', 'paused', 'appeal', 'revised',
]);
const UNRELATED_INDUSTRIAL = /\bindustrial\s+(arts?|design\s+(?:course|curriculum)|revolution|hygiene|psychology)\b/i;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excerptAt(text: string, index: number, termLength: number): string {
    const start = Math.max(0, index - 90);
    const end = Math.min(text.length, index + termLength + 90);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function evidenceFor(text: string, group: MunicipalKeywordGroup, terms: string[]): MunicipalKeywordEvidence[] {
    const evidence: MunicipalKeywordEvidence[] = [];
    for (const term of [...terms].sort((a, b) => b.length - a.length)) {
        const regex = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(term)})(?=$|[^a-z0-9])`, 'gi');
        for (const match of text.matchAll(regex)) {
            const index = (match.index || 0) + match[1].length;
            evidence.push({ group, term, index, excerpt: excerptAt(text, index, term.length) });
        }
    }
    const unique = new Map<string, MunicipalKeywordEvidence>();
    for (const item of evidence) unique.set(`${item.group}:${item.term}:${item.index}`, item);
    return [...unique.values()].sort((a, b) => a.index - b.index);
}

function hasNearbyPair(left: MunicipalKeywordEvidence[], right: MunicipalKeywordEvidence[]): boolean {
    return left.some(a => right.some(b => Math.abs(a.index - b.index) <= PROXIMITY_LIMIT));
}

export function screenMunicipalDocument(
    document: NormalizedMunicipalDocument,
    keywords: MunicipalKeywordConfig,
    screenedAt: string,
): MunicipalScreeningResult {
    // Board/body metadata is useful provenance, but it is not evidence by itself.
    // Otherwise every unrelated Planning Board procurement item would inherit a
    // high-value keyword merely because of the source it came from.
    const text = [document.title, document.text].filter(Boolean).join('\n');
    let uses = evidenceFor(text, 'uses', keywords.uses);
    const landUse = evidenceFor(text, 'landUse', keywords.landUse);
    const governmentAction = evidenceFor(text, 'governmentAction', keywords.governmentAction);

    if (UNRELATED_INDUSTRIAL.test(text)) {
        uses = uses.filter(item => item.term !== 'industrial' || !UNRELATED_INDUSTRIAL.test(item.excerpt));
    }

    const strongGovernmentAction = governmentAction.filter(item => STRONG_ACTIONS.has(item.term));
    const hasUse = uses.length > 0;
    const useNearLandUse = hasNearbyPair(uses, landUse);
    const useNearStrongAction = hasNearbyPair(uses, strongGovernmentAction);
    const selected = hasUse && (useNearLandUse || useNearStrongAction);
    const reasonCodes: string[] = [];

    if (!hasUse) reasonCodes.push('NO_RELEVANT_USE');
    if (hasUse && !landUse.length && !strongGovernmentAction.length) reasonCodes.push('NO_ENTITLEMENT_OR_MATERIAL_ACTION');
    if (hasUse && (landUse.length || strongGovernmentAction.length) && !selected) reasonCodes.push('SIGNALS_NOT_CONTEXTUALLY_LINKED');
    if (useNearLandUse) reasonCodes.push('USE_AND_LAND_USE_MATCH');
    if (useNearStrongAction) reasonCodes.push('USE_AND_MATERIAL_ACTION_MATCH');
    if (document.extractionStatus === 'metadata-only') reasonCodes.push('METADATA_ONLY');

    return {
        documentRevisionId: document.documentRevisionId,
        selected,
        reasonCodes,
        matchedKeywords: [...uses, ...landUse, ...governmentAction].sort((a, b) => a.index - b.index),
        screenedAt,
    };
}
