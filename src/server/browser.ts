// Browser opening utility
export function openBrowser(url: string) {
    const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    require('child_process').exec(`${start} "${url}"`);
}
