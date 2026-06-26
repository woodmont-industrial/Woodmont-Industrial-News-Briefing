/**
 * Canonical region/keyword data shared across newsletter filters and static build.
 * Single source of truth — update here, changes propagate everywhere.
 */

// Target regions for strict filtering (NJ, PA, FL)
export const TARGET_REGIONS = [
    ', NJ', ' NJ ', 'NJ ', 'NEW JERSEY', 'PENNSYLVANIA', ', PA ', ' PA ',
    ', FL', ' FL ', 'FLORIDA',
    'PHILADELPHIA', 'NEWARK', 'JERSEY CITY', 'TRENTON', 'CAMDEN',
    'MIAMI', 'ORLANDO', 'TAMPA', 'JACKSONVILLE', 'FORT LAUDERDALE',
    'LEHIGH VALLEY', 'ALLENTOWN', 'BETHLEHEM',
    // NJ Cities
    'EDISON', 'ELIZABETH', 'PATERSON', 'WOODBRIDGE', 'TOMS RIVER', 'CLIFTON', 'PASSAIC',
    'BAYONNE', 'HOBOKEN', 'UNION CITY', 'NEW BRUNSWICK', 'PERTH AMBOY', 'HACKENSACK',
    'SAYREVILLE', 'VINELAND', 'LINDEN', 'SECAUCUS', 'KEARNY', 'CARTERET',
    'SOUTH BRUNSWICK', 'EAST BRUNSWICK', 'PISCATAWAY',
    // NJ Regions & Counties
    'CENTRAL JERSEY', 'NORTH JERSEY', 'SOUTH JERSEY', 'RARITAN', 'MONROE', 'MIDDLESEX',
    'BERGEN', 'ESSEX', 'HUDSON', 'UNION', 'MORRIS', 'SOMERSET', 'MERCER',
    'MONMOUTH', 'OCEAN', 'BURLINGTON', 'GLOUCESTER', 'ATLANTIC', 'CUMBERLAND',
    'MEADOWLANDS', 'EXIT 8A', 'I-95 CORRIDOR', 'TURNPIKE', 'GARDEN STATE PARKWAY',
    // PA Cities
    'PITTSBURGH', 'HARRISBURG', 'SCRANTON', 'READING', 'LANCASTER', 'ERIE',
    'WILKES-BARRE', 'CHESTER', 'NORRISTOWN', 'KING OF PRUSSIA', 'PLYMOUTH MEETING',
    'CONSHOHOCKEN', 'BLUE BELL', 'EXTON', 'MALVERN', 'WAYNE',
    // PA Regions & Counties
    'DELAWARE VALLEY', 'BUCKS COUNTY', 'CHESTER COUNTY', 'MONTGOMERY COUNTY',
    'DELAWARE COUNTY', 'BERKS COUNTY', 'LANCASTER COUNTY', 'YORK COUNTY', 'DAUPHIN COUNTY',
    'GREATER PHILADELPHIA', 'PHILLY', 'PENNSYLVANIA TURNPIKE',
    // FL Cities
    'WEST PALM', 'BOCA RATON', 'ST. PETERSBURG', 'HIALEAH', 'TALLAHASSEE',
    'PORT ST. LUCIE', 'CAPE CORAL', 'PEMBROKE PINES', 'HOLLYWOOD', 'MIRAMAR',
    'GAINESVILLE', 'CORAL SPRINGS', 'CLEARWATER', 'PALM BAY', 'POMPANO BEACH',
    'DORAL', 'CORAL GABLES', 'SUNRISE', 'PLANTATION', 'DAVIE', 'WESTON',
    // FL Regions & Counties
    'SOUTH FLORIDA', 'CENTRAL FLORIDA', 'BROWARD', 'MIAMI-DADE', 'PALM BEACH',
    'HILLSBOROUGH', 'ORANGE COUNTY', 'DUVAL', 'PINELLAS', 'LEE COUNTY', 'POLK COUNTY',
    'BREVARD', 'PORT EVERGLADES', 'PORT OF MIAMI', 'TRI-COUNTY',
    'ST. JOHNS COUNTY', 'MEDLEY', 'DANIA', 'OCALA', 'WINTER HAVEN',
    'POMPANO', 'HILLSBORO BEACH', 'WYNWOOD',
    // Industrial/logistics keywords that suggest regional relevance
    'PORT NEWARK', 'ELIZABETH PORT', 'SEAGIRT', 'PORTSIDE'
];

// Major CRE players — used for "relevant" category inclusion but NOT geographic matching.
// An article mentioning CBRE doesn't mean it's about NJ/PA/FL.
export const CRE_COMPANY_NAMES = [
    'PROLOGIS', 'DUKE REALTY', 'BLACKSTONE', 'CBRE', 'JLL', 'CUSHMAN', 'COLLIERS',
    'NEWMARK', 'MARCUS & MILLICHAP', 'EASTDIL', 'HFF', 'BRIDGE INDUSTRIAL', 'DERMODY',
    'FIRST INDUSTRIAL', 'STAG INDUSTRIAL', 'REXFORD', 'TERRENO', 'MONMOUTH REAL ESTATE',
];

