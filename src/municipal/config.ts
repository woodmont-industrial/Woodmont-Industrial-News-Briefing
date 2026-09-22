import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    MUNICIPAL_SCHEMA_VERSION,
    MunicipalMonitorConfig,
    MunicipalRequestConfig,
    MunicipalSourceConfig,
} from './types.js';

export const DEFAULT_MUNICIPAL_REQUEST: MunicipalRequestConfig = {
    timeoutMs: 20_000,
    maxBytes: 15 * 1024 * 1024,
    userAgent: 'Woodmont-Municipal-Intelligence-Shadow/1.0 (+official-record-monitor)',
};

const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'request', 'keywords', 'municipalities']);
const MUNICIPALITY_KEYS = new Set(['id', 'name', 'state', 'county', 'sources']);
const COMMON_SOURCE_KEYS = new Set(['id', 'type', 'body', 'url', 'enabled']);
const HTML_SOURCE_KEYS = new Set([...COMMON_SOURCE_KEYS, 'documentLinkTerms', 'allowedDocumentHosts', 'includeSourcePage']);
const LEGISTAR_SOURCE_KEYS = new Set([...COMMON_SOURCE_KEYS, 'client', 'lookbackDays', 'eventLimit', 'bodies']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
    const keys = Object.keys(value).filter(key => !allowed.has(key));
    if (keys.length) throw new Error(`${label} contains unsupported field(s): ${keys.join(', ')}`);
}

function requiredString(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
    return value.trim();
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
        throw new Error(`${label} must be an array of non-empty strings`);
    }
    return value.map(item => item.trim());
}

function optionalBoolean(value: unknown, label: string, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
    return value;
}

function boundedInteger(
    value: unknown,
    label: string,
    minimum: number,
    maximum: number,
    fallback?: number,
): number | undefined {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
    }
    return value;
}

function officialUrl(value: unknown, label: string): string {
    const raw = requiredString(value, label);
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(`${label} must be a valid http(s) URL`);
    }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error(`${label} must be an http(s) URL without embedded credentials`);
    }
    return parsed.toString();
}

function validateSource(value: unknown, label: string): MunicipalSourceConfig {
    if (!isRecord(value)) throw new Error(`${label} must be an object`);
    const type = requiredString(value.type, `${label}.type`);
    if (type !== 'html' && type !== 'legistar') throw new Error(`${label}.type must be "html" or "legistar"`);
    rejectUnknownKeys(value, type === 'html' ? HTML_SOURCE_KEYS : LEGISTAR_SOURCE_KEYS, label);

    const base = {
        id: requiredString(value.id, `${label}.id`),
        body: requiredString(value.body, `${label}.body`),
        url: officialUrl(value.url, `${label}.url`),
        enabled: optionalBoolean(value.enabled, `${label}.enabled`, true),
    };
    if (!/^[a-z0-9][a-z0-9-]*$/.test(base.id)) throw new Error(`${label}.id must be lowercase kebab-case`);

    if (type === 'html') {
        const allowedDocumentHosts = optionalStringArray(value.allowedDocumentHosts, `${label}.allowedDocumentHosts`);
        allowedDocumentHosts?.forEach(host => {
            if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error(`${label}.allowedDocumentHosts contains an invalid host`);
        });
        return {
            ...base,
            type,
            documentLinkTerms: optionalStringArray(value.documentLinkTerms, `${label}.documentLinkTerms`),
            allowedDocumentHosts,
            includeSourcePage: optionalBoolean(value.includeSourcePage, `${label}.includeSourcePage`, false),
        };
    }

    const lookbackDays = boundedInteger(value.lookbackDays, `${label}.lookbackDays`, 1, 365, 45);
    const eventLimit = boundedInteger(value.eventLimit, `${label}.eventLimit`, 1, 1000, 100);
    return {
        ...base,
        type,
        client: value.client === undefined ? undefined : requiredString(value.client, `${label}.client`),
        lookbackDays,
        eventLimit,
        bodies: optionalStringArray(value.bodies, `${label}.bodies`),
    };
}

