import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMunicipalConfig } from '../src/municipal/config.js';
import { createMunicipalFixtureFetch } from '../src/municipal/fixture-fetch.js';
import { runMunicipalShadow } from '../src/municipal/runner.js';

interface CliOptions {
    configPath: string | null;
    outputDir: string | null;
    fixture: boolean;
    help: boolean;
}

function parseArgs(args: string[]): CliOptions {
    const options: CliOptions = { configPath: null, outputDir: null, fixture: false, help: false };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--fixture') options.fixture = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg === '--config' || arg === '--output') {
            const value = args[++i];
            if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path`);
            if (arg === '--config') options.configPath = value;
            else options.outputDir = value;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    if (options.fixture && options.configPath) throw new Error('--fixture and --config cannot be used together');
    return options;
}

function usage(): string {
    return [
        'Municipal Intelligence shadow runner',
        '',
        'Private config:',
        '  npm run municipal:shadow -- --config /path/to/municipal.private.json',
        '',
        'Offline fixture:',
        '  npm run municipal:fixture',
        '',
        'Options:',
        '  --output <path>  Override the private shadow output directory',
    ].join('\n');
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const configPath = options.fixture
        ? path.join(repositoryRoot, 'config', 'municipal.example.json')
        : options.configPath;
    if (!configPath) throw new Error('Missing --config. Use --fixture for the offline demonstration.');
    const outputDir = options.outputDir || path.join(repositoryRoot, '.municipal-shadow', options.fixture ? 'fixture' : 'current');
    const config = loadMunicipalConfig(configPath);
    const result = await runMunicipalShadow(config, {
        outputDir,
        ...(options.fixture ? { fetcher: createMunicipalFixtureFetch() } : {}),
    });
    console.log(JSON.stringify({ outputDir, ...result.report }, null, 2));
}

main().catch(error => {
    console.error(`Municipal shadow run failed: ${(error as Error).message}`);
    process.exitCode = 1;
});