// States/cities to EXCLUDE (everything except NJ, PA, FL)
export const MAJOR_EXCLUDE_REGIONS = [
    'HOUSTON', 'DALLAS', 'AUSTIN', 'SAN ANTONIO', 'FORT WORTH', 'TEXAS', ', TX',
    // State abbreviations for non-target states (NJ, PA, FL are target — never add those here)
    ', GA', ', AL', ', AZ', ', CA', ', IL', ', OH', ', TN', ', KY', ', IN', ', MI',
    ', NC', ', SC', ', VA', ', MD', ', CO', ', MN', ', WI', ', MO', ', OR', ', WA',
    ', NV', ', UT', ', CT', ', MA', ', LA', ', AR', ', MS', ', OK', ', KS', ', NE',
    ', IA', ', ID', ', MT', ', WY', ', ND', ', SD', ', WV', ', HI', ', AK', ', ME',
    ', NH', ', VT', ', RI', ', DC', ', DE',
    'ATLANTA', 'LOS ANGELES', 'SAN FRANCISCO', 'CHICAGO', 'BOSTON', 'SEATTLE', 'DENVER', 'PHOENIX',
    'CHARLOTTE', 'NASHVILLE', 'BALTIMORE', 'SAN DIEGO', 'PORTLAND', 'DETROIT', 'MINNEAPOLIS',
    'COLUMBUS', 'INDIANAPOLIS', 'MEMPHIS', 'RALEIGH', 'RICHMOND', 'MILWAUKEE', 'KANSAS CITY',
    'ST. LOUIS', 'CLEVELAND', 'CINCINNATI', 'LAS VEGAS', 'SALT LAKE', 'BOISE', 'SACRAMENTO',
    'OKLAHOMA CITY', 'TUCSON', 'ALBUQUERQUE', 'NEW ORLEANS', 'MESA, ARIZONA', 'ARIZONA',
    'TENNESSEE', 'KENTUCKY', 'LOUISVILLE', 'ALABAMA', 'ARKANSAS',
    // 2026-06-01: TN/KY/AL/etc. mid-size cities that LoopNet/CommercialSearch
    // surface as industrial deals without ever mentioning the state name.
    'COOKEVILLE', 'CHATTANOOGA', 'KNOXVILLE', 'CLARKSVILLE', 'MURFREESBORO',
    'JACKSON, TN', 'NASHVILLE',  // Nashville sometimes listed without "TN"
    'BOWLING GREEN', 'LEXINGTON, KY', 'OWENSBORO',
    'HUNTSVILLE', 'TUSCALOOSA', 'MONTGOMERY, AL', 'AUBURN, AL',
    'LITTLE ROCK, AR', 'FAYETTEVILLE, AR', 'FORT SMITH',
    'CALIFORNIA', 'FREMONT', 'SAN JOSE', 'SILICON VALLEY', 'BAY AREA',
    'OREGON', 'WASHINGTON STATE', 'HAWAII', 'OAHU', 'HONOLULU', 'MAUI', 'KAUAI', 'KONA', 'HILO', 'BIG ISLAND', 'IOWA', 'NEBRASKA', 'MONTANA', 'WYOMING',
    'NORTH DAKOTA', 'SOUTH DAKOTA', 'IDAHO', 'UTAH', 'MISSISSIPPI', 'WEST VIRGINIA',
    'WASHINGTON, DC', 'WASHINGTON, D.C.', 'WASHINGTON DC', 'D.C.',
    'GEORGIA', 'SOUTH CAROLINA', 'NORTH CAROLINA', 'VIRGINIA', 'MARYLAND',
    'COLORADO', 'MINNESOTA', 'WISCONSIN', 'MICHIGAN', 'OHIO', 'MISSOURI',
    'FORT PAYNE', 'DEKALB COUNTY, AL',
    'EL PASO', 'NORFOLK', 'VIRGINIA BEACH', 'ROANOKE',
    'TEMPE', 'SCOTTSDALE', 'CHANDLER', 'GLENDALE, AZ', 'GLENDALE WAREHOUSE', 'GLENDALE LOGISTICS', 'OTAY MESA',
    'DENTON', 'PLANO', 'IRVING', 'ARLINGTON, TX', 'FRISCO', 'MCKINNEY',
    'DTLA', 'DOWNTOWN LOS ANGELES', 'SOCAL', 'CHINO', 'ONTARIO, CA', 'INLAND EMPIRE',
    'LAKE FOREST', 'IRVINE', 'ANAHEIM', 'LONG BEACH', 'RIVERSIDE', 'SAN BERNARDINO',
    'OPELIKA', 'PORTSMOUTH',
    'NEW HAVEN', 'ALBANY', 'BUFFALO', 'NEW LENOX', 'JOLIET',
    'OMAHA', 'DES MOINES', 'MOBILE', 'LITTLE ROCK', 'BATON ROUGE', 'TULSA',
    'CHEYENNE', 'BEE CAVE', 'BOZEMAN', 'CHESTERFIELD COUNTY',
    'LEXINGTON', 'BIRMINGHAM', 'CHARLESTON', 'COLUMBIA, SC', 'PROVIDENCE', 'HARTFORD',
    'NEW YORK CITY', 'MANHATTAN', 'BROOKLYN', 'QUEENS', 'LONG ISLAND',
    'CONNECTICUT', 'MASSACHUSETTS', 'NEW HAMPSHIRE', 'VERMONT', 'MAINE', 'RHODE ISLAND',
    // Abbreviations and neighborhoods that slip past state-level checks
    'DFW', 'DALLAS-FORT WORTH', 'EL SEGUNDO', 'RANCHO DOMINGUEZ', 'RANCHO CUCAMONGA',
    'PERRIS', 'HESPERIA', 'CORONA', 'FONTANA', 'REDLANDS', 'RIALTO', 'MORENO VALLEY',
    'CADDO PARISH', 'SHREVEPORT', 'NILES', 'LOUISIANA', 'ASCENSION PARISH',
    'GRAND PRAIRIE', 'ELGIN',
    'TEMPLE, TX', 'TEMPLE BATTERY', 'COSTA MESA', 'PINELLAS PARK',
    'SOHO', 'MIDTOWN', 'TRIBECA', 'CHELSEA', 'FLATIRON',
    'HERMISTON', 'SEVIERVILLE', 'DONEGAL',
    'WEST VILLAGE', 'EAST VILLAGE', 'GREENWICH VILLAGE', 'DUMBO', 'WILLIAMSBURG',
    'HARLEM', 'NOHO', 'NOLITA', 'RED HOOK', 'LOWER EAST SIDE',
    'BRONX', 'STATEN ISLAND',
    'SUFFERN', 'WESTCHESTER', 'WESTCHESTER COUNTY', 'ROCKLAND COUNTY',
    'PORT WASHINGTON', 'BROOKSHIRE', 'EAST BAY',
    'WEST 37TH STREET', 'WEST 37TH ST',
    // Bare WA (no comma) — slipped past ', WA' on 2026-04-24 ('Brokers WA Industrial')
    ' WA ',
    // City/source names from prior region leaks (TN, AL, IL)
    'MILAN, TN', 'MILAN ACQUIRES', 'WBBJ',
    'BIBB COUNTY', 'CAHABA', 'MANTHEI WOOD', 'CAHABA VENEER',
    'ORLAND PARK'
];

