import type { NormalizedItem } from '../src/types/index.js';

/** Paired public-publisher fixtures. Names and property addresses are synthetic. */
export function editorialRubricCases(asOf: Date) {
    const item = (id: string, title: string, description: string, approve: boolean, extra: Record<string, unknown> = {}) => ({
        approve,
        article: { id, title, description, source: 'CommercialSearch', category: 'relevant',
            link: `https://www.commercialsearch.com/news/synthetic-${id}/`,
            pubDate: new Date(asOf.getTime() - 86400000).toISOString(), ...extra } as NormalizedItem,
    });
    return [
        item('editorial-trade', 'Which Trade Disruptions Are Reshaping Industrial Demand?',
            'CommercialSearch editorial research on US national warehouse demand, inventory strategies and industrial leasing. This is a market analysis, not a property listing.', true),
        item('listing-same-publisher', '1600 Sample Road - Industrial for Lease - CommercialSearch',
            'A property listing for a warehouse at 1600 Sample Road, Dallas, Texas. It is not market research.', false,
            { link: 'https://www.commercialsearch.com/commercial-property/us/tx/dallas/synthetic-warehouse/' }),
        item('national-comparison', 'Industrial Boomtowns: The U.S. Metros Where Logistics and Warehousing Grew Fastest',
            'National industrial real estate research compares US metropolitan warehouse growth, employment and logistics demand. Dallas and Phoenix are comparison markets, not the location of a single property deal.', true),
        item('out-of-region-deal', 'Example Buyer buys 200,000 SF warehouse in Dallas, Texas for $50M',
            'The warehouse is in Dallas, Texas. The buyer has headquarters in Edison NJ. This is one Texas property transaction, not a national market report.', false,
            { category: 'transactions' }),
        item('pa-corridor-report', 'Industrial vacancy rises along Pennsylvania I-78/I-81 corridor, but market remains strong',
            'A Lehigh Valley Business market report measures industrial vacancy and warehouse leasing in the Pennsylvania I-78/I-81 corridor including Lehigh Valley and central Pennsylvania.', true,
            { source: 'Lehigh Valley Business', link: 'https://lvb.com/synthetic-pa-corridor-report/' }),
        item('va-corridor-property', 'Example Buyer acquires 200,000 SF warehouse along I-81 in Virginia for $50M',
            'The industrial warehouse sale is in Virginia. The article is a specific property sale, not a Pennsylvania corridor market report.', false,
            { category: 'transactions' }),
        item('nonprofit-warehouse', 'Former football coach partners with Florida charity at New Life Warehouse',
            'The nonprofit distributes donated furniture to families. The story is about a charity partnership, not an industrial real estate transaction, facility development or CRE market analysis.', false),
        item('dc-opposition', 'Florida county considers moratorium on data center development',
            'Local opponents are seeking a ban and development freeze over noise concerns.', false),
        item('target-warehouse', 'Example Tenant leases 120,000 SF industrial warehouse in Edison NJ',
            'A 120,000 SF industrial warehouse lease in Edison NJ has been signed by Example Tenant.', true,
            { category: 'transactions', source: 'REBusinessOnline', link: 'https://rebusinessonline.com/synthetic-edison-lease/' }),
        item('stale-national-report', 'US industrial warehouse demand improves in national market report',
            'A national industrial market analysis discusses warehouse leasing and logistics demand.', false,
            { pubDate: new Date(asOf.getTime() - 12 * 86400000).toISOString() }),
    ];
}
