import { MunicipalKeywordConfig } from './types.js';

export const DEFAULT_MUNICIPAL_KEYWORDS: MunicipalKeywordConfig = {
    uses: [
        'industrial', 'warehouse', 'warehouses', 'warehousing', 'logistics',
        'distribution center', 'distribution centers', 'fulfillment', 'manufacturing',
        'data center', 'data centers', 'data centre', 'data centres', 'cold storage',
        'flex industrial',
    ],
    landUse: [
        'site plan', 'preliminary site plan', 'final site plan', 'major site plan',
        'variance', 'rezoning', 'zoning amendment', 'redevelopment', 'redevelopment plan',
        'land development', 'subdivision', 'conditional use', 'special exception',
        'entitlement', 'public hearing',
    ],
    governmentAction: [
        'application', 'ordinance', 'resolution', 'approval', 'approved', 'denial',
        'denied', 'continued', 'adjourned', 'tabled', 'moratorium', 'prohibition',
        'restriction', 'ban', 'banned', 'pause', 'paused', 'permit', 'planning board',
        'zoning board', 'opposition', 'appeal', 'revised',
    ],
};

export const DEFAULT_DOCUMENT_LINK_TERMS = [
    'agenda', 'minutes', 'packet', 'ordinance', 'resolution', 'application',
    'planning board', 'zoning board', 'public hearing',
];

export function mergeMunicipalKeywords(overrides: Partial<MunicipalKeywordConfig> | undefined): MunicipalKeywordConfig {
    const merge = (base: string[], extra: string[] | undefined) => [
        ...new Set([...base, ...(extra || [])].map(term => term.trim().toLowerCase()).filter(Boolean)),
    ];
    return {
        uses: merge(DEFAULT_MUNICIPAL_KEYWORDS.uses, overrides?.uses),
        landUse: merge(DEFAULT_MUNICIPAL_KEYWORDS.landUse, overrides?.landUse),
        governmentAction: merge(DEFAULT_MUNICIPAL_KEYWORDS.governmentAction, overrides?.governmentAction),
    };
}
