/** Compare source and summary quantities by value AND unit, never digit substrings. */
export type SummaryQuantity = { unit: 'usd' | 'sf' | 'percent'; value: number };

const NUMBER = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const SCALE = '(thousand|million|billion|k|m|b)';
const multiplier = (scale = '') => ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6,
    b: 1e9, billion: 1e9 }[scale.toLowerCase()] || 1);

export function summaryQuantities(text: string): SummaryQuantity[] {
    const out: SummaryQuantity[] = [];
    const add = (unit: SummaryQuantity['unit'], raw: string, scale?: string) => {
        const value = Number((Number(raw.replace(/,/g, '')) * multiplier(scale)).toPrecision(15));
        if (Number.isFinite(value)) out.push({ unit, value });
    };
    const dollars = new RegExp('(?:US\\s*)?\\$\\s*(' + NUMBER + ')\\s*' + SCALE + '?\\b', 'gi');
    const sf = new RegExp('(?<![\\w.])(' + NUMBER + ')[\\s-]*' + SCALE
        + '?[\\s-]*(?:sf|sq\\.?\\s*ft\\.?|square[\\s-]*(?:feet|foot))\\b', 'gi');
    const percent = new RegExp('(?<![\\w.])(' + NUMBER + ')\\s*(?:%|percent\\b)', 'gi');
    for (const match of text.matchAll(dollars)) add('usd', match[1], match[2]);
    for (const match of text.matchAll(sf)) add('sf', match[1], match[2]);
    for (const match of text.matchAll(percent)) add('percent', match[1]);
    return out;
}

export function hasUnsupportedSummaryQuantity(summary: string, source: string): boolean {
    const available = summaryQuantities(source);
    return summaryQuantities(summary).some(quantity =>
        !available.some(fact => fact.unit === quantity.unit && fact.value === quantity.value));
}
