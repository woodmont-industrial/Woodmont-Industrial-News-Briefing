/** Narrow deterministic coverage for opposition-led headlines with no stored AI verdict. */
export function isOppositionLedDataCenterHeadline(title: string): boolean {
    if (!/\bdata[\s-]*cent(?:er|re)s?\b/i.test(title)) return false;
    if (/\b(?:ban|moratorium|opposition)\b.{0,30}\b(?:overturned|lifted|defeated|withdrawn|resolved)\b/i.test(title)) return false;
    const opposition = /\b(?:opposition|opposed|moratorium|backlash|protests?|protesters?|brib(?:e|es|ery)|ban(?:s|ned|ning)?|residents?\s+(?:oppose|spurn|fight|reject|win\s+(?:a\s+|the\s+)?fight)|neighbors?\s+(?:sue|oppose|fight))\b/i.exec(title);
    if (!opposition) return false;
    const development = /\b(?:invest(?:ment|ments|s)?|fund(?:ing|s)?|financ(?:e|es|ing)|raises?|opens?|supports?|breaks?\s+ground|completes?|ribbon[- ]cutting)\b/i.exec(title);
    return !development || opposition.index < development.index;
}

/** Catalog landing pages have no individual property or editorial story. */
export function isPropertyCatalogHeadline(title: string): boolean {
    const core = title.replace(/\s+[-–—]\s+(?:LoopNet|Crexi|PropertyShark|CommercialSearch)\s*$/i, '');
    const catalog = /\b(?:industrial\s+(?:real estate|properties|spaces?)|commercial\s+(?:real estate|listings)|warehouses?\s+for\s+(?:lease|sale))\b/i.test(core);
    if (!catalog) return false;
    if (/\b(?:report|outlook|analysis|demand|absorption|market trends|boomtowns)\b/i.test(core)) return false;
    const figure = /\b\d[\d,.]*\s*(?:[km]\s*)?(?:sf|sq\.?\s*ft\.?|square[ -](?:feet|foot)|acres?)\b|\$\s*\d/i.test(core);
    const address = /\b\d{1,6}\s+(?:[\w.'-]+\s+){1,6}(?:st(?:reet)?|ave(?:nue)?|rd|road|dr(?:ive)?|way|ct|court|blvd|boulevard|pkwy|parkway|ln|lane|pl(?:ace)?|hwy|highway)\b/i.test(core);
    const catalogSource = /\s+[-–—]\s+(?:LoopNet|Crexi|PropertyShark|CommercialSearch)\s*$/i.test(title);
    const directory = /\b(?:listings?|brokers?|for lease and sale|for sale and lease)\b/i.test(core);
    return !figure && !address && (catalogSource || directory);
}

/** A stock-price headline needs a real property event in that headline to qualify. */
export function isNonPropertyStockHeadline(title: string): boolean {
    if (!/(?:\bstock\s*:|\b(?:stock price|share price|shares?\s+(?:rise|fall|surge|slump|jump|drop|gain|slide))\b)/i.test(title)) return false;
    const property = /\b(?:warehouses?|industrial (?:facility|property|portfolio|building)|distribution (?:center|centre|hub)|logistics (?:facility|park)|cold[ -]storage)\b/i.test(title);
    const event = /\b(?:acquir(?:es?|ed)|buys?|bought|sells?|sold|leases?|leased|groundbreaking|breaks? ground|opens?|completes?|refinanc(?:es?|ing))\b/i.test(title);
    return !(property && event);
}

/** A trade-policy story about a shipper or retailer, with no property, size or lease in the headline */
export function isTradePolicyOperationsHeadline(title: string): boolean {
    if (!/\b(?:de minimis|tariffs?|customs|import duties|duty[- ]free)\b/i.test(title)) return false;
    return !/\b(?:warehouses?|industrial|distribution (?:center|centre|hub)|logistics (?:facility|park|center|centre|hub)|fulfillment (?:center|centre)|facility|buildings?|leases?|leased|square[ -](?:feet|foot)|sq\.?\s*ft|\d[\d,.]*\s*(?:k\s*)?sf|acres?|vacancy|rents?|absorption)\b/i.test(title);
}

/** Technology commentary about CRE in general ("The Importance of a Unified Language for AI Development in CRE") */
export function isTechnologyCommentaryHeadline(title: string): boolean {
    if (!/\b(?:AI|artificial intelligence|proptech|technology|software|digital transformation)\b/i.test(title)) return false;
    // AI data centers have their own policy; a property, deal, project or market figure makes it property news
    return !/\b(?:data[\s-]*cent(?:er|re)s?|warehouses?|industrial (?:facility|property|portfolio|building|park|space)|distribution (?:center|centre|hub)|logistics (?:facility|park|center|centre|hub|campus)|fulfillment (?:center|centre)|manufacturing (?:facility|plant|operations)|leases?|leased|acquir(?:es?|ed)|buys?|sells?|sold|square[ -](?:feet|foot)|sq\.?\s*ft|\d[\d,.]*\s*(?:k\s*)?sf|acres?|vacancy|rents?|absorption|demand|breaks? ground|groundbreaking|construction|builds?|(?:technology|tech|research|innovation) (?:park|campus|center|centre))\b/i.test(title);
}

/** A company award or ranking is not a hire, promotion or appointment */
export function isCompanyRecognitionHeadline(title: string): boolean {
    if (!/\b(?:named (?:to|among|on|one of)|best (?:places|workplaces|companies|employers)|top workplaces?|awards?|awarded|honou?r(?:ed|ee|s)|recogni[sz](?:ed|es|ition)|ranks?|ranked|rankings?)\b/i.test(title)) return false;
    const role = '(?:CEO|president|chief|chair(?:man|woman)?|(?:executive |senior )?vice president|VP|director|managing|partner|principal|head)';
    return !new RegExp(`\\b(?:hires?|hired|joins?|appoint(?:s|ed)?|promot(?:es?|ed)|elevat(?:es?|ed)|taps?|tapped|names?\\s+(?:\\w+\\s+){0,3}(?:as\\s+)?${role}|named\\s+(?:as\\s+)?(?:the\\s+)?(?:new\\s+)?${role}|board)\\b`, 'i').test(title);
}

export function isNonStoryArtifact(title: string): boolean {
    return isPropertyCatalogHeadline(title) || isNonPropertyStockHeadline(title) || isTradePolicyOperationsHeadline(title)
        || isTechnologyCommentaryHeadline(title);
}

/** Buying an equipment/service business does not describe buying its buildings. */
export function isServiceCompanyAcquisition(article:{title?:string;description?:string}):boolean {
    const title=article.title||'',text=title+' '+(article.description||'');
    if(!/\bdata[ -]?cent(?:er|re)s?\b/i.test(title))return false;
    if(!/\b(?:acquir(?:es?|ed)|acquisition|buys?|bought)\b/i.test(title))return false;
    if(/\b(?:warehouse|industrial (?:building|property|portfolio)|logistics (?:facility|portfolio))\b/i.test(title))return false;
    return /\b(?:equipment (?:provider|supplier)|(?:firm|company) that (?:installs|services)|software (?:company|business)|IT services (?:company|business))\b/i.test(text);
}
