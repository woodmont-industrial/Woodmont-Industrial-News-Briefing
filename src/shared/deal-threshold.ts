/**
 * Deal threshold utilities — shared across newsletter filters and static build.
 * Boss rules: >=100,000 SF or >=$25M
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

    // Extract SF values
    const sfMatch = upperText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:SF|SQ\.?\s*FT|SQUARE\s*FEET)/i);
    let sizeSF: number | null = null;
    if (sfMatch) sizeSF = parseInt(sfMatch[1].replace(/,/g, ''));

    // Extract dollar values (millions)
    const dollarMatch = upperText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b)/i);
    let priceMillion: number | null = null;
    if (dollarMatch) priceMillion = parseFloat(dollarMatch[1].replace(/,/g, ''));

    // Also check for plain dollar amounts (e.g., $25,000,000)
    const bigDollarMatch = upperText.match(/\$(\d{2,3}(?:,\d{3}){2,})/);
    if (!priceMillion && bigDollarMatch) {
        const rawAmount = parseInt(bigDollarMatch[1].replace(/,/g, ''));
        if (rawAmount >= 25000000) priceMillion = rawAmount / 1000000;
    }

    return {
        meetsSF: sizeSF !== null && sizeSF >= 100000,
        meetsDollar: priceMillion !== null && priceMillion >= 25,
        sizeSF,
        priceMillion
    };
}

export function getDealScore(article: NormalizedItem): number {
    const text = `${article.title || ''} ${article.description || ''}`.toUpperCase();
    let score = 0;

    // Check SF
    const sfMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:SF|SQ\.?\s*FT|SQUARE\s*FEET)/i);
    if (sfMatch) {
        const sf = parseInt(sfMatch[1].replace(/,/g, ''));
        if (sf >= 100000) score += 2;
        else if (sf >= 50000) score += 1;
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