// International terms — ALWAYS exclude
export const INTERNATIONAL_EXCLUDE = [
    'EUROPE', 'EUROPEAN', 'UK ', 'U.K.', 'UNITED KINGDOM', 'BRITAIN',
    'WIGAN', 'ASDA', 'JD.COM', 'FAGIOLI', 'ITALIAN',
    'ASIA', 'ASIAN', 'PACIFIC', 'APAC', 'CHINA', 'JAPAN', 'INDIA', 'SINGAPORE', 'HONG KONG',
    'AUSTRALIA', 'CANADA', 'CANADIAN', 'MONTREAL', 'VANCOUVER', 'BRITISH COLUMBIA', 'BURNABY',
    'LATIN AMERICA', 'MIDDLE EAST',
    'AFRICA', 'GLOBAL OUTLOOK', 'GLOBAL MARKET', 'WORLD MARKET', 'GERMANY', 'FRANCE', 'KOREA',
    'VIETNAM', 'BRAZIL', 'MEXICO', 'LONDON', 'TOKYO', 'SHANGHAI', 'BEIJING', 'SYDNEY',
    'TORONTO', 'DUBAI', 'OTTAWA', 'CALGARY', 'EDMONTON', 'EMEA',
    'TAIWAN', 'INDONESIA', 'MALAYSIA', 'THAILAND', 'PHILIPPINES', 'SAUDI ARABIA',
    'PUERTO RICO', 'GUAM', 'U.S. VIRGIN ISLANDS',
    // Australian cities/states that leak via LoopNet international listings
    'MELBOURNE, VIC', 'SYDNEY, NSW', 'BRISBANE, QLD', 'PERTH, WA',
    'BROADMEADOWS', 'DRYSDALE', 'BYRON BAY', 'STAWELL', 'SOUTH NOWRA', 'COWES',
    'BOTANY, NSW', 'AUBURN, NSW', 'DONEGAL', 'PRAYAGRAJ',
    'NEW SOUTH WALES', 'QUEENSLAND', 'VICTORIA, AU',
    'BRAESIDE', 'SEYMOUR, VIC', 'CHELMSFORD', 'MULGRAVE',
    'LAVERTON NORTH', 'WAGGA WAGGA', 'BURLEIGH HEADS', 'POINT COOK',
    'WILLIAMSTOWN, VIC', 'MARIBYRNONG', 'CANNONVALE', 'ARTARMON', 'MELTON, VIC',
    // Australian postcodes that leak via LoopNet
    ', 2756 ', ', 2170 ', ', 2164 ', ', 2200 ', ', 2565 ',
    ', 3026 ', ', 2650 ', ', 4220 ', ', 3030 ', ', 3016 ', ', 3032 ',
    ', 4802 ', ', 2064 ', ', 3337 ',
    // UK postcodes and locations
    'UNITED KINGDOM', ' UK,', ', UK ', 'ENGLAND', 'SCOTLAND', 'WALES',
    'SHEFFIELD', 'SALISBURY', 'FORGEMASTERS', 'BICESTER', 'STOCKTON-ON-TEES',
    'CHELTENHAM', 'GL51', 'DURHAM, UK', 'CITRUS DURHAM', 'NOTTINGHAM',
    'TRUGANINA', 'TRARALGON',
    'TANJUNG MANIS', 'STIDC', 'KYRGYZSTAN', 'MEXEDIA', 'POLAND', 'BOGDANKA',
    'KELOWNA', 'XUNTA', 'GALICIA', 'HUNTINGDON, PE', 'YAXLEY, PE',
    'MORISSET', ', 2264 ',
    // France (Toulouse area LoopNet leaks)
    'TOULOUSE', 'PORTET-SUR-GARONNE', 'GARONNE', ', 31100 ', ', 31120 ',
    // India extras (NITI Aayog / state names not caught by 'INDIA')
    'NITI AAYOG', 'WEST BENGAL', 'TAMIL NADU', 'MAHARASHTRA', 'KARNATAKA', 'GUJARAT',
    'KERALA', 'PUNJAB', 'HARYANA', 'RAJASTHAN', 'UTTAR PRADESH', 'ANDHRA PRADESH',
    // Australia (Brisbane QLD - Archerfield postcode 4108)
    'ARCHERFIELD', ', 4108 ',
    // Spain (Toledo / Numancia de la Sagra)
    'NUMANCIA DE LA SAGRA', 'NUMANCIA', 'AVENIDA DE LA INDUSTRIA', ', 45230 ', 'SPAIN',
    // UK (Lincoln, Lincolnshire - LN postcodes)
    'LN6 7UA', ', LN6 ', 'LINCOLNSHIRE',
    // Korea (IPARK Hyundai / Maeil Business Newspaper)
    'IPARK HYUNDAI', 'HYUNDAI INDUSTRIAL DEVELOPMENT', '매일경제',
    // Canada Quebec (Gatineau / Aylmer / Bulletin d'Aylmer)
    'GATINEAU', 'AYLMER', 'BULLETIN D',
    // Portugal (Seixal)
    'SEIXAL', 'PORTUGAL', 'PORTUGUESE',
    // Non-US postcode patterns in LoopNet titles (Australian 4-digit, UK alphanumeric)
    ', 2019 ', ', 2144 ', ', 2481 ', ', 2541 ', ', 3047 ', ', 3195 ', ', 3222 ', ', 3380 ', ', 3660 ', ', 3922 ',
    // Ireland
    'DONEGAL TOWN', 'COUNTY DONEGAL', 'IRELAND',
    // Malaysia / Southeast Asia
    'RINGGIT', 'RM800', 'BERNAMA', 'BURSA MALAYSIA', 'JOHOR', 'JS-SEZ', 'SUNWAY',
    'KUALA LUMPUR', 'PENANG', 'SELANGOR', 'PUTRAJAYA', 'ISKANDAR',
    'SARAWAK', 'ABANG JO', 'CHATTOGRAM',
    // Malaysia abbreviated Ringgit pattern (RM6mil, RM5mil etc — title shorthand)
    'SCANWOLF', 'WINS RM', ' RM2MIL', ' RM3MIL', ' RM4MIL', ' RM5MIL', ' RM6MIL', ' RM7MIL', ' RM8MIL', ' RM9MIL', ' RM10MIL', ' RM1MIL',
    'BURSA SAHAM', 'BERHAD',
    // UK Northumberland (Northumberland County PA exists as target — must NOT block bare 'NORTHUMBERLAND')
    'NORTHUMBERLAND GAZETTE', 'NORTHUMBERLAND, ENGLAND', 'NORTHUMBERLAND, UK',
    // UN bodies + Africa extras (Madagascar, ZAWYA wire)
    'UNIDO', 'UNITED NATIONS INDUSTRIAL DEVELOPMENT', 'PROGRAMME FOR COUNTRY PARTNERSHIP',
    'MADAGASCAR', 'ZAWYA', 'ANTANANARIVO',
    // South Asia
    'PAKISTAN', 'ISLAMABAD', 'KARACHI', 'LAHORE', 'FAISALABAD', 'RAWALPINDI',
    'SIALKOT', 'PESHAWAR', 'PUNJAB, PAKISTAN', 'SINDH', 'KHYBER',
    'BANGLADESH', 'DHAKA', 'SRI LANKA', 'COLOMBO', 'NEPAL', 'KATHMANDU',
    'MYANMAR', 'CAMBODIA', 'LAOS',
    // Africa
    'BURKINA FASO', 'GHANA', 'NIGERIA', 'KENYA', 'SOUTH AFRICA', 'JOHANNESBURG',
    'LAGOS', 'NAIROBI', 'ACCRA', 'SHARJAH', 'ZIMBABWE', 'HARARE', 'HERALDONLINE',
    // Middle East extras
    'ABU DHABI', 'QATAR', 'DOHA', 'BAHRAIN', 'KUWAIT', 'OMAN', 'JAFZA', 'JEBEL ALI',
    // Non-CRE content that matches industrial keywords
    'IMDB', '- IMDB', 'IMDB.COM',
    // Non-CRE market research reports (chemicals, hygiene, etc.)
    'INDEXBOX', 'HAND HYGIENE', 'CHEMICALS MARKET', 'CLEANING CHEMICALS',
    // Stock fund / mutual fund disclosures / investor activism (not CRE deals)
    'GURUFOCUS', 'HOLDING HISTORY', 'SECURITIES FUND',
    'SENDS LETTER TO', 'MARKETSCREENER', 'AI JOURNAL'
];

// Political / public figure exclusion
export const EXCLUDE_POLITICAL = [
    'trump', 'biden', 'president elect', 'congress', 'senate', 'election',
    'political', 'white house', 'democrat', 'republican', 'governor',
    'legislation', 'tariff', 'border', 'immigration', 'gop',
    'executive order', 'administration', 'campaign', 'ballot', 'voting',
    'supreme court', 'cabinet', 'impeach', 'partisan', 'bipartisan',
    'elon musk', 'musk', 'spacex', 'doge', 'jeff bezos',
    'mark zuckerberg', 'zuckerberg', 'bill gates',
    'shutdown', 'debt ceiling', 'stimulus', 'government spending',
    'foreign policy', 'military', 'defense budget', 'pentagon',
    'nato', 'sanctions', 'diplomatic',
    // 2026-06-01: Geopolitical / armed-conflict framings. Even when wrapped in
    // a "market report" the headline alone is reputationally bad for a CRE
    // newsletter. The May 2026 CommercialCafe industrial report shipped with
    // "Consequences of Iran Conflict Affect Industrial Sector" in the title;
    // unsendable on hindsight. Block at title-level even when source is a
    // legitimate CRE outlet.
    'iran conflict', 'israel-iran', 'iran-israel', 'gaza conflict',
    'ukraine war', 'russia-ukraine', 'middle east conflict',
    'taiwan conflict', 'china conflict', 'north korea',
    'war in ', 'consequences of war', 'consequences of conflict',
    'geopolitical conflict', 'armed conflict',
    // Accidents / disasters / crime (not CRE news)
    'killed', 'dead', 'injured', 'crash', 'collapsed', 'collapse', 'explosion',
    'helicopter', 'shooting', 'homicide', 'murder', 'arson', 'fire kills',
    'trapped', 'fatal', 'died'
];