export function validateMunicipalConfig(value: unknown): MunicipalMonitorConfig {
    if (!isRecord(value)) throw new Error('Municipal config must be a JSON object');
    rejectUnknownKeys(value, TOP_LEVEL_KEYS, 'Municipal config');
    if (value.schemaVersion !== MUNICIPAL_SCHEMA_VERSION) {
        throw new Error(`Municipal config schemaVersion must be ${MUNICIPAL_SCHEMA_VERSION}`);
    }
    if (!Array.isArray(value.municipalities) || value.municipalities.length === 0) {
        throw new Error('Municipal config must include at least one municipality');
    }

    const municipalityIds = new Set<string>();
    const municipalities = value.municipalities.map((raw, index) => {
        const label = `municipalities[${index}]`;
        if (!isRecord(raw)) throw new Error(`${label} must be an object`);
        rejectUnknownKeys(raw, MUNICIPALITY_KEYS, label);
        const id = requiredString(raw.id, `${label}.id`);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`${label}.id must be lowercase kebab-case`);
        if (municipalityIds.has(id)) throw new Error(`Duplicate municipality id: ${id}`);
        municipalityIds.add(id);
        const state = requiredString(raw.state, `${label}.state`).toUpperCase();
        if (!/^[A-Z]{2}$/.test(state)) throw new Error(`${label}.state must be a two-letter abbreviation`);
        if (!Array.isArray(raw.sources) || raw.sources.length === 0) throw new Error(`${label}.sources must not be empty`);
        const sourceIds = new Set<string>();
        const sources = raw.sources.map((source, sourceIndex) => {
            const parsed = validateSource(source, `${label}.sources[${sourceIndex}]`);
            if (sourceIds.has(parsed.id)) throw new Error(`Duplicate source id in ${id}: ${parsed.id}`);
            sourceIds.add(parsed.id);
            return parsed;
        });
        return {
            id,
            name: requiredString(raw.name, `${label}.name`),
            state,
            county: raw.county === undefined ? undefined : requiredString(raw.county, `${label}.county`),
            sources,
        };
    });

    if (value.request !== undefined && !isRecord(value.request)) throw new Error('request must be an object');
    if (value.keywords !== undefined && !isRecord(value.keywords)) throw new Error('keywords must be an object');
    const request = isRecord(value.request) ? value.request : {};
    const keywords = isRecord(value.keywords) ? value.keywords : {};
    rejectUnknownKeys(request, new Set(['timeoutMs', 'maxBytes', 'userAgent']), 'request');
    rejectUnknownKeys(keywords, new Set(['uses', 'landUse', 'governmentAction']), 'keywords');
    const timeoutMs = boundedInteger(request.timeoutMs, 'request.timeoutMs', 1000, 120_000);
    const maxBytes = boundedInteger(request.maxBytes, 'request.maxBytes', 1024, 50 * 1024 * 1024);

    return {
        schemaVersion: MUNICIPAL_SCHEMA_VERSION,
        request: {
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(maxBytes === undefined ? {} : { maxBytes }),
            ...(request.userAgent === undefined ? {} : { userAgent: requiredString(request.userAgent, 'request.userAgent') }),
        },
        keywords: {
            ...(keywords.uses === undefined ? {} : { uses: optionalStringArray(keywords.uses, 'keywords.uses') }),
            ...(keywords.landUse === undefined ? {} : { landUse: optionalStringArray(keywords.landUse, 'keywords.landUse') }),
            ...(keywords.governmentAction === undefined ? {} : {
                governmentAction: optionalStringArray(keywords.governmentAction, 'keywords.governmentAction'),
            }),
        },
        municipalities,
    };
}

export function loadMunicipalConfig(configPath: string): MunicipalMonitorConfig {
    const absolute = path.resolve(configPath);
    if (!fs.existsSync(absolute)) throw new Error(`Municipal config not found: ${absolute}`);
    try {
        return validateMunicipalConfig(JSON.parse(fs.readFileSync(absolute, 'utf8')));
    } catch (error) {
        if ((error as Error).message.startsWith('Municipal config')) throw error;
        throw new Error(`Municipal config is invalid: ${(error as Error).message}`);
    }
}

export function resolvedMunicipalRequest(config: MunicipalMonitorConfig): MunicipalRequestConfig {
    return { ...DEFAULT_MUNICIPAL_REQUEST, ...(config.request || {}) };
}
