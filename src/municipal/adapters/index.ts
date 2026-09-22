import { MunicipalSourceAdapter, MunicipalSourceConfig } from '../types.js';
import { HtmlMunicipalAdapter } from './html.js';
import { LegistarMunicipalAdapter } from './legistar.js';

const ADAPTERS: Record<MunicipalSourceConfig['type'], MunicipalSourceAdapter> = {
    html: new HtmlMunicipalAdapter(),
    legistar: new LegistarMunicipalAdapter(),
};

export function municipalAdapterFor(type: MunicipalSourceConfig['type']): MunicipalSourceAdapter {
    const adapter = ADAPTERS[type];
    if (!adapter) throw new Error(`No municipal source adapter registered for ${type}`);
    return adapter;
}

export { HtmlMunicipalAdapter } from './html.js';
export { LegistarMunicipalAdapter } from './legistar.js';