// Non-industrial property types to exclude
// Hard property-type guards used by both the build phase (static.ts
// recategorizeArticle) and the send phase (newsletter-filters.ts
// applyTransactionFilter). Reject office / residential / retail /
// hospitality / self-storage transactions UNLESS the article has a strong
// industrial-asset override term (STRONG_INDUSTRIAL_OVERRIDE_RE).
// Keeps "Fashion Designer Takes 10K-SF Office" out of Transactions even
// when description is empty (paywalled or Google News title-only items).
// 2026-06-10: pluralized warehouse/center/facility/etc. — `\bwarehouse\b` doesn't
// match "warehouses" (word boundary fails on trailing 's'). Same for "distribution
// centers", "logistics facilities", etc. Caused Blackstone Broward $99.6M to slip
// past the override check and downstream categorization.
export const STRONG_INDUSTRIAL_OVERRIDE_RE = /\b(warehouses?|industrial\s+(buildings?|parks?|outdoor\s+storage|space)|logistics\s+(centers?|facilit(?:y|ies)|hubs?)|distribution\s+centers?|fulfillment\s+centers?|manufacturing\s+facilit(?:y|ies)|cold\s+storage|truck\s+terminals?|cross[ -]?docks?|trailer\s+parking|loading\s+docks?|3pl|drayage|intermodal)\b/i;
export const OFFICE_TRANSACTION_RE = /\b(office\s+(lease|space|building|tower|market)|class\s*a\s+office|headquarters\s+lease|hq\s+lease|coworking|medical\s+office|medical\s+for\s+(lease|sale)|takes?\s+\d[\d,]*[ -]?(sf|square\s*feet|sq\.?\s*ft)?\s+office|office\s+at\s+\d)\b/i;
export const RESIDENTIAL_TRANSACTION_RE = /\b(apartment|multifamily|condo(minium)?|residential\s+(building|tower|complex)|single[ -]family|townhome|student\s+housing|senior\s+living|assisted\s+living|homebuilding|homebuilder|home\s+builder)\b/i;
export const RETAIL_TRANSACTION_RE = /\b(retail\s+(lease|space|center|building)|shopping\s+center|strip\s+mall|outlet\s+mall|restaurant\s+(lease|space)|storefront|showroom\s+lease|fashion\s+designer)\b/i;
export const HOSPITALITY_TRANSACTION_RE = /\b(hotel\s+(lease|sale|deal|acquisition)|hospitality|resort|motel|airbnb|short[ -]term\s+rental)\b/i;
export const SELF_STORAGE_RE = /\b(self[ -]storage|storage\s+unit|climate[ -]controlled\s+storage)\b/i;

// 2026-06-01: Software/data/SaaS/venture-funding transactions that are NOT real
// estate deals. Catches things like "CoStar to Acquire Homebuilding Data and
// Marketplace Platform Zonda for $800M" and "Logistics Firm Stord Nabs $250M to
// Help Brands Take On Amazon" — both are software/data companies with no
// underlying RE asset. Tightened to catch generic VC-round language.
export const SOFTWARE_MA_RE = /\b(data\s+(platform|marketplace|company|provider|service|analytics)|software\s+(platform|company|provider|firm)|saas\s+(platform|company)|tech\s+(platform|startup|company)|proptech\s+(platform|startup|firm)|venture\s+round|series\s+[a-h]\s+(round|funding)|(nabs?|raises?|secures?|closes?|lands?)\s+\$\d[\d.,]*\s*(million|m\b|billion|b\b)\s+(to\s+(help|build|expand|launch|scale|compete|take\s+on)|in\s+(seed|series|funding|venture)|from\s+(investors?|vcs?))|api\s+platform|cloud\s+platform)\b/i;
// Military/government-personnel news (DVIDS, military.com etc.) — pure noise for
// industrial CRE. Patterns: rank + name, "promoted" / "advances" without RE context.
export const MILITARY_PERSONNEL_RE = /\b(seaman|petty\s+officer|sergeant|sgt\.?|corporal|lieutenant|captain\s+\w+\s+promoted|airman|sailor|marine\s+(corporal|sergeant|sgt\.?|lt\.?))\b/i;
// Retail/grocery/restaurant chain personnel news — retail-side supply chain
// hires (e.g., "Target taps former Walmart exec as supply chain chief") are
// not industrial CRE even when they mention "logistics" or "supply chain".
// Require industrial-asset override to keep legit industrial-side hires.
export const RETAIL_PERSONNEL_RE = /\b(target|walmart|amazon|kroger|albertsons|costco|whole\s+foods|trader\s+joe'?s|aldi|publix|wegmans|safeway|home\s+depot|lowe'?s|cvs|walgreens|rite\s+aid|7-eleven)\s+(taps?|hires?|names?|appoints?|elevates?|promotes?)\b/i;

export function hasWrongPropertyType(text: string): boolean {
    return OFFICE_TRANSACTION_RE.test(text) ||
        RESIDENTIAL_TRANSACTION_RE.test(text) ||
        RETAIL_TRANSACTION_RE.test(text) ||
        HOSPITALITY_TRANSACTION_RE.test(text) ||
        SELF_STORAGE_RE.test(text) ||
        SOFTWARE_MA_RE.test(text) ||
        MILITARY_PERSONNEL_RE.test(text) ||
        RETAIL_PERSONNEL_RE.test(text);
}

export function hasStrongIndustrialOverride(text: string): boolean {
    return STRONG_INDUSTRIAL_OVERRIDE_RE.test(text);
}

