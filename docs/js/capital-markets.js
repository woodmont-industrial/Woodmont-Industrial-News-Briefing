/**
 * Capital Markets newsletter - classification, geography and competitor logic.
 *
 * Extracted from docs/index.html so it can be unit tested directly instead of
 * string-slicing a 5,000-line inline script. The factory takes its shared
 * dependencies explicitly, which keeps the module free of DOM and React and
 * lets tests supply stubs.
 *
 * Preview rendering is the default. A caller may explicitly request the clean
 * delivery renderer, but this module never sends email, chooses recipients or
 * mutates sent-state. The competitor watchlist is caller-supplied at runtime
 * and never persisted.
 */
(function (global) {
  'use strict';

  function createCapitalMarkets(deps) {
    const {
      escapeHtml, safeUrl, firstSentences, getPublisherName,
      US_STATE_NAMES, REGION_TARGETS, REGION_CITIES, REGION_AREAS,
      REGION_NON_TARGET_CITIES, REGION_AMBIGUOUS_CITIES,
      regionPad, regionHas, regionScan, regionMaskOrigins,
    } = deps;
    // ---- PUBLIC geography reference data (same-origin, lazily loaded) -----
    // capital-markets-geography.json and capital-markets-places.json are PUBLIC
    // reference data published alongside this page: stakeholder county tiers
    // plus a Census-derived municipality -> county lookup. Reading them is a
    // same-origin fetch of our own GitHub Pages assets. It is NOT an external
    // news fetch and it transmits nothing: no body, no query string, no
    // credentials. The private competitor watchlist is unrelated to this and
    // still never leaves the browser.
    const CM_GEO_FILES = ['capital-markets-geography.json', 'capital-markets-places.json'];
    const cmGeo = { status: 'idle', geography: null, index: null, error: null };

    // Tokens allowed to appear lowercase inside a multi-word proper name.
    const CM_CONNECTORS = new Set(['of', 'the', 'on', 'upon', 'at', 'by', 'and']);

    /** Build the lookup index once, from the two public files. */
    const cmBuildGeoIndex = (geography, places) => {
      const byName = new Map();          // lowercase place name -> entries
      const countyByState = new Map();   // state -> Map(lowercase county -> canonical)
      let maxWords = 1;
      for (const [st, d] of Object.entries(places.states || {})) {
        const cmap = new Map();
        d.counties.forEach(c => cmap.set(c.toLowerCase(), c));
        countyByState.set(st, cmap);
        for (const r of d.places) {
          const name = r[0], ci = r[1], lat = r[2], lon = r[3], type = r[4];
          const county = d.counties[Array.isArray(ci) ? ci[0] : ci];
          const key = name.toLowerCase();
          maxWords = Math.max(maxWords, key.split(' ').length);
          if (!byName.has(key)) byName.set(key, []);
          byName.get(key).push({ state: st, name, county, lat, lon, type });
        }
      }
      // Derived: a NJ county whose municipalities ALL fall on one side of the
      // Exit 6 line can be resolved from the county alone. Mixed counties
      // cannot, and stay unresolved until a municipality is named. This is
      // derived from the data, not an asserted boundary.
      const njCounty = new Map();
      const njCfg = geography.states.NJ || {};
      const njPlaces = places.states.NJ || { places: [], counties: [] };
      const buckets = new Map();
      for (const r of njPlaces.places) {
        const county = njPlaces.counties[Array.isArray(r[1]) ? r[1][0] : r[1]];
        const lat = r[2];
        const tier = (lat === null || lat === undefined)
          ? (njCfg.fallbackTier || 'BROADER')
          : (lat > njCfg.exit6Latitude ? 'TARGET' : (njCfg.fallbackTier || 'BROADER'));
        if (!buckets.has(county)) buckets.set(county, new Set());
        buckets.get(county).add(tier);
      }
      for (const entry of buckets) {
        if (entry[1].size === 1) njCounty.set(entry[0], [...entry[1]][0]);
      }
      return { byName, countyByState, njCounty, maxWords };
    };

    /** Lazy same-origin load. Safe to call repeatedly; loads at most once. */
    const cmLoadGeography = async () => {
      if (cmGeo.status === 'ready' || cmGeo.status === 'loading') return cmGeo;
      cmGeo.status = 'loading';
      try {
        const parts = await Promise.all(CM_GEO_FILES.map(f =>
          fetch(f, { credentials: 'omit' }).then(r => {
            if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
            return r.json();
          })));
        cmGeo.geography = parts[0];
        cmGeo.index = cmBuildGeoIndex(parts[0], parts[1]);
        cmGeo.status = 'ready';
        cmGeo.error = null;
      } catch (e) {
        // Failure is SAFE: every article then resolves UNMAPPED, so nothing is
        // admitted under a guessed geography.
        cmGeo.status = 'error';
        cmGeo.error = String((e && e.message) || e);
      }
      return cmGeo;
    };

    const CM_GEO = {
      // Explicit non-target US markets / nationwide framing => NATIONAL.
      // TARGET / BROADER are NO LONGER keyword lists: they resolve
      // deterministically from the public county + municipality data above.
      NATIONAL: [
        'nationwide', 'across the u.s.', 'across the us', 'national industrial',
        'u.s. industrial', 'us industrial', 'california', 'texas', 'dallas', 'houston',
        'phoenix', 'atlanta', 'chicago', 'inland empire', 'seattle', 'denver', 'nevada',
        'las vegas', 'ohio', 'indiana', 'georgia', 'arizona', 'tennessee', 'carolina',
      ],
    };

    // Headlines are Title Case, so "capitalised" proves nothing on its own:
    // "Fund Bets Industrial" would match the CDP named Gap. When the text names
    // no state, a municipality must therefore carry extra evidence — either a
    // locational preposition immediately before it or an industrial asset phrase
    // immediately after it. A distinctive multi-word name plus an asset phrase
    // can also corroborate a township; a bare statistical place never qualifies.
    const CM_LOC_CUES = new Set(['in', 'at', 'near', 'outside', 'throughout', 'to']);
    const CM_SOLID_CLASS = new Set(['c', 'b', 'p', 'v']);
    const CM_ASSET_AFTER = /^(?:industrial\s+)?(?:warehouse|distribution\s+cent\w+|logistics\s+(?:campus|cent\w+|facility|park)|industrial\s+(?:site|park|building|facility)|facility|data\s*cent\w+)\b/i;

    // Municipality class ranking. When two municipalities in one state share a
    // name, the more prominent class wins: Reading city (Berks) outranks
    // Reading township (Adams).
    const CM_CLASS_RANK = { c: 6, b: 5, p: 4, v: 3, t: 2, u: 1, d: 0 };

    // US states OUTSIDE our four. Naming one is explicit evidence of a
    // non-target market, and must stop a bare municipality name from resolving
    // (there is a Dallas, PA — an article about Dallas, Texas is not about it).
    const CM_OTHER_STATES = ['alabama','alaska','arizona','arkansas','california','colorado',
      'connecticut','delaware','georgia','hawaii','idaho','illinois','indiana','iowa','kansas',
      'kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota',
      'mississippi','missouri','montana','nebraska','nevada','new hampshire','new mexico',
      'north carolina','north dakota','ohio','oklahoma','oregon','rhode island','south carolina',
      'south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia',
      'wisconsin','wyoming'];

    // State evidence. Full names always count; bare two-letter abbreviations
    // count only in "City, ST" form, since "PA" and "NY" appear in other contexts.
    const CM_STATE_FULL = [['NJ', /\bnew jersey\b/i], ['PA', /\bpennsylvania\b/i],
                           ['FL', /\bflorida\b/i], ['NY', /\bnew york\b/i]];
    // Whole-phrase containment, no regex escaping needed.
    const padHas = (text, phrase) => (' ' + text.toLowerCase().replace(/[^a-z]+/g, ' ') + ' ')
      .includes(' ' + phrase.toLowerCase().replace(/[^a-z]+/g, ' ').trim() + ' ');

    const cmStatesIn = (text) => {
      const out = new Set();
      for (const pair of CM_STATE_FULL) if (pair[1].test(text)) out.add(pair[0]);
      for (const m of text.matchAll(/,\s*(NJ|PA|FL|NY)\b/g)) out.add(m[1]);
      return out;
    };

    /** Tier for one resolved municipality, per the geography file's own rules. */
    const cmTierForPlace = (e) => {
      const cfg = (cmGeo.geography.states || {})[e.state];
      if (!cfg) return { tier: 'UNMAPPED', basis: e.state + ' is not a mapped state' };
      if (String(cfg.method || '').indexOf('latitude') === 0) {
        const ov = (cfg.overrides || {})[e.name + '|' + e.county];
        if (ov) return { tier: ov, basis: 'manual override for ' + e.name + ', ' + e.county + ' County' };
        const fb = cfg.fallbackTier || 'UNMAPPED';
        if (e.lat === null || e.lat === undefined)
          return { tier: fb, basis: e.name + ' has no coordinate; fallback ' + fb };
        const north = e.lat > cfg.exit6Latitude;
        return { tier: north ? 'TARGET' : fb,
                 basis: e.name + ' lat ' + e.lat + (north ? ' > ' : ' <= ') + 'Exit 6 ' + cfg.exit6Latitude };
      }
      if ((cfg.targetCounties || []).includes(e.county))
        return { tier: 'TARGET', basis: e.name + ' is in ' + e.county + ' County (TARGET)' };
      if ((cfg.broaderCounties || []).includes(e.county))
        return { tier: 'BROADER', basis: e.name + ' is in ' + e.county + ' County (BROADER)' };
      return { tier: 'UNMAPPED', basis: e.county + ' County is outside the mapped tiers' };
    };

    /** Tier for an explicitly named county. */
    const cmTierForCounty = (st, county) => {
      const cfg = (cmGeo.geography.states || {})[st];
      if (!cfg) return null;
      if ((cfg.targetCounties || []).includes(county))
        return { tier: 'TARGET', basis: county + ' County, ' + st + ' is TARGET' };
      if ((cfg.broaderCounties || []).includes(county))
        return { tier: 'BROADER', basis: county + ' County, ' + st + ' is BROADER' };
      if (String(cfg.method || '').indexOf('latitude') === 0) {
        // NJ has no county tiers; use one only when every municipality in that
        // county falls on the same side of the line.
        const derived = cmGeo.index.njCounty.get(county);
        if (derived) return { tier: derived, basis: county + ' County, NJ lies entirely '
          + (derived === 'TARGET' ? 'north' : 'south') + ' of Exit 6' };
        return { tier: 'UNMAPPED',
          basis: county + ' County, NJ straddles the Exit 6 line - needs a municipality' };
      }
      return { tier: 'UNMAPPED', basis: county + ' County, ' + st + ' is outside the mapped tiers' };
    };

    /** Scan text for place names, longest match first, proper nouns only. */
    const cmScanPlaces = (text) => {
      const idx = cmGeo.index, out = [];
      const toks = [...text.matchAll(/[A-Za-z][A-Za-z.'’-]*/g)].map(m => ({ w: m[0], i: m.index }));
      for (let i = 0; i < toks.length; i++) {
        for (let n = Math.min(idx.maxWords, toks.length - i); n >= 1; n--) {
          const slice = toks.slice(i, i + n);
          const key = slice.map(t => t.w).join(' ').toLowerCase();
          const hits = idx.byName.get(key);
          if (!hits) continue;
          // Require a proper noun so "sunrise" or "orange" as ordinary words do
          // not resolve to Sunrise FL or Orange NJ.
          if (!slice.every(t => /^[A-Z]/.test(t.w) || CM_CONNECTORS.has(t.w.toLowerCase()))) continue;
          out.push({ key, phrase: slice.map(t => t.w).join(' '), hits, words: n,
                     prev: i > 0 ? toks[i - 1].w.toLowerCase() : '',
                     after: toks.slice(i + n, i + n + 3).map(t => t.w).join(' ') });
          i += n - 1;
          break;
        }
      }
      return out;
    };

    /** Scan text for "<Name> County", plus Miami-Dade written without "County". */
    const cmScanCounties = (text) => {
      const out = [];
      for (const m of text.matchAll(/\b([A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){0,2})\s+Count(?:y|ies)\b/g)) {
        const name = m[1].trim();
        for (const pair of cmGeo.index.countyByState) {
          const canon = pair[1].get(name.toLowerCase());
          if (canon) out.push({ state: pair[0], county: canon, phrase: name + ' County' });
        }
      }
      for (const m of text.matchAll(/\bMiami[- ]Dade\b/gi))
        out.push({ state: 'FL', county: 'Miami-Dade', phrase: m[0] });
      return out;
    };

    /**
     * Deterministic geography resolution.
     *
     * Collects EVERY location the text supports, then chooses one tier:
     *   all TARGET                     -> TARGET
     *   any BROADER (with or without TARGET) -> BROADER   (stricter threshold)
     *   explicit national / out-of-scope state with none of ours -> NATIONAL
     *   TARGET plus unresolved material geography -> BROADER (conservative)
     *   New Jersey named but nothing resolvable   -> BROADER (conservative)
     *   otherwise                      -> UNMAPPED
     *
     * The conservative choices never LOWER a threshold: BROADER demands more
     * than TARGET, so a portfolio can never sneak in under the easier bar.
     * Returns provenance so the UI can separate exact from conservative calls.
     */
    const cmResolveGeography = (text) => {
      if (cmGeo.status !== 'ready')
        return { tier: 'UNMAPPED', matched: null, provenance: 'NOT_LOADED', locations: [],
                 basis: 'geography reference not loaded (' + cmGeo.status + ')' };
      const states = cmStatesIn(text);
      const locations = [];
      const add = (label, state, county, tier, basis) => {
        if (locations.some(l => l.label === label)) return;
        locations.push({ label, state, county, tier, basis });
      };
      let sawUnresolvedCounty = false;

      // 1. explicit counties (all of them, not just the first)
      const counties = cmScanCounties(text);
      let pref = counties.filter(c => states.size === 0 || states.has(c.state));
      if (pref.length > 1) {
        // "Nassau County" exists in both NY and FL. With no state named, claim a
        // market only when exactly ONE interpretation is in a configured tier.
        const byPhrase = new Map();
        for (const c of pref) {
          if (!byPhrase.has(c.phrase)) byPhrase.set(c.phrase, []);
          byPhrase.get(c.phrase).push(c);
        }
        const keep = [];
        for (const group of byPhrase.values()) {
          if (group.length === 1) { keep.push(group[0]); continue; }
          const mapped = group.filter(c => {
            const r = cmTierForCounty(c.state, c.county);
            return r && r.tier !== 'UNMAPPED';
          });
          if (mapped.length === 1) keep.push(mapped[0]);
          else sawUnresolvedCounty = true;      // genuinely ambiguous
        }
        pref = keep;
      }
      for (const c of (pref.length ? pref : counties)) {
        const r = cmTierForCounty(c.state, c.county);
        if (!r) continue;
        if (r.tier === 'UNMAPPED') { sawUnresolvedCounty = true; continue; }
        add(c.phrase, c.state, c.county, r.tier, 'explicit county - ' + r.basis);
      }

      // 1b. stakeholder-stated regions (e.g. Long Island)
      for (const st of Object.keys(cmGeo.geography.states || {})) {
        for (const rg of (cmGeo.geography.states[st].regions || [])) {
          if (states.size > 0 && !states.has(st)) continue;
          if (padHas(text, rg.name))
            add(rg.name, st, (rg.counties || []).join('/'), rg.tier,
                'stated region ' + rg.name + ' (' + (rg.counties || []).join(', ') + ')');
        }
      }

      // 2/3. municipalities
      const scored = [];
      for (const p of cmScanPlaces(text)) {
        for (const e of p.hits) {
          const corroborated = states.has(e.state);
          if (states.size > 0 && !corroborated) continue;        // contradicted by the stated state
          if (p.hits.length > 1 && !corroborated) continue;      // same name in 2+ states: needs evidence
          if (!corroborated) {
            // No state named anywhere: demand real locational evidence. A
            // preposition can corroborate any place class ("in Aberdeen"). An
            // asset immediately after a solid place can do the same ("Sarasota
            // distribution center"). A non-solid class needs both a distinctive
            // multi-word name and that asset context ("Carneys Point logistics
            // campus"), preventing generic false matches such as "Commercial
            // warehouse" against a township named Commercial.
            const cueBefore = CM_LOC_CUES.has(p.prev);
            const assetAfter = CM_ASSET_AFTER.test(p.after);
            if (!CM_SOLID_CLASS.has(e.type) && !cueBefore && !(p.words > 1 && assetAfter)) continue;
            if (p.words < 2 && !cueBefore && !assetAfter) continue;
          }
          scored.push({ p, e, corroborated,
            isStateName: CM_STATE_FULL.some(sf => sf[1].test(p.phrase) && p.phrase.length <= 12),
            rank: (corroborated ? 1000 : 0) + p.words * 100 + (CM_CLASS_RANK[e.type] || 0) });
        }
      }
      // "Hempstead, New York": the phrase "New York" is also a city name, but
      // here it is the state qualifier. Any genuine municipality outranks it.
      scored.sort((a, b) => (Number(a.isStateName) - Number(b.isStateName)) || (b.rank - a.rank));
      const realPlaces = scored.filter(s => !s.isStateName);
      for (const s of (realPlaces.length ? realPlaces : scored)) {
        const r = cmTierForPlace(s.e);
        if (r.tier === 'UNMAPPED') continue;
        add(s.p.phrase, s.e.state, s.e.county, r.tier,
            (s.corroborated ? 'municipality + state' : 'unambiguous municipality') + ' - ' + r.basis);
      }

      // ---- choose one tier from everything found -------------------------
      const tiers = new Set(locations.map(l => l.tier));
      const names = locations.map(l => l.label).join(', ');
      if (tiers.size) {
        if (tiers.has('BROADER') && tiers.has('TARGET'))
          return { tier: 'BROADER', matched: names, provenance: 'MULTI_MARKET', locations,
            basis: 'multi-market portfolio (' + names + ') spans TARGET and BROADER - '
                   + 'stricter BROADER threshold applied' };
        if (tiers.has('BROADER'))
          return { tier: 'BROADER', matched: names, provenance: locations.length > 1 ? 'MULTI_MARKET' : 'EXACT',
            locations, basis: locations.length > 1
              ? 'all resolved locations BROADER (' + names + ')' : locations[0].basis };
        // TARGET only. If material geography went unresolved alongside it, do
        // not hand the article the easier TARGET bar.
        const unresolvedOther = sawUnresolvedCounty ||
          [...states].some(st => !locations.some(l => l.state === st));
        if (unresolvedOther)
          return { tier: 'BROADER', matched: names, provenance: 'MULTI_MARKET_CONSERVATIVE', locations,
            basis: 'resolved ' + names + ' (TARGET) but other material geography did not resolve - '
                   + 'stricter BROADER threshold applied' };
        return { tier: 'TARGET', matched: names,
          provenance: locations.length > 1 ? 'MULTI_MARKET' : 'EXACT', locations,
          basis: locations.length > 1 ? 'all resolved locations TARGET (' + names + ')' : locations[0].basis };
      }

      // 4. explicit out-of-scope state, only when none of ours is named
      if (states.size === 0) {
        const padded = ' ' + text.toLowerCase().replace(/[^a-z]+/g, ' ') + ' ';
        const other = CM_OTHER_STATES.find(s => padded.includes(' ' + s + ' '));
        if (other) return { tier: 'NATIONAL', matched: other, provenance: 'EXACT', locations: [],
          basis: 'explicit out-of-scope state (' + other + ')' };
      }

      // 5. A. New Jersey named but nothing inside it resolved. Jacob's rule
      // partitions ALL of NJ into TARGET (north of Exit 6) and BROADER (the
      // rest), so a statewide NJ deal is certainly in one of them. BROADER is
      // the stricter of the two, so applying it cannot admit a transaction that
      // the real market tier would have rejected. Deliberately NJ-only: PA, FL
      // and NY have unmapped counties, so a state-only story there could be
      // outside the covered market entirely and must stay UNMAPPED.
      if (states.has('NJ'))
        return { tier: 'BROADER', matched: 'New Jersey', provenance: 'NJ_STATE_ONLY_CONSERVATIVE',
          locations: [], basis: 'New Jersey named with no resolvable municipality or county; '
            + 'the whole state is TARGET or BROADER, so the stricter BROADER threshold is applied' };

      // 6. explicit non-target / nationwide framing
      const lower = text.toLowerCase();
      const nat = states.size === 0 ? CM_GEO.NATIONAL.find(k => lower.includes(k)) : null;
      if (nat) return { tier: 'NATIONAL', matched: nat, provenance: 'EXACT', locations: [],
                        basis: 'explicit non-target market / nationwide framing' };

      // 7. nothing resolvable. A PA/FL/NY state name alone, or vague phrasing
      // such as "South Florida", is deliberately NOT enough to assign a market.
      if (states.size)
        return { tier: 'UNMAPPED', matched: [...states][0], provenance: 'NONE', locations: [],
                 basis: 'state named but no county or municipality evidence (no state-only '
                        + 'fallback outside New Jersey)' };
      return { tier: 'UNMAPPED', matched: null, provenance: 'NONE', locations: [],
               basis: 'no recognisable geography' };
    };

    // Returns { tier: 'TARGET'|'BROADER'|'NATIONAL'|'UNMAPPED', matched, basis }
    const cmMarketTier = (text) => cmResolveGeography(text || '');

    // --- magnitude extraction (title + description + summary) ------------
    const cmText = (a) => `${a.title || ''} ${a.description || ''} ${a.summary || ''}`;
    const cmDollars = (text) => {
      const t = (text || '').replace(/,/g, '');
      let best = 0;
      for (const m of t.matchAll(/\$\s?([\d.]+)\s*(billion|bn|b\b|million|mm|m\b|k\b)?/gi)) {
        const n = parseFloat(m[1]); if (isNaN(n)) continue;
        const u = (m[2] || '').toLowerCase();
        const v = /^b/.test(u) ? n * 1e9 : /^m/.test(u) ? n * 1e6 : /^k/.test(u) ? n * 1e3 : n;
        if (v > best) best = v;
      }
      return best;
    };
    const cmSquareFeet = (text) => {
      const t = (text || '').replace(/,/g, '');
      let best = 0;
      for (const m of t.matchAll(/([\d.]+)\s*(million|m\b|k\b)?[-\s]*(?:square[- ]f[eo]{2}t|sq\.?\s*ft\.?|sf\b|s\.f\.|msf\b)/gi)) {
        const n = parseFloat(m[1]); if (isNaN(n)) continue;
        const u = (m[2] || '').toLowerCase();
        const v = /million|^m$/.test(u) ? n * 1e6 : /^k$/.test(u) ? n * 1e3 : n;
        if (v > best) best = v;
      }
      for (const m of t.matchAll(/([\d.]+)\s*msf\b/gi)) { const v = parseFloat(m[1]) * 1e6; if (v > best) best = v; }
      return best;
    };

    // Jacob's thresholds — unchanged.
    const CM_THRESHOLDS = {
      sale:  { TARGET: 10e6,  BROADER: 100e6,  NATIONAL: 500e6 },
      lease: { TARGET: 15000, BROADER: 100000, NATIONAL: 250000 },
      constructionBroader: 500000,
    };

    const CM_RX = {
      // C. SALES = an actual ownership transaction. Financing, refinancing,
      // loans, CMBS and recapitalisations are NOT sales; they may still qualify
      // for Relevant Market Intelligence under the positive-inclusion rules.
      // NOTE: "for sale" is deliberately ABSENT. A property being offered is
      // not a completed ownership transfer. It is not routed to Availabilities
      // either - no stakeholder rule covers investment-sale listings yet.
      sale: /\b(sells?|sold|sale of|sale to|acquires?|acquired|acquisition|buys?|bought|purchas\w+|trades? for|trades? hands|changes? hands|disposition|divests?|divested)\b/i,
      financing: /\b(refinanc\w+|\brefi\b|financ\w+|\bloans?\b|mortgage|cmbs|securitiz\w+|asset[- ]backed|recapitaliz\w+|\brecap\b|debt placement|credit facility)\b/i,
      // Bare "leasing" is thematic language ("the industrial leasing map"),
      // not proof that a specific lease occurred. Concrete action is required.
      // A completed LEASE TRANSACTION requires a completion action. Marketing
      // language ("for lease", "now leasing", "available") describes an
      // AVAILABILITY - space being offered - and must never be booked as a
      // signed deal. Note "for lease" contains the word "lease", which is why
      // the completion pattern below never matches a bare "lease"/"leasing".
      leaseCompleted: /\b(?:signs?|signed|inks?|inked|executes?|executed)\s+(?:a|an|the)?\s*(?:new\s+|long[- ]term\s+)?(?:\d[\d,.]*\s*(?:k\s*)?(?:sf|sq\.?\s*f(?:t\.?|eet)|square[- ]f\w+)\s+)?(?:lease|sublease|renewal)\b|\bleased\b|\bre[- ]lease[sd]?\b|\brenew(?:s|ed|al|als)\b|\b(?:takes?|took)\s+(?:over\s+)?\d[\d,.]*\s*(?:k\s*)?(?:sf|sq\.?\s*f(?:t\.?|eet)|square[- ]f\w+)|\bexpands?\s+(?:its\s+)?(?:occupancy|footprint\s+at)|\brelocat\w+\s+to\b|\bmoves?\s+into\b|\btenant\s+(?:signs?|signed|inks?|took|takes?)\b/i,
      availabilityOffer: /\b(?:for\s+(?:lease|sublease)|available|availabilit\w+|now\s+leasing|listed\s+for\s+lease|on\s+the\s+market|offering\s+memorandum|space\s+available|seeking\s+tenants?|marketing\s+the\s+space)\b/i,
      // Completion verbs need an actual construction/asset object. A bare
      // "completed" also occurs in "completed the acquisition" and previously
      // misrouted sales into Construction Updates.
      construction: /\b(?:break(?:s|ing)? ground|groundbreaking|construction (?:start|starts|started|completion|completes?|completed)|starts? construction|construction (?:is )?underway|wall tilt|walls? tilted|vertical construction|tilt-?up|topping out|tops? out|(?:completes?|completed|delivers?|delivered)\s+(?:(?:construction|work)\s+(?:of|on)\s+)?(?:a|an|the)?\s*(?:[\d,.]+\s*(?:million|m|k)?\s*(?:square[- ]f[eo]{2}t|sq\.?\s*ft\.?|sf)\s+)?(?:industrial\s+)?(?:warehouse|facility|building|distribution cent\w+|logistics cent\w+|fulfillment cent\w+|manufacturing plant|data ?cent\w+)(?!\s+(?:acquisition|purchase|sale|deal|transaction))|(?:warehouse|facility|building|distribution cent\w+|logistics cent\w+|fulfillment cent\w+|manufacturing plant|data ?cent\w+)\s+(?:construction\s+)?(?:is\s+)?(?:complete|completed|delivered))\b/i,
      industrial: /\b(industrial|warehouse|distribution cent\w+|logistics|cold storage|manufactur\w+|fulfillment|data ?cent\w+)\b/i,
      municipal: /\b(planning board|zoning board|ordinance|rezon\w+|site plan|entitlement\w*|moratorium|variance|redevelopment plan|data ?cent\w+ (?:regulation|rules|restrictions|ordinance))\b/i,
      lowValue: /\b(obsolete|brokerage assignment|named exclusive (?:agent|broker)|hires? \w+ as broker|tapped to market|assignment to market|ribbon[- ]cutting|golf outing|charity|awards?\b|honou?ree|best places to work|top \d+ (?:brokers|agents|firms)|rankings?\b|webinar|podcast|conference|summit|networking|people on the move|promoted to|joins? as|named (?:president|ceo|cfo|partner|director))\b/i,
    };

    // --- D. Positive-inclusion market intelligence ------------------------
    // An item enters Relevant Market Intelligence ONLY on an explicit material
    // signal. "Contains an industrial keyword" is NOT sufficient.
    const CM_INTEL_SIGNALS = [
      ['market-fundamentals', /\b(vacancy rate|vacancy|absorption|net absorption|rent growth|asking rents|rental rates|deliveries|construction pipeline|supply pipeline|demand (?:for|remains|returns|jumps)|occupanc\w+)\b/i],
      ['capital-trend', /\b(cap rates?|cmbs|debt markets?|lending|capital markets?|valuations?|pricing trends?|investment volume|dry powder|fundrais\w+)\b/i],
      // Structured finance is market-structure news, not a single-property
      // transaction, so it carries the thematic 'capital-trend' label and is
      // not filtered out by the property-specific guard for naming a dollar
      // amount. Industrial/data-center context is still required downstream by
      // the isInd check, so a consumer-loan ABS story cannot enter.
      // NOTE: bare "ABS" is matched case-SENSITIVELY by cmStructuredFinance,
      // never here, so "abs" inside an ordinary word can never match.
      ['capital-trend', /\b(securitiz\w+|asset[- ]backed(?: securit\w+)?|single[- ]asset single[- ]borrower)\b/i],
      ['institutional-strategy', /\b(joint venture|\bjv\b|fund (?:close[sd]?|raises?|launch\w*)|raises? \$[\d.]+|platform acquisition|portfolio strategy|allocat\w+ to industrial|enters? the \w+ market|expands? (?:its )?(?:industrial )?portfolio)\b/i],
      // "Expansion" alone is too broad: a proposed property deal or a company
      // name can contain it without proving a material operating expansion.
      ['tenant-expansion', /\b(expands? (?:manufacturing|operations|distribution)|(?:manufacturing|operations|distribution|facility|footprint|capacity) expansion|new (?:plant|factory|manufacturing facility)|opens? (?:a )?(?:new )?(?:plant|facility|distribution cent\w+)|adds? \d[\d,.]* jobs|relocat\w+ headquarters)\b/i],
      ['legislation-regulation', /\b(legislation|law|bill|statute|regulat\w+|executive order|tax credit|incentive program|policy|state(?:wide)? (?:rules|limits|restrictions))\b/i],
      ['power-infrastructure', /\b(power grid|grid capacity|electricity|megawatts?|\bmw\b|utility|substation|transmission|interconnection|energy demand|power (?:constraints?|shortage))\b/i],
      ['data-center-intel', /\b(data ?cent\w+)\b.*\b(pipeline|demand|capacity|market|investment|moratorium|regulation|backlash|development boom|vacancy|supply chain|leasing (?:activity|demand|map))\b/i],
    ];
    // "ABS" is an asset-backed security only as a standalone UPPERCASE token.
    // A case-insensitive test would match "abs" inside other words, and the
    // market-fundamentals signal already owns "absorption". Requiring a
    // securities noun nearby keeps unrelated all-caps uses out.
    const CM_ABS_TOKEN = /(^|[^A-Za-z0-9])ABS([^A-Za-z0-9]|$)/;
    const cmStructuredFinance = (text) => CM_ABS_TOKEN.test(text)
      && /\b(securit\w+|bond|note|issuance|offering|deal|financ\w+|transaction)\b/i.test(text);

    const cmIntelSignal = (text) => {
      for (const [label, rx] of CM_INTEL_SIGNALS) if (rx.test(text)) return label;
      if (cmStructuredFinance(text)) return 'capital-trend';
      // A large industrial portfolio financing is material capital-markets
      // intelligence even when a terse headline says only "refi". Keep this
      // deliberately narrow: portfolio context and at least $500M are both
      // required, so ordinary property loans do not flood the section.
      if (CM_RX.financing.test(text) && /\bportfolio\b/i.test(text) && cmDollars(text) >= 500e6)
        return 'capital-trend';
      return null;
    };

    const CM_REJECT = { MISSING_PRICE: 'MISSING_PRICE', MISSING_SF: 'MISSING_SF', BELOW_THRESHOLD: 'BELOW_THRESHOLD', UNMAPPED_GEO: 'UNMAPPED_GEO', LOW_VALUE_INTEL: 'LOW_VALUE_INTEL', NO_SIGNAL: 'NO_SIGNAL', NOT_INDUSTRIAL: 'NOT_INDUSTRIAL', NATIONAL_CONSTRUCTION: 'NATIONAL_CONSTRUCTION', PROPERTY_SPECIFIC: 'PROPERTY_SPECIFIC' };

    /** Classify one article. Returns { section|null, tier, code, reason, magnitude } */
    const cmClassify = (a) => {
      const text = cmText(a);
      const { tier, matched, basis, provenance, locations } = cmMarketTier(text);
      const provTag = (provenance && provenance !== 'EXACT') ? ` [${provenance}]` : '';
      const locTag = (locations && locations.length > 1)
        ? ` [locations: ${locations.map(l => l.label).join(' + ')}]` : '';
      const geo = `${tier}${matched ? ` via "${matched}"` : ''} (${basis})${provTag}${locTag}`;
      const dollars = cmDollars(text), sf = cmSquareFeet(text);
      const isInd = CM_RX.industrial.test(text);
      // Headline event order resolves mixed stories. A sale/lease/availability
      // headline may mention a completed building in its description; that does
      // not turn the transaction into a construction update. Conversely,
      // "Developer completes warehouse it acquired last year" remains
      // Construction because the construction action leads the headline.
      const titleOnly = a.title || '';
      const finAt = titleOnly.search(CM_RX.financing);
      const saleAt = titleOnly.search(CM_RX.sale);
      const leaseAt = titleOnly.search(CM_RX.leaseCompleted);
      const availAt = titleOnly.search(CM_RX.availabilityOffer);
      const constructionAt = titleOnly.search(CM_RX.construction);
      const nonConstructionAt = [finAt, saleAt, leaseAt, availAt].filter(i => i >= 0)
        .reduce((best, i) => Math.min(best, i), Number.POSITIVE_INFINITY);
      const constructionLeadsHeadline = constructionAt >= 0 && constructionAt < nonConstructionAt;
      const constructionOnlyInBody = constructionAt < 0 && !Number.isFinite(nonConstructionAt);

      if (CM_RX.municipal.test(text)) {
        // Geography gates municipal items exactly as it gates every other
        // section. This check must PRECEDE acceptance: it previously sat after
        // it, so no municipal item was ever geography-validated and a planning
        // board anywhere in the country could reach Week in Review.
        // NATIONAL matters as much as UNMAPPED here. An explicitly named
        // out-of-scope state resolves to NATIONAL, so gating on UNMAPPED alone
        // would still admit an out-of-state entitlement story.
        if (tier === 'UNMAPPED' || tier === 'NATIONAL') {
          return { section: null, tier, code: CM_REJECT.UNMAPPED_GEO, magnitude: null,
                   reason: `UNMAPPED_GEO: municipal/entitlement item outside the covered markets; ${geo}` };
        }
        return { section: 'municipal', tier, code: null, magnitude: null, reason: `municipal/entitlement keyword; ${geo}` };
      }
      if (CM_RX.lowValue.test(text)) {
        return { section: null, tier, code: CM_REJECT.LOW_VALUE_INTEL, magnitude: null,
                 reason: `LOW_VALUE_INTEL: "${(text.match(CM_RX.lowValue) || [''])[0]}"` };
      }
      // --- B. Construction --------------------------------------------
      if (CM_RX.construction.test(text) && (constructionLeadsHeadline || constructionOnlyInBody)) {
        if (!isInd) return { section: null, tier, code: CM_REJECT.NOT_INDUSTRIAL, magnitude: sf, reason: 'NOT_INDUSTRIAL: construction milestone without industrial context' };
        if (tier === 'TARGET') return { section: 'construction', tier, code: null, magnitude: sf, reason: `TARGET industrial construction milestone — qualifies regardless of stated SF; ${geo}` };
        if (tier === 'BROADER') {
          if (!sf) return { section: null, tier, code: CM_REJECT.MISSING_SF, magnitude: 0, reason: `MISSING_SF: BROADER construction requires >500,000 SF, none stated; ${geo}` };
          if (sf > CM_THRESHOLDS.constructionBroader) return { section: 'construction', tier, code: null, magnitude: sf, reason: `BROADER construction ${sf.toLocaleString()} SF > 500,000; ${geo}` };
          return { section: null, tier, code: CM_REJECT.BELOW_THRESHOLD, magnitude: sf, reason: `BELOW_THRESHOLD: BROADER construction ${sf.toLocaleString()} SF does not exceed 500,000 (<=)` };
        }
        if (tier === 'NATIONAL') return { section: null, tier, code: CM_REJECT.NATIONAL_CONSTRUCTION, magnitude: sf, reason: 'NATIONAL_CONSTRUCTION: no national construction rule requested — excluded for now' };
        return { section: null, tier, code: CM_REJECT.UNMAPPED_GEO, magnitude: sf, reason: `UNMAPPED_GEO: construction in an unmapped location — diagnostic/review only; ${geo}` };
      }
      // --- C. Sales ----------------------------------------------------
      // The HEADLINE decides the event type. "Owner refinances the park it
      // acquired in 2024" is a financing story, not a sale, even though the
      // body carries an acquisition verb.
      // Whichever verb leads the headline defines the event: "Owner refinances
      // the park it acquired in 2024" is a financing story, not a sale.
      const financingHeadline = finAt >= 0 && (saleAt < 0 || finAt < saleAt);
      if (CM_RX.sale.test(text) && !financingHeadline) {
        if (tier === 'UNMAPPED') return { section: null, tier, code: CM_REJECT.UNMAPPED_GEO, magnitude: dollars, reason: `UNMAPPED_GEO: sale in an unmapped location — not admitted under a guessed threshold; ${geo}` };
        if (!dollars) return { section: null, tier, code: CM_REJECT.MISSING_PRICE, magnitude: 0, reason: `MISSING_PRICE: no defensible price in title+description; ${geo}` };
        const need = CM_THRESHOLDS.sale[tier];
        if (dollars > need) return { section: 'sales', tier, code: null, magnitude: dollars, reason: `sale $${(dollars / 1e6).toFixed(1)}M > $${need / 1e6}M (${tier}); ${geo}` };
        return { section: null, tier, code: CM_REJECT.BELOW_THRESHOLD, magnitude: dollars, reason: `BELOW_THRESHOLD: sale $${(dollars / 1e6).toFixed(1)}M does not exceed $${need / 1e6}M (<=, ${tier})` };
      }
      // --- C. Availability / Lease -------------------------------------
      // Completion language wins; otherwise offer language makes it an
      // Availability. Previously `for lease` matched the lease pattern, so
      // every marketed listing was booked as a signed transaction.
      const completedLease = CM_RX.leaseCompleted.test(text);
      const availOffer = CM_RX.availabilityOffer.test(text);
      const isAvail = availOffer && !completedLease;
      if (isAvail || completedLease) {
        const sect = isAvail ? 'availabilities' : 'leases';
        if (tier === 'UNMAPPED') return { section: null, tier, code: CM_REJECT.UNMAPPED_GEO, magnitude: sf, reason: `UNMAPPED_GEO: ${sect} in an unmapped location; ${geo}` };
        if (!sf) return { section: null, tier, code: CM_REJECT.MISSING_SF, magnitude: 0, reason: `MISSING_SF: no defensible SF in title+description; ${geo}` };
        const need = CM_THRESHOLDS.lease[tier];
        if (sf > need) return { section: sect, tier, code: null, magnitude: sf, reason: `${sect} ${sf.toLocaleString()} SF > ${need.toLocaleString()} (${tier}); ${geo}` };
        return { section: null, tier, code: CM_REJECT.BELOW_THRESHOLD, magnitude: sf, reason: `BELOW_THRESHOLD: ${sect} ${sf.toLocaleString()} SF does not exceed ${need.toLocaleString()} (<=, ${tier})` };
      }
      // --- D. Market intelligence (positive inclusion only) -------------
      // GUARD: every deal-shaped path above RETURNS, so an article rejected for
      // UNMAPPED_GEO / MISSING_PRICE / MISSING_SF / BELOW_THRESHOLD can never
      // fall through to here. This second guard covers property/deal-specific
      // items that did not trip those regexes: they must not enter Market
      // Intelligence just for carrying an industrial keyword. Genuinely
      // national/thematic intelligence is still eligible without mapped geo.
      const signal = cmIntelSignal(text);
      const propertySpecific = /\b\d+[\d,-]*\s+[A-Z][A-Za-z.]*\s+(?:st|street|ave|avenue|rd|road|blvd|drive|dr|way|lane|ln|pkwy|parkway|highway|route|rt)\b/i.test(text)
        || /\$\s?[\d.]+\s*(?:million|billion|m|b)\b/i.test(text)
        || /\b\d[\d,]*\s*(?:square[- ]f[eo]{2}t|sq\.?\s*ft|sf)\b/i.test(text);
      const thematic = signal === 'market-fundamentals' || signal === 'capital-trend'
        || signal === 'legislation-regulation' || signal === 'power-infrastructure';
      if (signal && isInd && propertySpecific && !thematic) {
        return { section: null, tier, code: CM_REJECT.PROPERTY_SPECIFIC, magnitude: null,
                 reason: `PROPERTY_SPECIFIC: deal/property-specific item cannot enter Market Intelligence via an industrial keyword (signal: ${signal})` };
      }
      if (signal && isInd) return { section: 'intel', tier, code: null, magnitude: null, reason: `intel signal: ${signal}; ${geo}` };
      if (signal && !isInd) return { section: null, tier, code: CM_REJECT.NOT_INDUSTRIAL, magnitude: null, reason: `NOT_INDUSTRIAL: ${signal} signal without industrial/data-center context` };
      return { section: null, tier, code: CM_REJECT.NO_SIGNAL, magnitude: null, reason: 'NO_SIGNAL: no deal, lease, construction, municipal or material-intelligence signal' };
    };

    // Conservative same-edition dedup. Exact normalized headlines collapse in
    // every section. Sales also collapse when the amount, resolved geography,
    // publication week and at least one distinctive token agree. The latter is
    // intentionally sales-only: lease/SF figures repeat too often to use size
    // as a safe cross-publisher identity signal.
    const CM_DEDUPE_STOP = new Set(['about','after','again','against','among','another','before',
      'building','buildings','buys','buyer','commercial','county','deal','distribution','estate',
      'fully','industrial','logistics','million','portfolio','properties','property','purchase',
      'purchases','real','sale','sells','sold','square','warehouse','warehouses','with',
      'miami','dade','jersey','pennsylvania','florida','county']);
    const cmStoryTitleKey = (title) => String(title || '')
      .replace(/\s+[-–—|]\s+(?:the\s+)?[A-Z][A-Za-z0-9 .&'-]{1,45}$/i, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const cmDistinctiveTokens = (a) => new Set(cmText(a).toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !CM_DEDUPE_STOP.has(w)
        && !/^\d+(?:k|m|mm|b|bn)?$/.test(w)));
    const cmGeoFingerprint = (a) => {
      const g = cmMarketTier(cmText(a));
      // A county may be detected once from "Miami-Dade County" and again from
      // "Miami-Dade" or a municipality in that county. Collapse those aliases
      // before comparing syndicated copies.
      const places = [...new Set((g.locations || [])
        .map(l => `${l.state || ''}:${l.county || l.label || ''}`))].sort();
      return places.length ? places.join('|') : `${g.tier || ''}:${g.matched || ''}`;
    };
    const CM_COUNT_WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    const cmAssetCount = (a) => {
      const t = cmText(a).toLowerCase();
      const m = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b[^.!?]{0,45}\b(?:warehouses?|buildings?|properties|assets|facilities)\b/);
      if (!m) return 0;
      return /^\d+$/.test(m[1]) ? Number(m[1]) : (CM_COUNT_WORD[m[1]] || 0);
    };
    const cmSameSaleStory = (a, b) => {
      const ca = a._cm || {}, cb = b._cm || {};
      if (!ca.magnitude || ca.magnitude !== cb.magnitude) return false;
      const ga = cmGeoFingerprint(a), gb = cmGeoFingerprint(b);
      if (!ga || ga !== gb) return false;
      const da = new Date(a.pubDate || a.fetchedAt || 0).getTime();
      const db = new Date(b.pubDate || b.fetchedAt || 0).getTime();
      const gap = Number.isFinite(da) && Number.isFinite(db) ? Math.abs(da - db) : Infinity;
      if (gap > 7 * 86400000) return false;
      const ta = cmDistinctiveTokens(a), tb = cmDistinctiveTokens(b);
      for (const t of ta) if (tb.has(t)) return true;
      // Some aggregator headlines omit both buyer and seller. Exact amount +
      // canonical county is not enough on its own, but if both headlines also
      // state the same multi-asset count within 48 hours, that is a sufficiently
      // narrow signature for the same sale without guessing from prose.
      const ac = cmAssetCount(a), bc = cmAssetCount(b);
      if (gap <= 48 * 3600000 && ac > 1 && ac === bc) return true;
      return false;
    };
    const cmDedupeBucket = (items, sectionName) => {
      const kept = [], titleKeys = new Set();
      let removed = 0;
      for (const item of items) {
        const tk = cmStoryTitleKey(item.title);
        if (tk && titleKeys.has(tk)) { removed++; continue; }
        if (sectionName === 'sales' && kept.some(prev => cmSameSaleStory(prev, item))) {
          removed++;
          continue;
        }
        if (tk) titleKeys.add(tk);
        kept.push(item);
      }
      return { items: kept, removed };
    };

    /** Runs the profile over already-loaded articles. No network I/O. */
    const cmBuildSections = (articles, asOfDate, lookbackHours) => {
      // Website date pickers pass YYYY-MM-DD and intentionally mean the end of
      // that selected day. Server delivery passes an ISO timestamp so a
      // "24-hour" edition is a true rolling 24-hour window at send time.
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate || ''));
      const asOf = asOfDate
        ? new Date(dateOnly ? asOfDate + 'T23:59:59' : asOfDate)
        : new Date();
      const cutoff = new Date(asOf.getTime() - lookbackHours * 3600 * 1000);
      const inWindow = [];
      for (const a of articles || []) {
        const d = new Date(a.pubDate || a.fetchedAt || 0);
        if (d >= cutoff && d <= asOf) inWindow.push(a);
      }
      const buckets = { sales: [], leases: [], availabilities: [], construction: [], intel: [], municipal: [] };
      const rejected = [];
      const telemetry = { MISSING_PRICE: 0, MISSING_SF: 0, BELOW_THRESHOLD: 0, UNMAPPED_GEO: 0, LOW_VALUE_INTEL: 0, NO_SIGNAL: 0, NOT_INDUSTRIAL: 0, NATIONAL_CONSTRUCTION: 0 };
      const tiers = { TARGET: 0, BROADER: 0, NATIONAL: 0, UNMAPPED: 0 };
      for (const a of inWindow) {
        const c = cmClassify(a);
        tiers[c.tier] = (tiers[c.tier] || 0) + 1;
        if (c.section) buckets[c.section].push({ ...a, _cm: c });
        else { rejected.push({ ...a, _cm: c }); if (c.code) telemetry[c.code] = (telemetry[c.code] || 0) + 1; }
      }
      const byMag = (x, y) => (y._cm.magnitude || 0) - (x._cm.magnitude || 0)
        || new Date(y.pubDate || y.fetchedAt || 0) - new Date(x.pubDate || x.fetchedAt || 0);
      const deduped = {};
      Object.keys(buckets).forEach(k => {
        buckets[k].sort(byMag);
        const d = cmDedupeBucket(buckets[k], k);
        buckets[k] = d.items;
        deduped[k] = d.removed;
      });
      return { buckets, rejected, inWindow, telemetry, tiers, deduped, asOf, cutoff };
    };

    // ---------------------------------------------------------------------
    // INSTITUTIONAL COMPETITOR WATCH (private runtime input, 2026-09-18)
    // ---------------------------------------------------------------------
    // In the website preview the watchlist is uploaded via FileReader, held in
    // React component memory ONLY, and disappears on refresh. The server-side
    // shadow/canary adapter may inject the same rows from a runtime secret. In
    // both cases the list is never committed, logged, or persisted by this
    // module.
    const CM_CSV_COLUMNS = ['Company Name', 'Secondary Type', 'City', 'State / Country',
      'NNJ Search SF', 'NNJ Search Properties', 'Portfolio SF', 'Website', 'Website Domain'];

    // Minimal RFC4180-ish parser (handles quoted fields and embedded commas).
    const cmParseCSV = (text) => {
      const rows = []; let row = [], field = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
          if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
          else if (c === '"') q = false;
          else field += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
      }
      if (field.length || row.length) { row.push(field); rows.push(row); }
      if (!rows.length) return [];
      const hdr = rows[0].map(h => h.trim());
      return rows.slice(1).filter(r => r.some(v => (v || '').trim()))
        .map(r => Object.fromEntries(hdr.map((h, i) => [h, (r[i] || '').trim()])));
    };

    // Generic tokens that may NEVER stand alone as a company match.
    const CM_GENERIC = new Set(['matrix', 'bridge', 'center', 'centre', 'link', 'core', 'summit',
      'pinnacle', 'gateway', 'liberty', 'national', 'american', 'united', 'first', 'prime',
      'capital', 'industrial', 'logistics', 'properties', 'property', 'realty', 'real', 'estate',
      'group', 'partners', 'partner', 'development', 'developers', 'management', 'equities',
      'trust', 'holdings', 'ventures', 'advisors', 'company', 'companies', 'associates',
      'enterprises', 'investments', 'investment', 'acquisitions', 'north', 'south', 'east', 'west']);

    const cmNormalizeCompany = (name) => (name || '')
      .toLowerCase()
      .replace(/[.,]/g, ' ')
      .replace(/\b(inc|llc|l\.l\.c|lp|l\.p|llp|corp|corporation|co|ltd|plc|reit|trust|the)\b/g, ' ')
      .replace(/[^a-z0-9& ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Words that can never identify a company on their own. "commercial" is
    // here because "Commercial Observer" is a PUBLISHER: without it, the
    // Commercial* family brand matched every article that outlet wrote.
    const CM_GENERIC_EXTRA = ['commercial', 'residential', 'business', 'journal',
      'observer', 'daily', 'news', 'times', 'post', 'press', 'media', 'report',
      'urban', 'metro', 'regional', 'community', 'development', 'corporation'];

    /** True when a phrase is purely geographic - a state, a known municipality,
     *  or a mapped county/corridor. A watchlist entry whose name BEGINS with a
     *  state name must never be matchable on that state alone, or every
     *  article mentioning the state is attributed to that one company. */
    const cmIsGeographyOnly = (phrase) => {
      const p = String(phrase || '').trim().toLowerCase();
      if (!p) return true;
      if (Object.prototype.hasOwnProperty.call(US_STATE_NAMES, p)) return true;
      for (const st of REGION_TARGETS) {
        if ((REGION_CITIES[st] || []).includes(p)) return true;
        if ((REGION_AREAS[st] || []).includes(p)) return true;
      }
      if (REGION_NON_TARGET_CITIES.includes(p)) return true;
      // Also reject "<state> <generic>" shapes such as "new jersey community".
      const words = p.split(' ');
      if (words.length >= 2) {
        for (let n = words.length; n >= 2; n--) {
          const head = words.slice(0, n).join(' ');
          if (Object.prototype.hasOwnProperty.call(US_STATE_NAMES, head)) {
            const tail = words.slice(n);
            if (!tail.length || tail.every(w => CM_GENERIC.has(w) || CM_GENERIC_EXTRA.includes(w))) return true;
          }
        }
      }
      return false;
    };

    /** An acronym company ("ACME", "XYZ REIT"). Matched ONLY as an
     *  exact uppercase token in the original text, never case-insensitively, so
     *  "ubs" inside a word and "bci" in prose cannot trigger it. */
    const cmAcronymTokens = (rawName) => {
      const out = [];
      for (const tok of String(rawName || '').split(/[^A-Za-z0-9&]+/)) {
        if (!tok) continue;
        // Minimum THREE characters. A two-letter token is not distinctive enough:
        // a two-letter token matched the unrelated prefix of a similarly-named
        // REIT in a headline. Every acronym on the list is 3+ characters, so
        // this costs no real coverage.
        if (!/^[A-Z0-9&]{3,6}$/.test(tok)) continue;
        if (/^(INC|LLC|LP|LLP|CO|CORP|LTD|PLC|REIT|USA|US|THE|AND)$/.test(tok)) continue;
        if (!/[A-Z]/.test(tok)) continue;
        out.push(tok);
      }
      return [...new Set(out)];
    };

    const cmCompanyAliases = (rawName) => {
      const full = cmNormalizeCompany(rawName);
      // A PURE acronym company - one whose entire normalised name is a short
      // uppercase token - gets NO lowercase alias at all. Lowercase substring
      // matching on a 3-4 letter token is far too loose - "pgim" and "ubs"
      // occur inside ordinary words. These companies are reachable ONLY via the
      // exact case-sensitive acronym token or hard domain evidence.
      const acr = cmAcronymTokens(rawName);
      if (acr.length && full && full.split(' ').every(w =>
            acr.some(t => t.toLowerCase().replace(/[^a-z0-9]/g, '') === w.replace(/[^a-z0-9]/g, '')))) {
        return [];
      }
      if (!full) return [];
      const words = full.split(' ');
      const out = [full];
      // A shortened alias is allowed only when the full name has 3+ words, the
      // shortened form is still distinctive, and it is not purely geographic.
      if (words.length >= 3) {
        const short = words.slice(0, 2).join(' ');
        const distinctive = words.slice(0, 2).some(w =>
          !CM_GENERIC.has(w) && !CM_GENERIC_EXTRA.includes(w) && w.length >= 4);
        if (distinctive && short !== full && !cmIsGeographyOnly(short)) out.push(short);
      }
      // A single-word name must itself be distinctive to be usable. An acronym
      // is exempt: it is handled separately as an exact uppercase token, which
      // is stricter than a lowercase substring match, not looser.
      if (words.length === 1 && (CM_GENERIC.has(words[0]) || CM_GENERIC_EXTRA.includes(words[0])
          || words[0].length < 5) && !cmAcronymTokens(rawName).length) return [];
      if (cmIsGeographyOnly(full) && !cmAcronymTokens(rawName).length) return [];
      // Some real firms are named entirely from generic CRE words (for example
      // "ACME Industrial" or "Sample Logistics Real Estate"), so dropping them
      // outright would silently
      // lose major competitors. They stay matchable on the FULL name only —
      // never on a shortened alias — and cmCompetitorWatch flags each such hit
      // for human verification rather than asserting the attribution.
      if (words.every(w => CM_GENERIC.has(w) || CM_GENERIC_EXTRA.includes(w))) return [full];
      return [...new Set(out.filter(a => !cmIsGeographyOnly(a)))];
    };

    /** Words that commonly precede a company name in a headline and are NOT part
     *  of it. Anything capitalized and outside this list sitting immediately
     *  before a matched name is treated as part of a LONGER entity name. */
    const CM_NAME_PREFIX_OK = new Set(['a','an','the','at','by','for','from','in','into','of','on','to','with',
      'and','as','via','near','owner','developer','landlord','investor','firm','buyer','seller','tenant',
      'giant','group','company','partner','client','affiliate','unit','subsidiary','venture','sponsor',
      'says','said','buys','sells','leases','acquires','adds','plans','breaks','completes','announces',
      'new','former','local','global','national','industrial','logistics','warehouse','office','retail',
      'report','exclusive','update','why','how','what','when','where','after','before','amid','over']);

    /** True when `alias` occurs in `text` as a standalone entity name — i.e. at
     *  least one occurrence is NOT the tail of a longer proper name. Guards
     *  against attributing a longer entity ("Example Green Realty", a different
     *  firm) to a watchlist entry whose shorter name is a suffix of it. */
    const cmStandaloneNameHit = (text, alias) => {
      const rx = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      let m;
      while ((m = rx.exec(text)) !== null) {
        const pm = text.slice(0, m.index).match(/([A-Za-z&.'\u2019-]+) $/);
        if (!pm) return true;                           // starts a phrase — safe
        const tok = pm[1].replace(/[.'\u2019-]/g, '');
        if (!tok) return true;
        if (!/^[A-Z]/.test(tok)) return true;           // lowercase — not a name part
        if (CM_NAME_PREFIX_OK.has(tok.toLowerCase())) return true;
        // Capitalized unexpected token directly before the name: very likely a
        // longer entity. Keep scanning for a clean standalone occurrence.
      }
      return false;
    };

    const CM_MATERIAL_EVENTS = [
      ['acquisition/disposition', /\b(acquir\w+|acquisition|dispos\w+|divest\w+)\b/i],
      ['sale/purchase', /\b(sells?|sold|sale of|purchas\w+|buys?|bought|trades? for)\b/i],
      ['equity stake/investment', /\b(takes? (?:a )?(?:minority |majority )?stake|acquires? (?:a )?stake|equity stake|invests? in|investment in)\b/i],
      // A bare "tenant" is NOT an event — "comments on tenant demand" is market
      // commentary. A leasing event requires an actual leasing ACTION.
      ['lease/tenant move', /\b(signs? (?:a |an )?(?:new |long-term )?(?:\d[\d,.]*k? (?:sf|square[- ]f\w+) )?lease|inks? (?:a |an )?(?:new )?lease|leases?|leased|leasing|renews? (?:its |a )?lease|lease renewal|relocat\w+|subleases?|expands? (?:its )?occupancy|takes? \d[\d,.]*k?\s*(?:sf|square[- ]f\w+)|tenant (?:signs?|inks?|takes?|relocat\w+|expands?))\b/i],
      // NOTE: bare nouns "developer"/"development" are deliberately NOT matched —
      // "Data Center Developer" is a description, not an event.
      ['development/groundbreaking', /\b(break(?:s|ing)? ground|groundbreaking|develops?|developing|redevelop\w*|new project|proposes?|plans? (?:a )?(?:new )?(?:warehouse|facility|campus|park))\b/i],
      ['construction completion/delivery', /\b(completes?|completed|completion|delivers?|delivered|delivery|tops? out|topping out)\b/i],
      ['land purchase', /\b(land (?:purchase|acquisition|deal|site)|acquires? \d+[\d.]* acres?|buys? \d+[\d.]* acres?)\b/i],
      ['financing/refinancing', /\b(financ\w+|refinanc\w+|\bloan\b|mortgage|credit facility|debt placement)\b/i],
      ['JV/joint venture', /\b(joint venture|\bjv\b|partners? with|partnership with)\b/i],
      ['fund/capital raise', /\b(fund (?:close[sd]?|raises?|launch\w*)|raises? \$[\d.]+|closes? (?:on )?\$[\d.]+|capital raise)\b/i],
      ['expansion', /\b(expands?|expansion|grows? (?:its )?(?:portfolio|footprint)|adds? to (?:its )?portfolio)\b/i],
      ['zoning/entitlement/site-plan', /\b(zoning|rezon\w+|entitlement\w*|site plan|planning board|variance|approval|approved)\b/i],
      // Naming a facility type is NOT an event. An action verb must appear near
      // the facility noun, so "discusses the data center market" is rejected
      // while "breaks ground on a data center campus" is accepted.
      ['data-center/industrial announcement', /(?:\b(?:announc\w+|unveils?|plans?|planned|develops?|developing|break(?:s|ing)? ground|opens?|opening|expands?|invests?|acquires?|launch\w+|receives? approval|wins approval|delivers?|completes?)\b[^.!?]{0,80}\b(?:data ?cent\w+|distribution cent\w+|logistics (?:facility|campus|cent\w+)|manufacturing (?:plant|facility)|fulfillment cent\w+)\b|\b(?:data ?cent\w+|distribution cent\w+|logistics (?:facility|campus|cent\w+)|manufacturing (?:plant|facility)|fulfillment cent\w+)\b[^.!?]{0,80}\b(?:announc\w+|unveils?|plans?|develops?|developing|break(?:s|ing)? ground|opens?|opening|expands?|invests?|acquires?|launch\w+|receives? approval|wins approval)\b)/i],
    ];
    // Explicitly non-material — never surfaced even with a company match.
    const CM_NON_MATERIAL = /\b(conference|summit\b|panel|keynote|speaks? at|appearance|awards?\b|honou?ree|ranking|named to|best places to work|webinar|podcast|interview|op-?ed|commentary|sponsors?\b|exclusive (?:agent|broker)|brokerage assignment|tapped to market|hires? \w+ as broker)\b/i;

    const cmMaterialEvent = (text) => {
      if (CM_NON_MATERIAL.test(text)) return null;
      for (const [label, rx] of CM_MATERIAL_EVENTS) if (rx.test(text)) return label;
      return null;
    };

    /** Build the Competitor Watch section. ADDITIVE ONLY — it never promotes an
     *  article into Sales/Leases/Availabilities/Construction and never bypasses
     *  the calibrated market/threshold rules.
     *
     *  Attribution runs in two passes. Pass 1 evaluates EVERY article copy on
     *  its own evidence. Pass 2 groups syndicated copies of the same story and
     *  keeps the STRONGEST attribution, so a weaker copy encountered first can
     *  never suppress a later copy that names the company more precisely. */
    const cmCompetitorWatch = (articles, watchlist) => {
      const diag = { companiesLoaded: 0, withDomains: 0, mentionsFound: 0, accepted: 0,
                     rejectedNoMaterialEvent: 0, rejectedGenericName: 0,
                     ambiguousNameMatches: 0, rejectedLongerEntity: 0,
                     duplicatesCollapsed: 0, familyNarrowed: 0, familyAmbiguous: 0,
                     companiesMatched: 0 };
      if (!watchlist || !watchlist.length) return { items: [], diag };
      const companies = [];
      for (const r of watchlist) {
        const name = r['Company Name'] || '';
        if (!name) continue;
        diag.companiesLoaded++;
        const domain = (r['Website Domain'] || '').toLowerCase().replace(/^www\./, '').trim();
        if (domain) diag.withDomains++;
        const aliases = cmCompanyAliases(name);
        const acronyms = cmAcronymTokens(name);
        // A short acronym name is unusable as a lowercase
        // substring but perfectly safe as an exact uppercase token, and 9 of
        // most such companies also carry a domain. Keep them.
        if (!aliases.length && !acronyms.length && !domain) {
          diag.rejectedGenericName++; continue;
        }
        // All-generic wording means a name match alone may be coincidental prose.
        const ambiguous = cmNormalizeCompany(name).split(' ')
          .every(w => CM_GENERIC.has(w) || CM_GENERIC_EXTRA.includes(w));
        const norm = cmNormalizeCompany(name);
        companies.push({ name, type: r['Secondary Type'] || '', city: r['City'] || '',
                         state: r['State / Country'] || '', domain, aliases, ambiguous,
                         norm, family: norm.split(' ')[0] || '',
                         acronyms: cmAcronymTokens(name) });
      }
      // Generic name-family index: any brand token shared by 2+ watchlist
      // entries sharing one brand (Corporation / Asset Management / Property Group).
      // Nothing here is company-specific.
      const familyIndex = new Map();
      for (const c of companies) {
        if (!c.family) continue;
        if (!familyIndex.has(c.family)) familyIndex.set(c.family, []);
        familyIndex.get(c.family).push(c);
      }

      // ---- Pass 1: evaluate every copy independently -------------------------
      const attributions = [];
      for (const a of articles || []) {
        const text = cmText(a);
        const lower = text.toLowerCase();
        const url = (a.link || '').toLowerCase();
        const cands = [];
        for (const c of companies) {
          const aliasHit = c.aliases.find(al => cmStandaloneNameHit(text, al));
          // A name that only appears as the tail of a longer entity is a wrong
          // attribution: a longer REIT name is not the shorter firm inside it.
          const aliasNearMiss = !aliasHit && c.aliases.some(al => new RegExp(`\\b${al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower));
          if (aliasNearMiss) diag.rejectedLongerEntity++;
          const domainHit = c.domain && (url.includes(c.domain) || lower.includes(c.domain));
          // Exact uppercase acronym token in the ORIGINAL text (case-sensitive).
          const acronymHit = !aliasHit && (c.acronyms || []).find(t =>
            new RegExp('(^|[^A-Za-z0-9])' + t + '([^A-Za-z0-9]|$)').test(text));
          if (!aliasHit && !domainHit && !acronymHit) continue;
          cands.push({ c, aliasHit: aliasHit || acronymHit, domainHit, acronymHit: !!acronymHit });
        }
        // A bare family brand shared by 2+ watchlist entries is matchable even
        // when no single entry reduces to that token. Requires a distinctive,
        // non-generic brand word, checked with the longer-entity guard.
        for (const [key, members] of familyIndex) {
          if (members.length < 2 || key.length < 5) continue;
          // A generic or geographic brand token must never become a family
          // brand: "Commercial" matched Commercial Observer, a publisher.
          if (CM_GENERIC.has(key) || CM_GENERIC_EXTRA.includes(key)) continue;
          if (cmIsGeographyOnly(key)) continue;
          if (cands.some(x => x.c.family === key)) continue;
          if (!cmStandaloneNameHit(text, key)) continue;
          cands.push({ c: members[0], aliasHit: key, domainHit: false });
        }
        if (!cands.length) continue;
        diag.mentionsFound += cands.length;
        const event = cmMaterialEvent(text);
        if (!event) { diag.rejectedNoMaterialEvent += cands.length; continue; }
        // Most specific wins: domain evidence is hard proof; otherwise the
        // longest matched name wins, since "Vertex Asset Management" in the text
        // is stronger evidence than the bare brand token "Vertex".
        // Domain evidence first; between two domain matches the longer (more
        // specific) domain wins, so a subdomain beats its parent domain
        // rather than losing on a tie-break to a longer matched name.
        cands.sort((x, y) => (Number(!!y.domainHit) - Number(!!x.domainHit))
          || (x.domainHit && y.domainHit
                ? (y.c.domain || '').length - (x.c.domain || '').length : 0)
          || ((y.aliasHit || '').length - (x.aliasHit || '').length));
        const best = cands[0];
        const { c, aliasHit, domainHit } = best;
        if (cands.length > 1) diag.familyNarrowed++;

        // Family ambiguity: the article names only a bare brand token that two
        // or more watchlist entities share, with no domain to disambiguate.
        // Do not assert one legal entity — surface the family and list them.
        const siblings = familyIndex.get(c.family) || [];
        const bareFamily = !domainHit && !!aliasHit &&
          cmNormalizeCompany(aliasHit) === c.family && siblings.length > 1;
        const familyLabel = bareFamily
          ? aliasHit.replace(/\b\w/g, ch => ch.toUpperCase()) : null;
        if (bareFamily) diag.familyAmbiguous++;

        // Attribution strength, used to pick a winner among syndicated copies:
        //   3 = website-domain evidence
        //   2 = specific multi-word company name
        //   1 = single-token but unambiguous company name
        //   0 = bare family brand, or an all-generic name
        const strength = domainHit ? 3
          : bareFamily || c.ambiguous ? 0
          : (aliasHit || '').includes(' ') ? 2 : 1;

        attributions.push({
          article: a,
          tkey: String(a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45),
          strength,
          aliasLen: (aliasHit || '').length,
          company: bareFamily ? familyLabel : c.name,
          entity: c,
          event,
          verify: bareFamily || !!(c.ambiguous && !domainHit),
          familyMatch: bareFamily,
          reason: domainHit ? `website-domain match "${c.domain}"`
            : bareFamily ? `family brand "${aliasHit}" — exact entity not stated`
            : `name match "${aliasHit}"`,
          supportedByDomain: !!domainHit,
          alsoConsidered: bareFamily
            ? siblings.map(s => s.name)
            : cands.slice(1, 4).map(x => x.c.name),
        });
      }

      // ---- Pass 2: collapse syndicated copies, keeping the strongest ---------
      const byStory = new Map();
      const loose = [];
      for (const at of attributions) {
        if (at.tkey.length < 20) { loose.push(at); continue; }
        const prev = byStory.get(at.tkey);
        if (!prev) { byStory.set(at.tkey, at); continue; }
        diag.duplicatesCollapsed++;
        // Strongest evidence wins regardless of encounter order.
        if (at.strength > prev.strength ||
           (at.strength === prev.strength && at.aliasLen > prev.aliasLen)) {
          byStory.set(at.tkey, at);
        }
      }
      const kept = [...byStory.values(), ...loose];
      const matchedNames = new Set();
      const items = kept.map(at => {
        matchedNames.add(at.company);
        if (at.verify && !at.familyMatch) diag.ambiguousNameMatches++;
        diag.accepted++;
        return { ...at.article, _cw: { company: at.company,
          // On an unresolved family match the specific entity's type would be
          // an unsupported claim, so it is withheld.
          type: at.familyMatch ? '' : at.entity.type,
          event: at.event, verify: at.verify, familyMatch: at.familyMatch,
          reason: at.reason, supportedByDomain: at.supportedByDomain,
          alsoConsidered: at.alsoConsidered } };
      });
      diag.companiesMatched = matchedNames.size;
      return { items, diag };
    };

    const buildCapitalMarketsNewsletterHTML = (articles, opts) => {
      const o = opts || {};
      const lookbackHours = o.lookbackHours || 24;
      const renderMode = o.renderMode === 'delivery' ? 'delivery' : 'preview';
      const delivery = renderMode === 'delivery';
      const maxItems = Math.max(1, Math.min(10, Number(o.maxItemsPerSection) || 6));
      const selectionAsOf = o.asOfTime || o.asOfDate;
      const { buckets, telemetry, tiers, rejected, inWindow, deduped, asOf } = cmBuildSections(articles, selectionAsOf, lookbackHours);
      // Competitor Watch is ADDITIVE: it runs over the same in-window articles
      // but cannot promote anything into Sales/Leases/Availabilities/Construction.
      const cw = cmCompetitorWatch(inWindow, o.watchlist);
      // (Week in Review is no longer Friday-gated; it runs every day from its
      //  own independent seven-day window.)
      const labelDate = o.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(String(o.asOfDate))
        ? new Date(o.asOfDate + 'T12:00:00') : asOf;
      const dateStr = labelDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const articleUrl = it => safeUrl(it.link || it.url || '#');
      const deliveryWhy = (kind, it) => {
        const c = it._cm || {}, bits = [];
        const labels = { sales: 'Sale', leases: 'Lease', availabilities: 'Availability',
          construction: 'Construction milestone', intel: 'Market intelligence',
          municipal: 'Municipal / entitlement' };
        bits.push(labels[kind] || kind);
        if (c.tier && c.tier !== 'UNMAPPED') bits.push(c.tier === 'TARGET' ? 'Target market' : c.tier === 'BROADER' ? 'Broader market' : 'National');
        if (kind === 'sales' && c.magnitude) bits.push('$' + (c.magnitude / 1e6).toFixed(1) + 'M');
        else if (c.magnitude) bits.push(Number(c.magnitude).toLocaleString() + ' SF');
        return bits.join(' · ');
      };
      const row = (it, kind) => {
        if (!delivery) return `<li style="margin-bottom:10px;line-height:1.45;">
          <a href="${esc(articleUrl(it))}" style="color:#0B223F;font-weight:600;text-decoration:none;">${esc(it.title)}</a>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${esc(it._cm.tier)} · ${esc(it._cm.reason)}</div>
        </li>`;
        const rawDesc = String(it.description || it.summary || '').trim();
        const desc = rawDesc && typeof firstSentences === 'function' ? firstSentences(rawDesc, 1) : rawDesc;
        const publisher = typeof getPublisherName === 'function' ? getPublisherName(it) : (it.source || 'Source');
        const titleWords = new Set(String(it.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/));
        const descWords = String(desc || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
        const overlap = descWords.length ? descWords.filter(w => titleWords.has(w)).length / descWords.length : 1;
        const usefulDesc = desc && desc.length > 20 && overlap < 0.75 ? String(desc).slice(0, 260) : '';
        return `<li style="margin-bottom:14px;line-height:1.45;color:#334155;">
          <a href="${esc(articleUrl(it))}" style="color:#0B223F;font-weight:700;text-decoration:none;">${esc(it.title || 'Untitled')}</a>
          <div style="font-size:12px;color:#475569;margin-top:3px;"><strong>${esc(deliveryWhy(kind, it))}</strong>${publisher ? ` · ${esc(publisher)}` : ''}</div>
          ${usefulDesc ? `<div style="font-size:12px;color:#475569;margin-top:3px;">${esc(usefulDesc)}</div>` : ''}
          <div style="font-size:11px;margin-top:3px;"><a href="${esc(articleUrl(it))}" style="color:#2563eb;">Source</a></div>
        </li>`;
      };
      const section = (title, items, note, kind) => {
        const shown = items.slice(0, maxItems);
        const overflow = items.length > shown.length
          ? `<p style="font-size:10px;color:#94a3b8;margin:5px 0 0;">Showing ${shown.length} of ${items.length} qualifying items.</p>` : '';
        return `
        <h2 style="font-size:15px;color:#0B223F;border-bottom:2px solid #0B223F;padding-bottom:4px;margin:22px 0 10px;">${esc(title)}</h2>
        ${note ? `<p style="font-size:11px;color:#64748b;margin:0 0 8px;">${note}</p>` : ''}
        ${shown.length
          ? `<ul style="padding-left:18px;margin:0;">${shown.map(it => row(it, kind)).join('')}</ul>${overflow}`
          : '<p style="font-size:12px;color:#64748b;margin:0;">No qualifying items in this window.</p>'}`;
      };
      // ---- Empty-state diagnostics ---------------------------------------
      // An empty preview is usually CORRECT - at a 24-hour lookback the feed
      // genuinely carries nothing that clears Jacob's thresholds. Without this
      // panel a correct empty result is indistinguishable from a broken one, so
      // say what was reviewed, why each candidate was rejected, and what to try.
      const REJECT_LABEL = {
        MISSING_PRICE: 'no defensible price stated',
        MISSING_SF: 'no defensible square footage stated',
        BELOW_THRESHOLD: 'below the size/price threshold for its market',
        UNMAPPED_GEO: 'location could not be resolved to a covered market',
        LOW_VALUE_INTEL: 'low-value item (award, ranking, conference, listing assignment)',
        NO_SIGNAL: 'no deal, lease, construction, municipal or material-intelligence signal',
        NOT_INDUSTRIAL: 'not an industrial property story',
        NATIONAL_CONSTRUCTION: 'national construction - no national construction rule defined',
        PROPERTY_SPECIFIC: 'property-specific item that did not clear a deal section',
      };
      const selectedCount = Object.values(buckets).reduce((a, b) => a + b.length, 0)
        + (cw.items ? cw.items.length : 0);
      const byReason = {};
      for (const a of rejected) {
        const code = (a._cm && a._cm.code) || 'NO_SIGNAL';
        (byReason[code] = byReason[code] || []).push(a);
      }
      const reasonRows = Object.entries(byReason)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([code, list]) => `<li style="margin-bottom:2px;"><strong>${list.length}</strong> &mdash; ${esc(REJECT_LABEL[code] || code)} <span style="color:#94a3b8;">(${esc(code)})</span></li>`)
        .join('');
      // Collapsible so a long list never buries the newsletter itself.
      const rejectedList = rejected.slice(0, 60).map(a => {
        const c = a._cm || {};
        return `<li style="margin-bottom:6px;line-height:1.35;">
          ${esc(String(a.title || 'Untitled').slice(0, 130))}
          <div style="color:#94a3b8;">${esc(c.code || 'NO_SIGNAL')}: ${esc(String(c.reason || '').slice(0, 190))}</div>
        </li>`;
      }).join('');
      const widenHint = lookbackHours <= 24
        ? 'Nothing cleared the thresholds in the last 24 hours. Try <strong>7 days</strong> or <strong>30 days</strong> &mdash; the daily feed often carries no qualifying transaction.'
        : lookbackHours <= 168
          ? 'Try <strong>30 days</strong> for a fuller picture.'
          : 'This is already a wide window; the market itself was quiet, or the thresholds are filtering everything.';
      const watchlistHealth = !o.watchlist || !o.watchlist.length
        ? 'No competitor watchlist loaded (browser-only; re-upload after a refresh).'
        : `${cw.diag.companiesLoaded} companies loaded &middot; ${cw.diag.withDomains} with website domains &middot; `
          + `${cw.diag.rejectedGenericName} excluded for unusable matching data &middot; `
          + `${cw.diag.companiesMatched} matched &middot; ${cw.diag.accepted} material articles`
          + `<br/><span style="color:#94a3b8;">Official company sites are not yet monitored &mdash; matching runs over feed articles only.</span>`;

      const feedHealth = o.feedHealth || null;
      const staleInput = feedHealth && feedHealth.status !== 'FRESH';
      const feedAge = feedHealth && feedHealth.ageHours != null
        ? `${esc(feedHealth.ageHours)} hours old` : 'of unknown age';
      const freshnessWarning = delivery || !staleInput ? '' : `
        <div style="margin:0 0 18px;padding:12px 14px;background:#fee2e2;border:2px solid #dc2626;border-radius:6px;font-size:12px;color:#7f1d1d;">
          <strong>STALE INPUT &mdash; do not approve or send this edition.</strong>
          <div style="margin-top:5px;">Feed status: ${esc(feedHealth.status)} &middot; newest refresh is ${feedAge}
          &middot; maximum allowed age is ${esc(feedHealth.maxAgeHours)} hours. Refresh the feed and rerun.</div>
        </div>`;

      const emptyState = delivery || selectedCount > 0 ? '' : `
        <div style="margin:0 0 18px;padding:12px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;font-size:12px;color:#78350f;">
          <strong style="font-size:13px;">${staleInput
            ? 'No items selected from a stale input feed &mdash; do not treat this as a quiet market.'
            : 'No items cleared the thresholds &mdash; this preview ran correctly.'}</strong>
          <div style="margin-top:8px;">
            Reviewed <strong>${inWindow.length}</strong> article${inWindow.length === 1 ? '' : 's'}
            in the last ${lookbackHours >= 24 ? Math.round(lookbackHours / 24) + ' day' + (Math.round(lookbackHours / 24) === 1 ? '' : 's') : lookbackHours + ' hours'}
            &middot; selected <strong>0</strong> &middot; rejected <strong>${rejected.length}</strong>.
          </div>
          ${reasonRows ? `<div style="margin-top:8px;">Why candidates were rejected:</div>
            <ul style="margin:4px 0 0;padding-left:18px;">${reasonRows}</ul>` : ''}
          <div style="margin-top:8px;">${staleInput ? 'Refresh the feed before changing the lookback or thresholds.' : widenHint}</div>
          ${rejectedList ? `<details style="margin-top:10px;">
            <summary style="cursor:pointer;font-weight:600;">Show the ${Math.min(rejected.length, 60)} rejected candidate${rejected.length === 1 ? '' : 's'} and exact reasons</summary>
            <ul style="margin:8px 0 0;padding-left:18px;">${rejectedList}</ul>
          </details>` : ''}
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid #fde68a;">
            <strong>Watchlist:</strong> ${watchlistHealth}
          </div>
        </div>`;

      const diag = `<div style="margin-top:24px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#475569;">
        <strong>Diagnostics</strong> — tiers: TARGET ${tiers.TARGET} · BROADER ${tiers.BROADER} · NATIONAL ${tiers.NATIONAL} · <strong>UNMAPPED ${tiers.UNMAPPED}</strong><br/>
        rejections: MISSING_PRICE ${telemetry.MISSING_PRICE} · MISSING_SF ${telemetry.MISSING_SF} · BELOW_THRESHOLD ${telemetry.BELOW_THRESHOLD} · UNMAPPED_GEO ${telemetry.UNMAPPED_GEO} · LOW_VALUE_INTEL ${telemetry.LOW_VALUE_INTEL} · NO_SIGNAL ${telemetry.NO_SIGNAL} (total rejected ${rejected.length})<br/>
        same-edition duplicates removed: ${Object.values(deduped || {}).reduce((n, v) => n + Number(v || 0), 0)}<br/>
        UNMAPPED candidates are held for review — never admitted under a guessed threshold.<br/>
        geography reference: ${cmGeo.status === 'ready'
          ? `loaded — NJ Exit 6 lat ${cmGeo.geography.states.NJ.exit6Latitude}, PA ${cmGeo.geography.states.PA.targetCounties.length} target/${cmGeo.geography.states.PA.broaderCounties.length} broader, FL ${cmGeo.geography.states.FL.targetCounties.length} target/${cmGeo.geography.states.FL.broaderCounties.length} broader, NY ${cmGeo.geography.states.NY.broaderCounties.length} broader`
          : `NOT LOADED (${esc(cmGeo.status)}${cmGeo.error ? ': ' + esc(cmGeo.error) : ''}) — every article resolves UNMAPPED`}
      </div>`;
      const banner = delivery ? '' : `<div style="background:#fef3c7;border:2px solid #f59e0b;color:#92400e;padding:10px;border-radius:6px;font-weight:700;text-align:center;margin-bottom:16px;">
        PREVIEW ONLY — NOT PRODUCTION</div>`;
      // Institutional Competitor Watch — requires BOTH a watchlist company match
      // AND a material industrial/CRE event. Never affects other sections.
      const cwRow = (it) => delivery
        ? `<li style="margin-bottom:14px;line-height:1.45;color:#334155;">
            <a href="${esc(articleUrl(it))}" style="color:#0B223F;font-weight:700;text-decoration:none;">${esc(it.title)}</a>
            <div style="font-size:12px;color:#475569;margin-top:3px;"><strong>${esc(it._cw.company)}</strong>${it._cw.type ? ` · ${esc(it._cw.type)}` : ''} · ${esc(it._cw.event)}${it._cw.verify ? ' · VERIFY ATTRIBUTION' : ''}</div>
            <div style="font-size:11px;margin-top:3px;"><a href="${esc(articleUrl(it))}" style="color:#2563eb;">Source</a></div>
          </li>`
        : `<li style="margin-bottom:10px;line-height:1.45;">
            <a href="${esc(articleUrl(it))}" style="color:#0B223F;font-weight:600;text-decoration:none;">${esc(it.title)}</a>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">
              <strong>${esc(it._cw.company)}</strong>${it._cw.type ? ` · ${esc(it._cw.type)}` : ''} · event: ${esc(it._cw.event)} · ${esc(it._cw.reason)}${it._cw.supportedByDomain ? ' (domain-supported)' : ''}${it._cw.familyMatch ? ' · <strong style="color:#b45309;">family match — verify</strong>' : it._cw.verify ? ' · <strong style="color:#b45309;">generic name — verify</strong>' : ''}${it._cw.alsoConsidered && it._cw.alsoConsidered.length ? `<br/>possible entities: ${esc(it._cw.alsoConsidered.join(', '))}` : ''} · source: ${esc(it.source || 'n/a')}
            </div>
          </li>`;
      const cwDiag = `<div style="font-size:11px;color:#64748b;margin:6px 0 8px;">
        ${cw.diag.companiesLoaded} companies loaded · ${cw.diag.withDomains} with website domains ·
        ${cw.diag.companiesMatched} companies matched · ${cw.diag.accepted} material articles<br/>
        mentions found ${cw.diag.mentionsFound} · accepted ${cw.diag.accepted} ·
        rejected (no material event) ${cw.diag.rejectedNoMaterialEvent} ·
        rejected (ambiguous/generic name) ${cw.diag.rejectedGenericName} ·
        flagged for verification ${cw.diag.ambiguousNameMatches} ·
        rejected (name belongs to a longer entity) ${cw.diag.rejectedLongerEntity} ·
        syndicated duplicates collapsed ${cw.diag.duplicatesCollapsed} ·
        narrowed to most-specific entity ${cw.diag.familyNarrowed} ·
        family-ambiguous (verify) ${cw.diag.familyAmbiguous}
      </div>`;
      const cwShown = (cw.items || []).slice(0, maxItems);
      const cwOverflow = cw.items && cw.items.length > cwShown.length
        ? `<p style="font-size:10px;color:#94a3b8;margin:5px 0 0;">Showing ${cwShown.length} of ${cw.items.length} qualifying items.</p>` : '';
      const cwSection = delivery && (!o.watchlist || !o.watchlist.length)
        ? ''
        : !o.watchlist || !o.watchlist.length
        ? `<h2 style="font-size:15px;color:#0B223F;border-bottom:2px solid #0B223F;padding-bottom:4px;margin:22px 0 10px;">Institutional Competitor Watch</h2>
           <p style="font-size:12px;color:#64748b;margin:0;">No competitor watchlist loaded.</p>`
        : `<h2 style="font-size:15px;color:#0B223F;border-bottom:2px solid #0B223F;padding-bottom:4px;margin:22px 0 10px;">Institutional Competitor Watch</h2>
           ${delivery ? '' : cwDiag}
           ${cwShown.length ? `<ul style="padding-left:18px;margin:0;">${cwShown.map(cwRow).join('')}</ul>${cwOverflow}`
             : '<p style="font-size:12px;color:#64748b;margin:0;">No material competitor activity in this window.</p>'}`;
      // ---- Week in Review -------------------------------------------------
      // Computed from an INDEPENDENT seven-day window, whatever lookback the
      // daily preview is showing, so the weekly roundup does not silently
      // shrink to 24 hours or balloon to 30 days. Previously it also only ran
      // on Fridays and concatenated whole sections in a fixed sales-first
      // order, which is not a ranking.
      // VISIBILITY: the section renders every day in the PREVIEW so it can be
      // exercised and reviewed on any weekday. That is a preview decision, not
      // a delivery decision. If Week in Review ever enters production delivery,
      // restore the original Friday-only rule at the delivery layer - the
      // seven-day computation below stays as it is either way.
      const includeWeekInReview = delivery ? !!o.includeWeekInReview : o.includeWeekInReview !== false;
      const WIR_HOURS = 168;
      const wirSections = cmBuildSections(articles, selectionAsOf, WIR_HOURS);
      const wirWatch = cmCompetitorWatch(wirSections.inWindow, o.watchlist);
      // Section weights express editorial priority; magnitude and market tier
      // then separate items WITHIN that priority. A large TARGET lease can
      // therefore outrank a small BROADER sale.
      const WIR_WEIGHT = { sales: 100, leases: 90, construction: 85,
                           competitor: 80, availabilities: 70, municipal: 65,
                           intel: 55 };
      const WIR_TIER_BONUS = { TARGET: 30, BROADER: 12, NATIONAL: 0, UNMAPPED: 0 };
      const wirScore = (kind, item) => {
        const c = item._cm || {};
        const mag = Number(c.magnitude) || 0;
        // log scale so $195M does not swamp 124,000 SF - they are different
        // units and only their relative size within a section matters.
        const magScore = mag > 0 ? Math.min(25, Math.log10(mag) * 4) : 0;
        return (WIR_WEIGHT[kind] || 50) + (WIR_TIER_BONUS[c.tier] || 0) + magScore;
      };
      const wirLabel = { sales: 'Sale', leases: 'Lease', availabilities: 'Availability',
                         construction: 'Construction', municipal: 'Municipal / entitlement',
                         intel: 'Market intelligence', competitor: 'Competitor' };
      const wirWhy = (kind, item) => {
        const c = item._cm || {};
        const bits = [wirLabel[kind] || kind];
        if (c.tier && c.tier !== 'UNMAPPED') bits.push(c.tier + ' market');
        if (kind === 'sales' && c.magnitude) bits.push('$' + (c.magnitude / 1e6).toFixed(1) + 'M');
        else if (c.magnitude) bits.push(Number(c.magnitude).toLocaleString() + ' SF');
        if (kind === 'competitor' && item._cw) bits.push('watchlist company: ' + item._cw.company);
        return bits.join(' · ');
      };
      const wirCandidates = [];
      // Municipal / Entitlement Watch is included: the heading promises a
      // ranking across every section, and entitlement actions are material.
      for (const kind of ['sales', 'leases', 'availabilities', 'construction',
                          'municipal', 'intel']) {
        for (const it of (wirSections.buckets[kind] || [])) {
          wirCandidates.push({ kind, item: it, score: wirScore(kind, it) });
        }
      }
      for (const it of (wirWatch.items || [])) {
        wirCandidates.push({ kind: 'competitor', item: it, score: wirScore('competitor', it) });
      }
      // Deduplicate syndicated copies of the same story before ranking, keeping
      // the highest-scoring copy.
      const wirSeen = new Map();
      for (const cand of wirCandidates.sort((a, b) => b.score - a.score)) {
        const key = String(cand.item.title || '').toLowerCase()
          .replace(/[^a-z0-9]/g, '').slice(0, 45);
        if (key.length >= 20 && wirSeen.has(key)) continue;
        if (key.length >= 20) wirSeen.set(key, cand);
        else wirSeen.set(key + '|' + wirSeen.size, cand);
      }
      const wirTop = [...wirSeen.values()].slice(0, 5);
      const wirRow = (cand) => `<li style="margin-bottom:10px;line-height:1.45;">
          <a href="${esc(safeUrl(cand.item.link || '#'))}" style="color:#0B223F;font-weight:600;text-decoration:none;">${esc(cand.item.title || 'Untitled')}</a>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">Why it matters: ${esc(wirWhy(cand.kind, cand.item))}</div>
        </li>`;
      const friday = !includeWeekInReview ? '' : `
        <h2 style="font-size:15px;color:#0B223F;border-bottom:2px solid #0B223F;padding-bottom:4px;margin:22px 0 10px;">Week in Review — Top 5 Developments</h2>
        <p style="font-size:11px;color:#64748b;margin:0 0 8px;">Independent 7-day window (${wirSections.inWindow.length} articles reviewed), ranked across every section — not the daily lookback.</p>
        ${wirTop.length
          ? `<ul style="padding-left:18px;margin:0;">${wirTop.map(wirRow).join('')}</ul>`
          : '<p style="font-size:12px;color:#64748b;margin:0;">Nothing cleared the thresholds in the last seven days.</p>'}`;
      const sectionsHtml = `
        ${section('Sales Transactions', buckets.sales, '', 'sales')}
        ${section('Lease Transactions', buckets.leases, '', 'leases')}
        ${section('Availabilities', buckets.availabilities, '', 'availabilities')}
        ${section('Construction Updates', buckets.construction, '', 'construction')}
        ${section('Relevant Market Intelligence', buckets.intel, '', 'intel')}
        ${section('Municipal / Entitlement Watch', buckets.municipal, delivery ? '' : 'NEWS-DERIVED — sourced from news articles, not from direct municipal records.', 'municipal')}
        ${cwSection}
        ${friday}`;
      if (!delivery) return `<div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#fff;color:#1e293b;">
        ${banner}
        ${freshnessWarning}
        ${emptyState}
        <h1 style="font-size:20px;color:#0B223F;margin:0 0 2px;">Woodmont Capital Markets Preview</h1>
        <div style="font-size:12px;color:#64748b;margin-bottom:6px;">${esc(dateStr)} · lookback ${lookbackHours}h · sandbox</div>
        ${sectionsHtml}
        ${diag}
      </div>`;

      const newsletterTitle = String(o.newsletterTitle || 'Capital Markets & Industrial Intelligence Briefing');
      const testBanner = o.testBanner ? `<div style="background:#7f1d1d;color:#fff;padding:11px;text-align:center;font-weight:800;letter-spacing:.4px;">
        TEST ONLY — DO NOT FORWARD</div>` : '';
      return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
        <title>${esc(newsletterTitle)}</title></head>
        <body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b;">
          <div style="max-width:800px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;">
            ${testBanner}
            <div style="padding:24px 28px 14px;text-align:center;border-bottom:3px solid #0B223F;">
              <img src="https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/assets/woodmont-logo.jpg" alt="Woodmont Industrial Partners" width="220" style="max-width:220px;height:auto;border:0;">
              <h1 style="font-size:22px;color:#0B223F;margin:14px 0 4px;">${esc(newsletterTitle)}</h1>
              <div style="font-size:12px;color:#64748b;">${esc(dateStr)} · ${lookbackHours}-hour qualifying window</div>
            </div>
            <div style="padding:6px 28px 26px;">${sectionsHtml}</div>
            <div style="padding:16px 28px;text-align:center;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
              <strong>Woodmont Industrial Partners</strong><br>Confidential &amp; Proprietary
            </div>
          </div>
        </body></html>`;
    };


    return {
      // public API used by the page
      buildCapitalMarketsNewsletterHTML, cmBuildSections, cmLoadGeography, cmParseCSV,
      // exposed for tests
      cmClassify, cmCompetitorWatch, cmCompanyAliases, cmAcronymTokens,
      cmIsGeographyOnly, cmMaterialEvent, cmText, cmDollars, cmSquareFeet,
      CM_THRESHOLDS, CM_RX, CM_REJECT,
      get cmGeo() { return cmGeo; },
    };
  }

  global.createCapitalMarkets = createCapitalMarkets;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createCapitalMarkets };
})(typeof globalThis !== 'undefined' ? globalThis : this);
