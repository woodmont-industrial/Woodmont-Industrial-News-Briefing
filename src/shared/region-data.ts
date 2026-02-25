/**
 * Canonical region/keyword data shared across newsletter filters and static build.
 * Single source of truth — update here, changes propagate everywhere.
 */

// Target regions for strict filtering (NJ, PA, FL)
export const TARGET_REGIONS = [
    'NJ', 'PA', 'FL', 'NEW JERSEY', 'PENNSYLVANIA', 'FLORIDA',
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
    // Major CRE players (include national news about these)
    'PROLOGIS', 'DUKE REALTY', 'BLACKSTONE', 'CBRE', 'JLL', 'CUSHMAN', 'COLLIERS',
    'NEWMARK', 'MARCUS & MILLICHAP', 'EASTDIL', 'HFF', 'BRIDGE INDUSTRIAL', 'DERMODY',
    'FIRST INDUSTRIAL', 'STAG INDUSTRIAL', 'REXFORD', 'TERRENO', 'MONMOUTH REAL ESTATE',
    // Industrial/logistics keywords that suggest regional relevance
    'PORT NEWARK', 'ELIZABETH PORT', 'SEAGIRT', 'PORTSIDE'
];

// States/cities to EXCLUDE (everything except NJ, PA, FL)
export const MAJOR_EXCLUDE_REGIONS = [
    'HOUSTON', 'DALLAS', 'AUSTIN', 'SAN ANTONIO', 'FORT WORTH', 'TEXAS', ', TX',
    'ATLANTA', 'LOS ANGELES', 'SAN FRANCISCO', 'CHICAGO', 'BOSTON', 'SEATTLE', 'DENVER', 'PHOENIX',
    'CHARLOTTE', 'NASHVILLE', 'BALTIMORE', 'SAN DIEGO', 'PORTLAND', 'DETROIT', 'MINNEAPOLIS',
    'COLUMBUS', 'INDIANAPOLIS', 'MEMPHIS', 'RALEIGH', 'RICHMOND', 'MILWAUKEE', 'KANSAS CITY',
    'ST. LOUIS', 'CLEVELAND', 'CINCINNATI', 'LAS VEGAS', 'SALT LAKE', 'BOISE', 'SACRAMENTO',
    'OKLAHOMA CITY', 'TUCSON', 'ALBUQUERQUE', 'NEW ORLEANS', 'MESA, ARIZONA', 'ARIZONA',
    'TENNESSEE', 'KENTUCKY', 'LOUISVILLE', 'ALABAMA', 'ARKANSAS',
    'CALIFORNIA', ', CA', 'FREMONT, CA', 'FREMONT,', 'SAN JOSE', 'SILICON VALLEY', 'BAY AREA',
    'OREGON', 'WASHINGTON STATE', 'HAWAII', 'IOWA', 'NEBRASKA', 'MONTANA', 'WYOMING',
    'NORTH DAKOTA', 'SOUTH DAKOTA', 'IDAHO', 'UTAH', 'MISSISSIPPI', 'WEST VIRGINIA',
    'WASHINGTON, DC', 'WASHINGTON, D.C.', 'WASHINGTON DC', 'D.C.', ', DC',
    'GEORGIA', 'SOUTH CAROLINA', 'NORTH CAROLINA', 'VIRGINIA', 'MARYLAND',
    'COLORADO', 'MINNESOTA', 'WISCONSIN', 'MICHIGAN', 'OHIO', 'MISSOURI',
    'FORT PAYNE', 'DEKALB COUNTY, AL',
    'EL PASO', 'NORFOLK', 'VIRGINIA BEACH', 'ROANOKE',
    'NEW HAVEN', 'ALBANY', 'BUFFALO',
    'OMAHA', 'DES MOINES', 'MOBILE', 'LITTLE ROCK', 'BATON ROUGE', 'TULSA',
    'CHEYENNE', 'BEE CAVE', 'BOZEMAN', 'CHESTERFIELD COUNTY',
    'LEXINGTON', 'BIRMINGHAM', 'CHARLESTON', 'COLUMBIA', 'PROVIDENCE', 'HARTFORD',
    ', NY', ', GA', ', MD', ', VA', ', NC', ', SC',
    ', TN', ', OH', ', IL', ', MI', ', IN', ', WI', ', MN', ', MO',
    ', KY', ', AL', ', LA', ', AR', ', OK', ', KS', ', NE', ', IA',
    ', CO', ', AZ', ', NV', ', UT', ', NM', ', MT', ', WY', ', ID',
    ', WA', ', OR', ', MA', ', CT', ', NH', ', VT', ', ME', ', RI'
];