export const EXCLUDE_NON_INDUSTRIAL = [
    // Office
    'office lease', 'office building', 'office tower', 'office space', 'offices', 'coworking', 'co-working',
    'class a office', 'class b office', 'office campus', 'office portfolio', 'office property',
    // Residential / Multifamily
    'multifamily', 'multi-family', 'apartment', 'residential', 'condo', 'condominium',
    'single-family', 'single family', 'townhouse', 'townhome', 'homebuilder', 'home builder',
    'penthouse', 'luxury home', 'luxury condo', 'luxury residence',
    'active adult', '55+', '55 and older', 'age-restricted',
    'senior living', 'assisted living', 'nursing home', 'memory care',
    'student housing', 'dormitory',
    // Retail / Restaurant / Bars
    'retail', 'restaurant', 'shopping center', 'mall', 'strip mall', 'outlet',
    'bookstore', 'grocery store', 'supermarket', 'convenience store',
    'wine bar', 'cocktail bar', 'brewery', 'taproom', 'coffee shop', 'cafe opens',
    'bank branch',
    // Hospitality
    'hotel', 'hospitality', 'resort', 'motel', 'airbnb',
    // Self-storage
    'self-storage', 'self storage', 'mini storage',
    // Auto / Car
    'car dealer', 'auto dealer', 'car dealership', 'auto dealership',
    // Medical / Pharma / Biotech (non-industrial CRE)
    'medical office', 'medical center', 'hospital',
    'cdmo', 'contract development and manufacturing', 'clinical-stage', 'commercial-stage',
    'drug product', 'pharmaceutical powder', 'spray drying', 'inhaled therapy', 'nasal therapy',
    'probiotic', 'clinical manufacturing',
    // Misc non-industrial
    'gym ', 'fitness center', 'boxing gym', 'yoga studio',
    'church', 'religious', 'museum', 'library',
    'charter school', 'public school',
    // Crime / legal (not CRE news)
    'bid-rigging', 'pleads guilty', 'guilty plea', 'indicted', 'sentenced',
    'foreclosure', 'bankruptcy filing',
    // Mixed-use (primarily residential)
    'mixed-use residential', 'mixed use residential',
    'mixed-use', 'mixed use',
    // Residential properties
    'mansion', 'estate sale', 'penthouse sale', 'townhouse sale',
    'lists for $', 'compound built by', 'macy\'s heir', 'heir lists',
    // Residential brokerage
    'realtor',
    // Non-CRE institutions
    'social work', 'university', 'institute of technology', 'college', 'curriculum',
    'graduate-level', 'master of science', 'bioprocessing', 'cell therapy', 'gene therapy',
    'crisis response', 'disaster relief', 'humanitarian',
    'aid network', 'nonprofit logistics', 'charity',
    // Food distribution / community events (not CRE)
    'food distribution', 'food bank', 'food pantry', 'food drive', 'community food',
    'snap benefit', 'meal distribution', 'feeding program',
    // Banks / financial retail
    'bank debuts', 'bank opens', 'bank branch', 'credit union',
    // Residential home sales (catches "industrial heir sells Palm Beach home")
    'industrial heir', 'lakefront home', 'waterfront home', 'beachfront home',
    // Non-industrial land use
    'polo field', 'polo club', 'golf course', 'country club',
    // Boardwalk / entertainment / community (not CRE)
    'boardwalk', 'pavilion', 'community destination', 'amusement',
    'convention center', 'arena',
    // District names that contain "warehouse" but aren't industrial
    'warehouse arts district', 'warehouse district restaurant', 'warehouse district bar',
];

// Industrial property keywords
export const INDUSTRIAL_PROPERTY_KEYWORDS = [
    'industrial', 'warehouse', 'logistics', 'distribution', 'manufacturing', 'cold storage',
    'last-mile', 'last mile', 'industrial outdoor storage', 'ios', 'industrial land',
    'fulfillment', 'flex space', 'spec industrial', 'industrial park', 'loading dock',
    'supply chain', 'freight', 'trucking', 'shipping', 'cargo',
    'e-commerce', 'ecommerce', 'automation', 'robotics',
    'data center', 'cross-dock', 'cross dock',
    'build-to-suit', 'vacancy rate',
];

/**
 * Unified industrial content gate — shared by frontend (static.ts) and newsletter (email.ts).
 * Returns TRUE if the article is about industrial/logistics/manufacturing/supply-chain
 * or general CRE macro trends (interest rates, cap rates, etc.).
 * Returns FALSE for apartments, retail, office, hospitality, and other non-industrial content.
 *
 * KEY RULE: Articles must be about INDUSTRIAL real estate or CRE topics relevant to
 * an industrial landlord. "Vibe coding" or generic tech articles do NOT qualify even
 * if they mention "freight" in passing.
 */
