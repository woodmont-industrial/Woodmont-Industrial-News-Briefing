// Read-only OpenCLI adapter for the social pilot (2026-10-21).
//
// OpenCLI's built-in `instagram user` truncates captions to 100 characters and
// returns no post link, so a finding could never cite its post. This adapter reads
// the same endpoint and keeps what evidence needs: the full caption, the post code
// (permalink https://www.instagram.com/p/<code>/) and an ISO timestamp.
//
// Install: copy this folder to ~/.opencli/clis/woodmont-instagram/  (see scripts/social-pilot/SETUP.md)
// Run:     opencli woodmont-instagram posts <username> --limit 12 -f json
import { cli } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';

cli({
    site: 'woodmont-instagram',
    name: 'posts',
    access: 'read',
    description: 'Recent posts from an Instagram account with full caption, permalink code and ISO date (read-only)',
    domain: 'www.instagram.com',
    args: [
        { name: 'username', required: true, positional: true, help: 'Instagram username' },
        { name: 'limit', type: 'int', default: 12, help: 'Number of posts (max 24)' },
    ],
    columns: ['code', 'takenAt', 'type', 'caption'],
    browser: true,
    navigateBefore: false,
    func: async (page, kwargs) => {
        const username = String(kwargs.username);
        if (!/^[A-Za-z0-9_.]{1,30}$/.test(username)) throw new CommandExecutionError('invalid Instagram username');
        const limit = Math.max(1, Math.min(24, Number(kwargs.limit) || 12));
        await page.goto(`https://www.instagram.com/${encodeURIComponent(username)}/`);
        let result;
        try {
            result = await page.evaluate(`(async () => {
  try {
    const r = await fetch('https://www.instagram.com/api/v1/feed/user/' + encodeURIComponent(${JSON.stringify(username)}) + '/username/?count=' + ${limit},
      { credentials: 'include', headers: { 'X-IG-App-ID': '936619743392459' } });
    if (!r.ok) return { failure: 'HTTP ' + r.status };
    const d = await r.json();
    if (!d || !Array.isArray(d.items)) return { failure: 'malformed feed' };
    return { rows: d.items.slice(0, ${limit}).map(p => ({
      code: String(p.code || ''),
      takenAt: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : '',
      type: p.media_type === 1 ? 'photo' : p.media_type === 2 ? 'video' : 'carousel',
      caption: String((p.caption && p.caption.text) || ''),
    })) };
  } catch (e) { return { failure: String(e && e.message || e) }; }
})()`);
        } catch {
            throw new CommandExecutionError('Instagram page request failed (network or browser context)');
        }
        if (result && typeof result === 'object' && 'session' in result && 'data' in result) result = result.data;
        if (result && result.failure) {
            if (/HTTP (401|403)\b/.test(result.failure)) throw new AuthRequiredError('www.instagram.com', result.failure);
            throw new CommandExecutionError(result.failure, /HTTP 429\b/.test(result.failure)
                ? 'Instagram rate-limited this account. Wait before retrying; do not retry in a loop.' : undefined);
        }
        if (!result || !Array.isArray(result.rows)) throw new CommandExecutionError('Instagram returned an invalid read result');
        return result.rows;
    },
});
