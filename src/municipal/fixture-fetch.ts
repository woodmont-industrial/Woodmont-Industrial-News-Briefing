import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MunicipalFetch } from './types.js';

const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'official');

const FIXTURE_ROUTES: Record<string, { file: string; contentType: string }> = {
    'example.gov/planning-board/': { file: 'planning-board.html', contentType: 'text/html; charset=utf-8' },
    'example.gov/records/2026-09-15-warehouse-site-plan.html': { file: 'warehouse-site-plan.html', contentType: 'text/html; charset=utf-8' },
    'example.gov/records/2026-09-20-data-center-ordinance.html': { file: 'data-center-ordinance.html', contentType: 'text/html; charset=utf-8' },
    'webapi.legistar.com/v1/example-town/events': { file: 'legistar-events.json', contentType: 'application/json; charset=utf-8' },
    'records.example.gov/legistar/42-industrial-redevelopment-minutes.html': { file: 'industrial-redevelopment-minutes.html', contentType: 'text/html; charset=utf-8' },
    'records.example.gov/legistar/43-parks-agenda.html': { file: 'parks-agenda.html', contentType: 'text/html; charset=utf-8' },
};

export function createMunicipalFixtureFetch(): MunicipalFetch {
    return async (input: string): Promise<Response> => {
        const url = new URL(input);
        const route = FIXTURE_ROUTES[`${url.hostname}${url.pathname}`];
        if (!route) return new Response('Fixture not found', { status: 404, statusText: 'Not Found' });
        const body = fs.readFileSync(path.join(FIXTURE_ROOT, route.file));
        return new Response(body, {
            status: 200,
            headers: {
                'content-type': route.contentType,
                'content-length': String(body.byteLength),
            },
        });
    };
}