export function isStrictlyIndustrial(text: string): boolean {
    const lower = text.toLowerCase();

    // HARD BLOCK (2026-06-25): keyword-matched non-real-estate junk that slips past
    // the "warehouse" exception below. Runs FIRST so even a "warehouse" mention can't
    // rescue it.
    //  - Animal-welfare / wildlife: e.g. "Fifth sloth dies after Sloth World warehouse
    //    rescue" — keyword "warehouse" but it's an animal story, never industrial CRE.
    //    (Confirmed leak class — see the 5/21 "sloths die in Orlando warehouse" call.)
    //  - Scraped pagination/index pages: e.g. "Industrial – Page 360 - Real Estate NJ".
    if (/\b(sloths?|animal (?:rescue|welfare|cruelty|shelter|sanctuary|abuse)|wildlife|\bzoo\b|menagerie|rescued animals?)\b/i.test(lower)) return false;
    if (/[-–—]\s*page\s+\d+\b/i.test(lower)) return false;

    // FIRST: If it has non-industrial keywords → reject immediately
    // (prevents "industrial heir sells Palm Beach home" from passing on "industrial")
    const hasNonIndustrial = EXCLUDE_NON_INDUSTRIAL.some(kw => lower.includes(kw));
    if (hasNonIndustrial) {
        // Exception: if it ALSO has strong industrial property keywords, keep it
        const STRONG_INDUSTRIAL = [
            'warehouse', 'logistics center', 'distribution center', 'fulfillment center',
            'manufacturing facility', 'cold storage', 'industrial park', 'loading dock',
            'industrial outdoor storage', 'flex space', 'cross-dock',
        ];
        if (!STRONG_INDUSTRIAL.some(kw => lower.includes(kw))) return false;
    }

    // Core industrial property keywords — direct industrial CRE relevance
    const CORE_INDUSTRIAL = [
        'industrial', 'warehouse', 'logistics', 'distribution', 'manufacturing',
        'cold storage', 'last-mile', 'last mile', 'industrial outdoor storage',
        'fulfillment', 'flex space', 'spec industrial', 'industrial park', 'loading dock',
        'data center', 'cross-dock', 'cross dock', 'build-to-suit', 'vacancy rate',
    ];
    if (CORE_INDUSTRIAL.some(kw => lower.includes(kw))) {
        // "industrial" alone can be misleading ("industrial heir", "industrial revolution")
        // If only match is "industrial", require a second CRE/property signal
        const industrialOnly = lower.includes('industrial') &&
            !CORE_INDUSTRIAL.filter(kw => kw !== 'industrial').some(kw => lower.includes(kw));
        if (industrialOnly) {
            const hasCRESignal = /\b(warehouses?|leases?|sold|acquired|sq\.?\s*ft|square\s*feet|acres|propert(?:y|ies)|buildings?|facilit(?:y|ies)|sites?|developments?|tenants?|portfolios?|zoning|assets?|markets?|reports?|sectors?|demand|outlook|recovery|real\s*estate|investors?|investments?|rents?|cap\s*rate|occupancy|ops|operations|leaders|users|space)\b/i.test(lower);
            if (!hasCRESignal) return false;
        }
        return true;
    }

    // Supply chain / freight / shipping — only pass if article has a real
    // INDUSTRIAL ASSET signal. Tightened 2026-05-27: removed `delivery`,
    // `deliveries`, `operations`, `inventory`, `fleet`, `carrier`, `building`
    // from the asset regex — those were too generic and let through
    // retail-delivery/inventory-tech content ("Mattress Firm contactless
    // delivery", "Albertsons AI produce inspection"). Asset signal now
    // requires actual physical infrastructure language.
    const SUPPLY_CHAIN_KEYWORDS = [
        'supply chain', 'freight', 'trucking', 'shipping', 'cargo',
        'e-commerce', 'ecommerce', 'automation', 'autonomous', 'robotics',
    ];
    if (SUPPLY_CHAIN_KEYWORDS.some(kw => lower.includes(kw))) {
        const hasIndustrialAsset = /\b(warehouses?|distribution\s+centers?|fulfillment\s+centers?|logistics\s+centers?|industrial\s+parks?|industrial\s+buildings?|manufacturing\s+facilit(?:y|ies)|cold\s+storage|3pl|drayage|intermodal|ports?|terminals?|rail\s+yards?|truck\s+terminals?|trailer\s+parking|last[ -]?mile\s+facilit(?:y|ies)|loading\s+docks?|cross[ -]?docks?|industrial\s+outdoor\s+storage|spec\s+industrial)\b/i.test(lower);
        if (hasIndustrialAsset) return true;
        // Generic supply chain/freight content without a physical-asset signal → reject
        return false;
    }

    // General CRE macro (interest rates, cap rates, etc.) with no property type → pass
    const CRE_MACRO = [
        'interest rate', 'federal reserve', 'fed ', 'inflation', 'capital markets',
        'cap rate', 'noi', 'vacancy', 'absorption', 'rent growth',
        'commercial real estate', 'cre', 'reit', 'cmbs',
        'construction cost', 'labor cost', 'insurance cost',
        'reshoring', 'nearshoring', 'onshoring',
        // Added 2026-05-27: CRE financial/structural terms to expand build-phase coverage.
        'joint venture', 'value-add', 'value add', 'adaptive reuse', 'opportunity zone',
        'irr', 'ltv', 'loan-to-value', 'valuation', 'net operating income',
        'intermodal', 'build-to-suit', 'bts',
    ];
    if (CRE_MACRO.some(kw => lower.includes(kw))) return true;

    // CRE deal signals — BUT only if the article is NOT about a non-industrial property type.
    // "Fanatics Expands West Village Lease" has "lease" but is not industrial.
    // If we already detected non-industrial keywords above and didn't have strong industrial
    // override, we already returned false. But some articles may have generic "lease" without
    // any explicit non-industrial keyword (e.g., "Lease to Entire Building" with no "office"/"retail").
    // For those, require that the deal signal is paired with industrial/CRE property context.
    const CRE_DEAL_SIGNALS = [
        'for lease', 'for sale', 'for sublease', 'on the market',
        'acquisition', 'acquired', 'disposition', 'sold', 'purchased', 'sale of',
        'square feet', 'sq ft', 'sq. ft', 'acres',
        'zoning', 'rezoning', 'entitlement',
        'economic development', ' eda ',
        // Added 2026-05-27: deal-structure terms.
        'joint venture', 'recapitalization', 'sale-leaseback', 'sale leaseback',
        'ground lease', 'assemblage', 'entitlements',
    ];
    if (CRE_DEAL_SIGNALS.some(kw => lower.includes(kw))) {
        // 2026-05-27: tightened to require real property context. Plain "for sale"
        // was letting through vehicle ads from Daily Record ("Affordable Pickups
        // For Sale With Top Safety & Comfort") and similar non-RE listings.
        const hasPropertyContext = /\b(warehouses?|industrials?|distribution|logistics|fulfillment|manufacturing|cold\s+storage|buildings?|facilit(?:y|ies)|propert(?:y|ies)|portfolios?|assets?|sites?|acres|square\s+feet|sq\.?\s*ft|\bsf\b|land\s+(sale|deal)|industrial\s+parks?|centers?|complex(?:es)?|campus(?:es)?|loading\s+docks?)\b/i.test(lower);
        const isVehicleAd = /\b(pickup|sedan|suv|truck\s+for\s+sale|dealership|2024|2025\s+(ford|chevy|toyota|honda|ram)|crew\s+cab|king\s+cab|4x4|safety\s*&\s*comfort|test\s+drive|learn\s+more\s*\))\b/i.test(lower);
        if (isVehicleAd) return false;
        if (hasPropertyContext) return true;
        // Deal signal w/o property context (e.g., vehicle/consumer good "for sale") → reject
        return false;
    }

    // Generic "lease"/"leasing"/"tenant" — only pass with industrial/CRE property context
    // Generic "lease"/"leasing"/"tenant" — only pass with industrial/CRE property context
    // "Fanatics Expands Lease to Entire Building" should NOT pass (non-industrial tenant)
    // "Seagis signs lease at industrial building" SHOULD pass (industrial context)
    const GENERIC_DEAL_WORDS = ['leasing', 'lease', 'tenant', 'landlord'];
    if (GENERIC_DEAL_WORDS.some(kw => lower.includes(kw))) {
        const hasIndustrialContext = /\b(warehouses?|industrials?|logistics|distribution|manufacturing|fulfillment|cold\s*storage|flex\s*space|commercial\s*real\s*estate|cre)\b/i.test(lower);
        const hasStrongPropertySignal = /\b(sq\.?\s*ft|square feet|acres)\b/i.test(lower);
        if (hasIndustrialContext || hasStrongPropertySignal) return true;
    }

    // CRE firms + development/brokerage context
    const CRE_FIRMS = [
        'newmark', 'jll', 'cbre', 'cushman', 'colliers', 'blackstone',
        'prologis', 'bridge industrial', 'nai ', 'naiop', 'sior', 'ccim',
        'costar', 'avison young', 'marcus & millichap',
        'eastdil', 'walker & dunlop', 'berkadia',
    ];
    const CRE_ROLES = [
        'brokerage', 'broker', 'development', 'redevelopment', 'developer',
        'portfolio', 'asset', 'property',
        'vice president', 'managing director', 'principal',
    ];
    if (CRE_FIRMS.some(kw => lower.includes(kw)) && CRE_ROLES.some(kw => lower.includes(kw))) return true;

    // No industrial, CRE, or industry signal → reject
    return false;
}

// Relevant articles: macro trends + industrial RE news
export const RELEVANT_KEYWORDS = [
    'interest rate', 'fed ', 'federal reserve', 'inflation', 'cpi', 'lending', 'financing', 'capital markets',
    'freight', 'shipping', 'trucking', 'supply chain', 'port', 'cargo', 'container',
    'construction cost', 'material cost', 'steel', 'concrete', 'lumber', 'labor cost', 'labor market',
    'insurance', 'insurance cost', 'property insurance',
    'industrial', 'warehouse', 'distribution', 'fulfillment', 'cold storage', 'logistics', 'flex space',
    'manufacturing', 'last mile', 'e-commerce', 'spec development', 'industrial park',
    'approved', 'approves', 'approval', 'zoning', 'rezoning', 'entitlement', 'permits', 'planning board',
    'groundbreaking', 'under construction', 'development', 'project', 'proposed', 'planned',
    'sustainable industrial', 'esg property', 'net zero', 'green building', 'leed',
    'last mile delivery', 'automation', 'robotics', 'automated warehouse',
    'workforce development', 'skilled trades', 'labor shortage',
    'reshoring', 'nearshoring', 'supply chain resilience', 'onshoring',
    'data center', 'flex warehouse', 'cross-dock', 'cross dock',
    'last-mile facility', 'micro-fulfillment', 'micro fulfillment',
    'agri-tech', 'agritech', 'food processing', 'food facility',
    'advanced manufacturing', 'contract manufacturing',
    'commercial real estate', 'cre', 'vacancy', 'absorption', 'rent growth', 'cap rate',
    // Added 2026-05-26: CRE/intent terms requested by boss
    'leasing', 'acquisition', 'investment', 'tenant', 'brokerage',
    'site selection', 'flex', 'facility', 'intermodal', 'build-to-suit',
    'redevelopment', 'clear height', 'reit', 'value-add', 'pipeline',
    'opportunity zone', 'expansion', 'adaptive reuse', 'irr',
    'loan-to-value', 'ltv', 'valuation', 'joint venture', 'yield',
    'noi', 'net operating income', 'e-commerce growth', 'e-commerce trends'
];

