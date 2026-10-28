/** Narrow deterministic coverage for opposition-led headlines with no stored AI verdict. */
export function isOppositionLedDataCenterHeadline(title: string): boolean {
    if (!/\bdata[\s-]*cent(?:er|re)s?\b/i.test(title)) return false;
    if (/\b(?:ban|moratorium|opposition)\b.{0,30}\b(?:overturned|lifted|defeated|withdrawn|resolved)\b/i.test(title)) return false;
    const opposition = /\b(?:opposition|moratorium|backlash|protests?|protesters?|brib(?:e|es|ery)|ban(?:s|ned|ning)?|residents?\s+(?:oppose|spurn|fight|reject)|neighbors?\s+(?:sue|oppose|fight))\b/i.exec(title);
    if (!opposition) return false;
    const development = /\b(?:invest(?:ment|ments|s)?|fund(?:ing|s)?|financ(?:e|es|ing)|raises?|opens?|supports?|breaks?\s+ground|completes?|ribbon[- ]cutting)\b/i.exec(title);
    return !development || opposition.index < development.index;
}

/** Buying an equipment/service business does not describe buying its buildings. */
export function isServiceCompanyAcquisition(article:{title?:string;description?:string}):boolean {
    const title=article.title||'',text=title+' '+(article.description||'');
    if(!/\bdata[ -]?cent(?:er|re)s?\b/i.test(title))return false;
    if(!/\b(?:acquir(?:es?|ed)|acquisition|buys?|bought)\b/i.test(title))return false;
    if(/\b(?:warehouse|industrial (?:building|property|portfolio)|logistics (?:facility|portfolio))\b/i.test(title))return false;
    return /\b(?:equipment (?:provider|supplier)|(?:firm|company) that (?:installs|services)|software (?:company|business)|IT services (?:company|business))\b/i.test(text);
}
