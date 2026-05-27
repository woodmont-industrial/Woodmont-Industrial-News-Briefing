import { execFile, spawn } from 'node:child_process';

function validateBrowserUrl(url: string): string {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    return parsed.toString();
}

// Browser opening utility. Returns Promise<void> — any error (invalid URL,
// failed spawn) surfaces as a rejection so callers can log/handle it.
export function openBrowser(url: string): Promise<void> {
    // Wrap validation inside the Promise executor so an invalid URL becomes a
    // rejected promise instead of a synchronous throw. Otherwise callers using
    // `openBrowser(bad).catch(h)` would never see h fire because the throw
    // escapes before any Promise is created.
    return new Promise((resolve, reject) => {
        let safeUrl: string;
        try {
            safeUrl = validateBrowserUrl(url);
        } catch (err) {
            reject(err);
            return;
        }

        if (process.platform === 'win32') {
            execFile('cmd', ['/c', 'start', '', safeUrl], (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
            return;
        }

        const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
        const child = spawn(command, [safeUrl], { shell: false, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => resolve());
    });
}