// People news action keywords
export const PEOPLE_ACTION_KEYWORDS = [
    'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
    'hires', 'appoints', 'promotes', 'names', 'adds', 'taps', 'leads', 'heads',
    'chair', 'nabs', 'welcomes', 'brings', 'expands', 'grows', 'bolsters', 'strengthens',
    'movers', 'shakers', 'leadership', 'executive', 'move',
    'announces', 'announced', 'selected', 'recognized', 'award', 'honored', 'featured',
    'profile', 'spotlight', 'interview', 'q&a', 'power broker', 'rising star', 'top producer'
];

// Industrial context keywords (for people news filtering)
export const INDUSTRIAL_CONTEXT_KEYWORDS = [
    'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
    'prologis', 'duke', 'link logistics', 'rexford', 'first industrial', 'stag', 'terreno',
    'exeter', 'blackstone', 'brookfield', 'clarion', 'dermody', 'hillwood', 'idl', 'panattoni',
    'avison young', 'lee & associates', 'kidder mathews', 'transwestern', 'savills', 'ngkf',
    'eastdil', 'hff', 'walker & dunlop', 'berkadia', 'northmarq', 'keane', 'ware malcomb',
    'industrial', 'logistics', 'warehouse', 'distribution', 'fulfillment', 'cold storage',
    'commercial real estate', 'cre', 'investment sales', 'capital markets', 'brokerage',
    'real estate', 'development', 'developer', 'redevelopment', 'land use', 'zoning',
    'property', 'portfolio', 'asset', 'partner', 'principal', 'managing director', 'vice president',
    'broker', 'leasing', 'acquisition', 'construction', 'economic development', 'eda',
    'naiop', 'icsc', 'uli', 'boma', 'cbre institute',
    'investor', 'fund manager', 'private equity', 'institutional', 'family office', 'reit',
    'investment firm', 'investment manager', 'allocation', 'fundraising', 'capital raise'
];

// Transaction action words — indicates a deal, not people news
export const TRANSACTION_ACTION_WORDS = [
    'acquired', 'acquisition', 'purchased', 'purchase', 'sold', 'sale of', 'sells',
    'leased', 'lease', 'signed', 'closes', 'closed', 'financing', 'refinanc',
    'arranges', 'arranged', 'brokered', 'negotiated', 'completed',
    'bought', 'buying', 'invested', 'investment in', 'joint venture',
    'recapitalization', 'disposition', 'capitalization'
];

// Project approval keywords (always relevant, no threshold needed)
export const APPROVAL_KEYWORDS = [
    'approved', 'approves', 'approval', 'zoning', 'rezoning', 'entitlement',
    'permits', 'planning board', 'commission'
];

// Exclude from people news (residential/non-industrial)
export const EXCLUDE_FROM_PEOPLE = [
    'residential broker', 'elliman', 'compass real', 'redfin', 'zillow',
    'mortgage lender', 'retail broker', 'multifamily broker', 'apartment complex',
    'hotel broker', 'hospitality'
];

// Approved source domains for newsletter.
// news.google.com is included because ~80% of our feed flows through Google News
// RSS (used as a proxy for sources that block direct scraping). Excluding it
// caused isTargetRegion to reject the entire Google News stream at the source
// gate, which broke reserve pool transactions/availabilities/people fill on
// 2026-05-13. The remaining quality filters (hasGeographicFailure,
// INTERNATIONAL_EXCLUDE, countRegionMatches) still run against the article text.
export const APPROVED_DOMAINS = [
    'bisnow.com', 'globest.com', 'costar.com', 'reuters.com', 'apnews.com',
    'bloomberg.com', 'wsj.com', 'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com',
    'bizjournals.com', 'traded.co', 're-nj.com', 'njbiz.com', 'lvb.com', 'naiop.org',
    'naiopnj.org', 'cpexecutive.com', 'commercialcafe.com', 'freightwaves.com',
    'areadevelopment.com', 'connectcre.com', 'therealdeal.com', 'rejournals.com',
    'credaily.com', 'supplychaindive.com',
    'rebusinessonline.com', 'mhlnews.com', 'dcvelocity.com',
    'inboundlogistics.com', 'ttnews.com',
    'logisticsviewpoints.com', 'commercialobserver.com', 'roi-nj.com',
    'njspotlightnews.org', 'connect.media', 'constructiondive.com',
    'naikeystone.com', 'naiplatform.com', 'prologis.com', 'retaildive.com',
    'prnewswire.com', 'globenewswire.com', 'businesswire.com',
    'joc.com', 'loopnet.com', 'propertyshark.com', 'commercialsearch.com',
    'news.google.com'
];

// Regional sources — always include articles from these
export const REGIONAL_SOURCES = [
    're-nj.com', 'njbiz.com', 'lvb.com',
    'bisnow.com/new-jersey', 'bisnow.com/philadelphia', 'bisnow.com/south-florida',
    'therealdeal.com/miami'
];

// Brokerage sources — trust for people news
export const BROKERAGE_SOURCES = [
    'bisnow.com', 'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com',
    'newmark', 'nai', 'sior.com', 'ccim.com', 'naiop.org', 're-nj.com', 'globest.com',
    'commercialsearch.com', 'cpexecutive.com', 'therealdeal.com'
];

// ============================================
// CLASSIFIER-SPECIFIC KEYWORDS
// ============================================

// Industrial/Warehouse keywords - expanded set for classification scoring
export const INDUSTRIAL_KEYWORDS = [
    "industrial", "warehouse", "distribution", "logistics", "fulfillment",
    "last-mile", "last mile", "3pl", "port", "drayage", "intermodal",
    "ios", "outdoor storage", "manufacturing", "manufacturing plant",
    "cold storage", "refrigerated", "temperature-controlled", "cold chain",
    "data center", "data centre", "server farm", "cloud facility",
    "cross-dock", "cross dock", "spec industrial", "speculative industrial",
    "flex space", "flex industrial", "r&d", "research and development",
    "food processing", "food facility", "beverage facility", "brewery",
    "automotive", "auto parts", "assembly plant", "stamping plant",
    "aerospace", "aviation", "aircraft facility", "mro facility",
    "life sciences", "biotech", "pharmaceutical", "medtech",
    "chemical plant", "processing plant", "industrial park",
    "trade hub", "distribution hub", "logistics hub", "fulfillment hub",
    "e-commerce", "ecommerce", "online retail", "digital commerce",
    "supply chain", "supply chain network", "distribution network",
    "material handling", "conveyor", "automation", "robotics",
    "industrial real estate", "logistics real estate", "warehouse real estate"
];

// CRE Intent keywords for classification
export const CRE_INTENT_KEYWORDS = [
    "commercial real estate", "real estate", "cre",
    "lease", "leasing", "tenant", "landlord",
    "broker", "brokerage", "listing", "for lease", "for sale",
    "zoning", "entitlement", "planning board", "rezoning",
    "square feet", "sq ft", "sf", "acres",
    "rent", "asking rent", "nnn", "triple net", "gross lease",
    "cap rate", "noi", "acquisition", "sale", "sold", "purchased",
    "development", "redevelopment", "ground-up development",
    "investment", "investor", "institutional", "private equity",
    "reit", "real estate investment trust", "fund", "fund manager",
    "property", "asset", "portfolio", "asset management",
    "prologis", "dltr", "dre", "equity", "blackstone", "cbre", "jll",
    "cushman", "colliers", "newmark", "cushman & wakefield",
    "industrial landlord", "industrial developer", "logistics developer",
    "build-to-suit", "bts", "design-build", "turnkey",
    "net lease", "absolute net lease", "ground lease",
    "sale-leaseback", "sale leaseback", "monetization",
    "refinance", "mortgage", "loan", "financing",
    // Added 2026-05-26: CRE/intent terms requested by boss
    "site selection", "flex", "facility", "intermodal",
    "clear height", "value-add", "pipeline", "opportunity zone",
    "supply chain", "expansion", "adaptive reuse", "irr",
    "loan-to-value", "ltv", "valuation", "joint venture", "yield",
    "net operating income", "e-commerce growth", "e-commerce trends"
];

