/** Narrow deterministic coverage for opposition-led headlines with no stored AI verdict. */
export function isOppositionLedDataCenterHeadline(title: string): boolean {
    if (!/\bdata[\s-]*cent(?:er|re)s?\b/i.test(title)) return false;
    if (/\b(?:ban|moratorium|opposition)\b.{0,30}\b(?:overturned|lifted|defeated|withdrawn|resolved)\b/i.test(title)) return false;
    const opposition = /\b(?:opposition|moratorium|backlash|protests?|protesters?|brib(?:e|es|ery)|ban(?:s|ned|ning)?|residents?\s+(?:oppose|spurn|fight|reject|win\s+(?:a\s+|the\s+)?fight)|neighbors?\s+(?:sue|oppose|fight))\b/i.exec(title);
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

export function isNonStoryArtifact(title: string): boolean {
    return isPropertyCatalogHeadline(title) || isNonPropertyStockHeadline(title);
}

/** Buying an equipment/service business does not describe buying its buildings. */
export function isServiceCompanyAcquisition(article:{title?:string;description?:string}):boolean {
    const title=article.title||'',text=title+' '+(article.description||'');
    if(!/\bdata[ -]?cent(?:er|re)s?\b/i.test(title))return false;
    if(!/\b(?:acquir(?:es?|ed)|acquisition|buys?|bought)\b/i.test(title))return false;
    if(/\b(?:warehouse|industrial (?:building|property|portfolio)|logistics (?:facility|portfolio))\b/i.test(title))return false;
    return /\b(?:equipment (?:provider|supplier)|(?:firm|company) that (?:installs|services)|software (?:company|business)|IT services (?:company|business))\b/i.test(text);
}
