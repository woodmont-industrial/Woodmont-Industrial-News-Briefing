import * as fs from 'node:fs';
import * as path from 'node:path';
import { MUNICIPAL_SCHEMA_VERSION, MunicipalRunReport, MunicipalShadowState } from './types.js';

export function assertSafeShadowOutput(outputDir: string, repositoryRoot = process.cwd()): string {
    const absolute = path.resolve(outputDir);
    const root = path.resolve(repositoryRoot);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    if (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative)) {
        const top = relative.split('/')[0];
        if (!(top === '.municipal-shadow' || top.startsWith('.municipal-shadow-'))) {
            throw new Error('In-repository municipal output must be inside .municipal-shadow/ (gitignored)');
        }
    }
    return absolute;
}

function readCollection<T>(outputDir: string, filename: string, key: string): T[] {
    const file = path.join(outputDir, filename);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (parsed.schemaVersion !== MUNICIPAL_SCHEMA_VERSION || !Array.isArray(parsed[key])) {
        throw new Error(`Invalid municipal shadow state file: ${file}`);
    }
    return parsed[key] as T[];
}

export function loadMunicipalShadowState(outputDir: string): MunicipalShadowState {
    if (!fs.existsSync(outputDir)) return { documents: [], candidates: [], events: [], projects: [] };
    return {
        documents: readCollection(outputDir, 'documents.json', 'documents'),
        candidates: readCollection(outputDir, 'candidates.json', 'candidates'),
        events: readCollection(outputDir, 'events.json', 'events'),
        projects: readCollection(outputDir, 'projects.json', 'projects'),
    };
}

function atomicJsonWrite(file: string, value: unknown): void {
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, file);
}

export function saveMunicipalShadowState(
    outputDir: string,
    state: MunicipalShadowState,
    report: MunicipalRunReport,
): void {
    fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    atomicJsonWrite(path.join(outputDir, 'documents.json'), {
        schemaVersion: MUNICIPAL_SCHEMA_VERSION,
        documents: state.documents,
    });
    atomicJsonWrite(path.join(outputDir, 'candidates.json'), {
        schemaVersion: MUNICIPAL_SCHEMA_VERSION,
        candidates: state.candidates,
    });
    atomicJsonWrite(path.join(outputDir, 'events.json'), {
        schemaVersion: MUNICIPAL_SCHEMA_VERSION,
        events: state.events,
    });
    atomicJsonWrite(path.join(outputDir, 'projects.json'), {
        schemaVersion: MUNICIPAL_SCHEMA_VERSION,
        projects: state.projects,
    });
    atomicJsonWrite(path.join(outputDir, 'run-report.json'), report);
}