// International terms — ALWAYS exclude
export const INTERNATIONAL_EXCLUDE = [
    'EUROPE', 'EUROPEAN', 'UK ', 'U.K.', 'UNITED KINGDOM', 'BRITAIN',
    'ASIA', 'ASIAN', 'PACIFIC', 'APAC', 'CHINA', 'JAPAN', 'INDIA', 'SINGAPORE', 'HONG KONG',
    'AUSTRALIA', 'CANADA', 'CANADIAN', 'MONTREAL', 'VANCOUVER', 'LATIN AMERICA', 'MIDDLE EAST',
    'AFRICA', 'GLOBAL OUTLOOK', 'GLOBAL MARKET', 'WORLD MARKET', 'GERMANY', 'FRANCE', 'KOREA',
    'VIETNAM', 'BRAZIL', 'MEXICO', 'LONDON', 'TOKYO', 'SHANGHAI', 'BEIJING', 'SYDNEY',
    'TORONTO', 'DUBAI', 'OTTAWA', 'CALGARY', 'EDMONTON', 'EMEA',
    'TAIWAN', 'INDONESIA', 'MALAYSIA', 'THAILAND', 'PHILIPPINES', 'SAUDI ARABIA',
    'PUERTO RICO', 'GUAM', 'U.S. VIRGIN ISLANDS'
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
    'nato', 'sanctions', 'diplomatic'
];

// Non-industrial property types to exclude
export const EXCLUDE_NON_INDUSTRIAL = [
    'office lease', 'office building', 'office tower', 'coworking',
    'multifamily', 'apartment', 'residential', 'condo',
    'retail', 'restaurant', 'shopping center', 'mall',
    'hotel', 'hospitality', 'resort',
    'self-storage', 'mini storage',
    'senior living', 'nursing home', 'medical office'
];

// Industrial property keywords
export const INDUSTRIAL_PROPERTY_KEYWORDS = [
    'warehouse', 'logistics', 'distribution', 'manufacturing', 'cold storage',
    'last-mile', 'last mile', 'industrial outdoor storage', 'ios', 'industrial land',
    'fulfillment', 'flex space', 'spec industrial', 'industrial park', 'loading dock'
];

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
    'commercial real estate', 'cre', 'vacancy', 'absorption', 'rent growth', 'cap rate'
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

// Approved source domains for newsletter
export const APPROVED_DOMAINS = [
    'bisnow.com', 'globest.com', 'costar.com', 'reuters.com', 'apnews.com',
    'bloomberg.com', 'wsj.com', 'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com',
    'bizjournals.com', 'traded.co', 're-nj.com', 'njbiz.com', 'lvb.com', 'naiop.org',
    'naiopnj.org', 'cpexecutive.com', 'commercialcafe.com', 'freightwaves.com',
    'areadevelopment.com', 'connectcre.com', 'therealdeal.com', 'rejournals.com',
    'credaily.com', 'supplychaindive.com',
    'rebusinessonline.com', 'mhlnews.com', 'dcvelocity.com',
    'inboundlogistics.com', 'supplychainbrain.com', 'ttnews.com',
    'logisticsviewpoints.com', 'commercialobserver.com', 'roi-nj.com',
    'njspotlightnews.org', 'connect.media', 'constructiondive.com',
    'naikeystone.com', 'naiplatform.com', 'prologis.com', 'retaildive.com',
    'prnewswire.com', 'globenewswire.com', 'businesswire.com'
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
    "refinance", "mortgage", "loan", "financing"
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
    "washington dc", "washington, dc", "washington, d.c.", "d.c."
];
