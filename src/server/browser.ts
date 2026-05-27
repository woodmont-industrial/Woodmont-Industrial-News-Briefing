import { execFile, spawn } from 'node:child_process';

function validateBrowserUrl(url: string): string {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    return parsed.toString();
}

// Browser opening utility
export function openBrowser(url: string): Promise<void> {
    const safeUrl = validateBrowserUrl(url);

    if (process.platform === 'win32') {
        return new Promise((resolve, reject) => {
            execFile('cmd', ['/c', 'start', '', safeUrl], (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';

    return new Promise((resolve, reject) => {
        const child = spawn(command, [safeUrl], { shell: false, stdio: 'ignore' });

        child.once('error', reject);
        child.once('spawn', () => {
            resolve();
        });
    });
}
