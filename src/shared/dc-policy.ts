// READ-ONLY DC-policy classifier (analysis only — NOT wired into production).
// Concepts: isSpecificDataCenterProject, hasTargetRegionEvidence,
//           isNationalScaleDataCenterProject, isDataCenterMacroAnalysis.
// Policy: specific DC project -> allow if target-region evidence; else allow only if
// national-scale (>=$5B OR >=500MW); else reject out-of-region. Non-project DC macro allowed.

import { MAJOR_EXCLUDE_REGIONS, INTERNATIONAL_EXCLUDE } from './region-data.js';

export const DC_RE = /\bdata\s?cent(?:er|re)s?\b/i;

// Target-region (NJ/PA/FL) evidence — DC-classifier-LOCAL token set (does NOT touch the general
// region gazetteers). States/abbrevs + NJ/PA/FL counties + specific towns that appear without a
// state token in feeds (Bonita Springs, Zephyrhills, Winter Park …).
const TARGET_RX = /\b(new jersey|n\.?j\.?|pennsylvania|\bpa\b|florida|\bfl\b|fla\.?|garden state|keystone state|sunshine state|newark|jersey city|edison|piscataway|elizabeth|trenton|camden|woodbridge|carteret|linden|secaucus|kearny|bayonne|paterson|clifton|meadowlands|warren township|bordentown|philadelphia|philly|allentown|bethlehem|lehigh|pittsburgh|harrisburg|lancaster|scranton|king of prussia|miami|doral|hialeah|medley|fort lauderdale|pompano|broward|west palm|palm beach|miami-dade|orlando|tampa|jacksonville|ocala|winter park|bonita springs|zephyrhills|santa rosa county|clay county|citrus county|(?:bergen|hudson|essex|union|morris|passaic|middlesex|mercer|somerset|monmouth|ocean|burlington|camden|gloucester|atlantic|cumberland|salem|sussex|warren|hunterdon|bucks|montgomery|chester|delaware|lehigh|northampton|lancaster|york|dauphin|berks|hillsborough|duval|polk|orange|lee|collier|osceola|brevard|volusia|pasco|pinellas|alachua)\s+county)\b/i;
export function hasTargetRegionEvidence(text: string): boolean { return TARGET_RX.test(text); }

// Positive NON-target evidence — a recognized non-target US state/city (reusing the maintained
// MAJOR_EXCLUDE_REGIONS, read-only) or an international/country signal (INTERNATIONAL_EXCLUDE).
// Drives step 3: only reject a sub-scale project when there is POSITIVE out-of-region evidence.
// DC-classifier-local country regex (supplements INTERNATIONAL_EXCLUDE, which misses e.g.
// Finland). Word-bounded to avoid substrings like "india" in "indiana".
const COUNTRY_RX = /\b(finland|sweden|norway|denmark|iceland|ireland|united kingdom|britain|england|scotland|wales|germany|france|spain|italy|portugal|netherlands|belgium|switzerland|austria|poland|greece|russia|ukraine|turkey|israel|saudi|\buae\b|qatar|egypt|nigeria|kenya|morocco|south africa|australia|new zealand|china|japan|korea|\bindia\b|pakistan|bangladesh|vietnam|thailand|malaysia|singapore|indonesia|philippines|mexico|brazil|argentina|chile|colombia|canada|abroad|overseas)\b/i;
export function hasNonTargetEvidence(text: string): boolean {
    const up = ` ${text.toUpperCase()} `;
    if (MAJOR_EXCLUDE_REGIONS.some(r => up.includes(r))) return true;
    if (INTERNATIONAL_EXCLUDE.some(r => r.trim().length >= 3 && up.includes(r))) return true;
    if (COUNTRY_RX.test(text)) return true;
    return false;
}
// The specific non-target tokens matched (for diagnostics logging of unresolved/foreign location).
export function nonTargetTokens(text: string): string[] {
    const up = ` ${text.toUpperCase()} `;
    const hits = [
        ...MAJOR_EXCLUDE_REGIONS.filter(r => up.includes(r)),
        ...INTERNATIONAL_EXCLUDE.filter(r => r.trim().length >= 3 && up.includes(r)),
    ].map(s => s.trim()).filter(Boolean);
    return [...new Set(hits)];
}

// Project signal: a specific facility/site being built/planned/developed.
const DC_PROJECT_RE = /\b(build|builds|building|to build|construct(?:s|ing|ion)?|develop(?:s|ing|ed|ment)?|break(?:s|ing)?\s+ground|groundbreak\w*|plan(?:s|ned|ning)?|propos(?:e|es|ed|al|ing)|campus|facility|complex|\bproject\b|slated|underway|targets?|opening|opens?|delivers?|\bsite\b|acres?\b)\b/i;
// Macro/analysis signal: sector/market/finance/policy/power — not one local project.
const DC_MACRO_RE = /\b(market|boom|demand|vacancy|absorption|outlook|trend|forecast|sector|financ\w*|\bfund\b|venture|\breit\b|\bspac\b|\bipo\b|go(?:es|ing)?\s+public|valuation|\bmerger\b|courting buyers|policy|regulat\w*|ordinance|zoning|moratori\w*|\bpaus\w*|\bban\b|legislat\w*|lawmaker|\bbill\b|tax credit|\bgrid\b|power\s+(?:cost|price|market|demand|use)|electric|utilit\w*|interconnect\w*|analysis|analyst|\bstudy\b|survey|emerging|to watch|\bskips?\b|hysteria|debate)\b/i;