// Property signals for classification
export const PROPERTY_SIGNALS = [
    "facility", "building", "site", "development", "project",
    "spec", "speculative", "build-to-suit", "bts",
    "groundbreaking", "construction", "delivered", "deliveries",
    "zoning", "entitlement", "rezoning",
    "industrial park", "distribution center", "fulfillment center",
    "square-foot", "square feet", "sf", "sq ft", "acres",
    "clear height", "dock doors", "loading docks", "truck court",
    "rail service", "rail spur", "rail-served", "rail access",
    "highway access", "interstate access", "infrastructure",
    "power capacity", "electrical service", "utilities",
    "sprinkler system", "fire suppression", "esfr",
    "temperature control", "climate control", "refrigeration",
    "security", "fenced", "gated", "24/7 access",
    "parking ratio", "truck parking", "car parking",
    "expansion", "addition", "renovation", "retrofit",
    "vacancy", "occupancy", "absorption", "demand",
    "rent rates", "rental rates", "market rent"
];

// Hard negative - non-CRE content
export const HARD_NEGATIVE_NON_CRE = [
    "opens", "grand opening", "reopens", "giveaway", "menu",
    "restaurant", "coffee", "dunkin", "starbucks", "mcdonald",
    "retail", "store", "shop", "mall", "rack", "nordstrom", "walmart",
    "cannabis", "dispensary", "marijuana", "weed",
    "gaming", "casino", "lottery", "revenue record", "sports betting",
    "sports", "bears", "nfl", "mlb", "nba", "nhl", "mls",
    "concert", "festival", "event", "entertainment", "movie theater",
    "residential", "apartment", "multifamily", "condo", "single-family",
    "hotel", "hospitality", "resort", "motel", "airbnb",
    "self-storage", "self storage", "storage unit", "climate storage",
    "school", "university", "college", "hospital", "medical center",
    "church", "religious", "museum", "library", "government building",
    "gas station", "car wash", "auto repair", "tire shop"
];

// Market keywords for NJ/PA/FL focus (lowercase for classifier)
export const MARKET_KEYWORDS = [
    "new jersey","nj","pennsylvania","pa","florida","fl",
    "port newark","elizabeth","newark","jersey city","bayonne",
    "trenton","camden","princeton","morris county","bergen county",
    "hudson county","essex county","middlesex county","union county",
    "monmouth county","somerset county",
    "central jersey","north jersey","south jersey","shore",
    "philadelphia","pittsburgh","lehigh valley","allentown","bethlehem","easton",
    "bucks county","montgomery county","chester county","delaware county",
    "miami","tampa","orlando","jacksonville",
    "fort lauderdale","west palm","palm beach","fort myers","naples",
    "south florida","gold coast","treasure coast","space coast",
    "miami-dade","broward","hillsborough","duval"
];

// Geography keywords (highways, ports, corridors)
export const GEOGRAPHY_KEYWORDS = [
    "port newark", "elizabeth", "newark", "bayonne", "jersey city",
    "port of new york", "port of new jersey", "ny nj port",
    "turnpike", "garden state parkway", "i-78", "i-80", "i-287", "i-95", "i-81",
    "i-295", "i-195", "i-76", "i-476", "route 1", "route 9", "route 18",
    "exit 8a", "exit 7a", "exit 13", "exit 15", "exit 16",
    "lehigh valley", "allentown", "bethlehem", "easton",
    "i-76 pa", "pennsylvania turnpike", "i-83", "i-79", "route 309",
    "port of philadelphia", "philadelphia port", "pittsburgh",
    "i-95 florida", "i-75", "i-4", "i-595", "florida turnpike",
    "miami-dade", "broward", "palm beach", "fort lauderdale",
    "port miami", "port everglades", "port of tampa", "port of jacksonville",
    "south florida", "gold coast", "treasure coast",
    "logistics corridor", "distribution corridor", "industrial corridor",
    "inland port", "intermodal facility", "rail yard"
];

// Classifier exclusion keywords (combines political + international + non-CRE)
export const EXCLUSION_KEYWORDS = [
    "apartment", "multifamily", "condo", "single-family", "homebuilder",
    "hotel", "hospitality", "self-storage", "self storage",
    "office building", "office lease", "office space", "class a office",
    "retail center", "shopping center", "strip mall", "outlet mall",
    "trump", "biden", "president trump", "president biden", "white house",
    "congress", "senate", "republican", "democrat", "political", "election",
    "executive order", "administration", "tariff war", "trade war",
    "governor", "legislation", "campaign", "ballot", "voting", "gop",
    "supreme court", "cabinet", "impeach", "partisan", "bipartisan",
    "shutdown", "debt ceiling", "stimulus", "government spending",
    "foreign policy", "military", "defense budget", "pentagon",
    "nato", "sanctions", "diplomatic",
    "elon musk", "musk", "spacex", "doge", "jeff bezos",
    "mark zuckerberg", "zuckerberg", "bill gates",
    "india", "china", "uk", "europe", "asia", "mexico", "canada",
    "london", "beijing", "shanghai", "mumbai", "delhi", "tokyo",
    "hong kong", "singapore", "dubai", "australia", "germany", "france",
    "stock price", "earnings report", "quarterly earnings", "ipo",
    "cryptocurrency", "bitcoin", "crypto", "nft",
    "layoffs", "job cuts", "workforce reduction",
    "super bowl", "world series", "playoffs", "championship",
    "movie", "film", "streaming", "netflix", "disney",
    "black friday", "cyber monday", "holiday shopping", "consumer spending"
];

// Out-of-market keywords (non-NJ/PA/FL regions)
export const OUT_OF_MARKET_KEYWORDS = [
    "texas", "houston", "dallas", "austin", "san antonio", "fort worth",
    "dfw", "dallas-fort worth", "plano", "irving", "arlington",
    "california", "los angeles", "san francisco", "bay area", "silicon valley",
    "san diego", "sacramento", "seattle", "portland",
    "denver", "phoenix", "las vegas", "salt lake", "boise", "tucson", "albuquerque",
    "chicago", "detroit", "minneapolis", "st. louis", "kansas city",
    "columbus", "indianapolis", "milwaukee", "cincinnati", "cleveland",
    "atlanta", "nashville", "charlotte", "raleigh", "richmond",
    "memphis", "birmingham", "charleston", "new orleans",
    "boston", "connecticut", "massachusetts", "baltimore", "maryland", "virginia",
    "washington dc", "washington, dc", "washington, d.c.", "d.c.",
    "el segundo", "rancho dominguez", "rancho cucamonga", "perris", "hesperia",
    "caddo parish", "shreveport", "louisiana", "niles, il", "niles, ohio",
    "costa mesa", "pinellas park", "soho", "midtown manhattan", "tribeca",
    "suffern", "westchester county",
    // CA Orange County / SoCal cities that slipped in via trusted sources (2026-06-26: globest "Tustin Redevelopment")
    "tustin", "irvine", "anaheim", "santa ana", "long beach", "oakland", "fremont", "san jose"
];
