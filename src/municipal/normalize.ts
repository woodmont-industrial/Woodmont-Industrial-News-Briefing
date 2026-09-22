import { createHash } from 'node:crypto';
import { MunicipalDocumentType } from './types.js';

export function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

export function stableMunicipalId(prefix: string, ...parts: Array<string | null | undefined>): string {
    return `${prefix}_${sha256(parts.map(part => part || '').join('\u001f')).slice(0, 24)}`;
}

export function normalizeWhitespace(value: string): string {
    return value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

export function decodeHtmlEntities(value: string): string {
    const named: Record<string, string> = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
    };
    return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
        const lower = entity.toLowerCase();
        if (named[lower] !== undefined) return named[lower];
        const numeric = lower.startsWith('#x')
            ? parseInt(lower.slice(2), 16)
            : lower.startsWith('#') ? parseInt(lower.slice(1), 10) : NaN;
        if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff) return String.fromCodePoint(numeric);
        return match;
    });
}

export function htmlToText(html: string): string {
    return normalizeWhitespace(decodeHtmlEntities(
        html
            .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
            .replace(/<[^>]+>/g, ' '),
    ));
}

export function normalizeIdentityText(value: string | null | undefined): string {
    return (value || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(the|llc|inc|corp|corporation|company|co)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function canonicalizeMunicipalUrl(value: string): string {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
}

export function inferDocumentType(value: string): MunicipalDocumentType {
    const text = value.toLowerCase();
    if (/\bminutes?\b/.test(text)) return 'minutes';
    if (/\bpacket\b/.test(text)) return 'packet';
    if (/\bagenda\b/.test(text)) return 'agenda';
    if (/\bordinance\b/.test(text)) return 'ordinance';
    if (/\bapplications?\b/.test(text)) return 'application';
    if (/\bresolutions?\b/.test(text)) return 'resolution';
    if (/\bnotice|public hearing\b/.test(text)) return 'notice';
    if (/\bmeeting\b/.test(text)) return 'meeting-page';
    return 'other';
}

function validIsoDate(year: number, month: number, day: number): string | null {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.toISOString().slice(0, 10);
}

export function extractDate(value: string): string | null {
    let match = value.match(/\b(20\d{2})[-_/](0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])\b/);
    if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = value.match(/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](20\d{2})\b/);
    if (match) return validIsoDate(Number(match[3]), Number(match[1]), Number(match[2]));
    const monthNames: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
    if (match) return validIsoDate(Number(match[3]), monthNames[match[1].toLowerCase()], Number(match[2]));
    return null;
}

export function parsePlatformDate(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const legistar = value.match(/^\/Date\((\d+)/);
    if (legistar) return new Date(Number(legistar[1])).toISOString().slice(0, 10);
    const explicit = extractDate(value);
    if (explicit) return explicit;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}
