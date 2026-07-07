/**
 * Deal threshold utilities — shared across newsletter filters and static build.
 * Thresholds: >=50,000 SF or >=$10M
 */

import { NormalizedItem } from '../types/index.js';

export interface DealThreshold {
    meetsSF: boolean;
    meetsDollar: boolean;
    sizeSF: number | null;
    priceMillion: number | null;
}

export function meetsDealThreshold(text: string): DealThreshold {
    const upperText = text.toUpperCase();

    // Extract SF values. Supports:
    //   208,000 SF / 208000 SF       (plain digits)
    //   208K SF / 208K-SF            (K shorthand, optional hyphen)
    //   1.5M SF / 1.5M-SF / 2M SF    (M shorthand for million SF)
    // 2026-06-09: K/M shorthand added — Connect CRE "208K-SF Ft. Myers" was
    // dropping at the threshold filter because old regex only matched comma-
    // separated digits, so 208K-SF parsed as 208 SF and failed the 50K floor.
    const sfMatch = upperText.match(/(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?)\s*(K|M)?[\s-]*(?:SF|SQ\.?\s*FT|SQUARE[\s-]*(?:FEET|FOOT))/i);
    let sizeSF: number | null = null;
    if (sfMatch) {
        const num = parseFloat(sfMatch[1].replace(/,/g, ''));
        const unit = (sfMatch[2] || '').toUpperCase();
        sizeSF = unit === 'M' ? Math.round(num * 1000000)
            : unit === 'K' ? Math.round(num * 1000)
            : Math.round(num);
    }

    // Extract dollar values (millions)
    const dollarMatch = upperText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b)/i);
    let priceMillion: number | null = null;
    if (dollarMatch) priceMillion = parseFloat(dollarMatch[1].replace(/,/g, ''));

    // Also check for plain dollar amounts (e.g., $25,000,000)
    const bigDollarMatch = upperText.match(/\$(\d{2,3}(?:,\d{3}){2,})/);
    if (!priceMillion && bigDollarMatch) {
        const rawAmount = parseInt(bigDollarMatch[1].replace(/,/g, ''));
        if (rawAmount >= 10000000) priceMillion = rawAmount / 1000000;
    }

    return {
        meetsSF: sizeSF !== null && sizeSF >= 50000,
        meetsDollar: priceMillion !== null && priceMillion >= 10,
        sizeSF,
        priceMillion
    };
}

export function getDealScore(article: NormalizedItem): number {
    const text = `${article.title || ''} ${article.description || ''}`.toUpperCase();
    let score = 0;

    // Check SF — mirrors meetsDealThreshold above; K/M shorthand supported.
    const sfMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?)\s*(K|M)?[\s-]*(?:SF|SQ\.?\s*FT|SQUARE[\s-]*(?:FEET|FOOT))/i);
    if (sfMatch) {
        const num = parseFloat(sfMatch[1].replace(/,/g, ''));
        const unit = (sfMatch[2] || '').toUpperCase();
        const sf = unit === 'M' ? num * 1000000 : unit === 'K' ? num * 1000 : num;
        if (sf >= 100000) score += 3;
        else if (sf >= 50000) score += 2;
        else if (sf >= 25000) score += 1;
    }

    // Check dollar amount
    const dollarMatch = text.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b|BILLION|B\b)/i);
    if (dollarMatch) {
        const amount = parseFloat(dollarMatch[1].replace(/,/g, ''));
        if (text.includes('BILLION') || text.includes('B ')) {
            score += 3;
        } else if (amount >= 25) {
            score += 2;
        } else if (amount >= 10) {
            score += 1;
        }
    }

    return score;
}