// Explicit scale extraction (no operator-name shortcuts).
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;                 // comma-tolerant ($20,000 million)
const toNum = (s: string) => parseFloat(s.replace(/,/g, ''));
export function dcDollarsB(text: string): number | null {
    const t = text.toLowerCase();
    let best: number | null = null;
    for (const m of t.matchAll(new RegExp(String.raw`\$\s*${NUM}\s*(b|bn|billion)\b`, 'g'))) best = Math.max(best ?? 0, toNum(m[1]));
    for (const m of t.matchAll(new RegExp(String.raw`\$\s*${NUM}\s*(m|mm|million)\b`, 'g'))) best = Math.max(best ?? 0, toNum(m[1]) / 1000);
    return best;
}
export function dcMW(text: string): number | null {
    const t = text.toLowerCase();
    let best: number | null = null;
    for (const m of t.matchAll(new RegExp(String.raw`${NUM}\s*-?\s*(gw|gigawatts?)\b`, 'g'))) best = Math.max(best ?? 0, toNum(m[1]) * 1000);
    for (const m of t.matchAll(new RegExp(String.raw`${NUM}\s*-?\s*(mw|megawatts?)\b`, 'g'))) best = Math.max(best ?? 0, toNum(m[1]));
    return best;
}
export function isNationalScaleDataCenterProject(text: string): boolean {
    const d = dcDollarsB(text), mw = dcMW(text);
    return (d !== null && d >= 5) || (mw !== null && mw >= 500);
}

// Policy / legislative / financing / legal frames — the article is ABOUT data-center
// development as a topic, not a single facility being built. These are macro, never "project".
const DC_POLICY_FINANCE_RE = /\b(ban(?:s|ned|ning)?|moratori\w*|\bpaus\w*|zoning|ordinance|tax\s+credit|incentive|legislat\w*|lawmaker|\bbill\b|\bact\b|assembly|house of representatives|\bsenate\b|city council|committee|commission|board\b|denies|denied|rejects?|rejected|\bvotes?\b|approv\w*|repeal|regulat\w*|restrict\w*|opposition|protest|rally|lawsuit|sues?|sued|\bjudge\b|\bcourt\b|confidentiality|transparency|secures?\s+\$|financ\w*|\bfund\b|loan\w*|\bstock\b|\bshares\b|\bipo\b|\bspac\b|valuation|\bmerger\b|acquir\w*|lease\s+deal|closes?\s+\$|series\s+[a-d]\b|brokers?\s+sale|sale\s+of|surges?|jumps?|grapple|limits?\b|nix\w*|end(?:s|ing)?\s+.*tax|\bbanks?\b|\blenders?\b|wall street|nonperforming|debt maturit|loss reserves|earnings)\b/i;

export function isSpecificDataCenterProject(text: string): boolean {
    if (!DC_RE.test(text)) return false;
    if (DC_POLICY_FINANCE_RE.test(text)) return false;   // policy/finance/legal frame → macro, not a project
    const project = DC_PROJECT_RE.test(text);
    const macro = DC_MACRO_RE.test(text);
    const scale = dcDollarsB(text) !== null || dcMW(text) !== null;
    if (!project) return false;
    if (macro && !scale) return false;      // market/trend piece without a concrete project
    return true;
}
export function isDataCenterMacroAnalysis(text: string): boolean {
    return DC_RE.test(text) && !isSpecificDataCenterProject(text);
}

// Policy verdict — decision ORDER (option c, conservative rejection):
//   0. not a DC article                                        -> 'not-dc'
//   0. DC but not a specific project (trend/policy/financing)  -> 'allow-macro'
//   1. confirmed NJ/PA/FL evidence                             -> 'allow-regional'
//   2. national scale (>=$5B or >=500MW)                       -> 'allow-national-scale'
//   3. POSITIVE non-target evidence (non-target state/city/country/international) -> 'reject-oor'
//   4. no resolvable location (unknown)                        -> 'allow-unknown-location'
export function dcPolicyVerdict(text: string): string {
    if (!DC_RE.test(text)) return 'not-dc';
    if (!isSpecificDataCenterProject(text)) return 'allow-macro';
    if (hasTargetRegionEvidence(text)) return 'allow-regional';
    if (isNationalScaleDataCenterProject(text)) return 'allow-national-scale';
    if (hasNonTargetEvidence(text)) return 'reject-oor';
    return 'allow-unknown-location';
}
