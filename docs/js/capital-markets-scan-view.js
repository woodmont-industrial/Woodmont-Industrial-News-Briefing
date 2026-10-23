(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CapitalMarketsScanView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const sections = {
    sales: 'Sales', leases: 'Leases', availabilities: 'Availabilities',
    construction: 'Construction', municipal: 'Municipal & entitlement', intel: 'Market intelligence'
  };
  const tiers = { TARGET: 'Target market', BROADER: 'Broader market', NATIONAL: 'National', UNMAPPED: 'Location unconfirmed' };
  const day = 86400000;
  function safeLink(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; }
    catch { return false; }
  }
  function formatDate(value, timeZone = 'America/New_York') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone
    }).format(date) : 'Date unavailable';
  }
  function formatCollectedAt(value) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/New_York' }).format(new Date(value));
  }
  function formatAmount(hit) {
    if (hit.section === 'sales' && Number(hit.priceUsd) > 0) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
        notation: 'compact', maximumFractionDigits: 2 }).format(hit.priceUsd);
    }
    return Number(hit.squareFeet) > 0 ? Number(hit.squareFeet).toLocaleString('en-US') + ' SF' : 'Figure not stated';
  }
  function buildView(scan, filters = {}, now = Date.now()) {
    const completed = Date.parse(scan && scan.completedAt);
    const valid = !!scan && scan.version === 2 && Number.isFinite(completed)
      && completed <= Number(now) + 5 * 60000 && Array.isArray(scan.hits)
      && Number.isFinite(scan.lookbackDays) && scan.lookbackDays > 0
      && scan.hits.every(h => h && sections[h.section] && tiers[h.tier] && safeLink(h.link)
        && typeof h.title === 'string' && typeof h.source === 'string'
        && Number.isFinite(Date.parse(h.publishedAt)) && Date.parse(h.publishedAt) <= completed);
    if (!valid) return { valid: false, hits: [], counts: {}, total: 0 };
    const counts = Object.fromEntries(Object.keys(sections).map(section => [section, 0]));
    scan.hits.forEach(hit => counts[hit.section]++);
    const requestedDays = Number(filters.days);
    const days = requestedDays > 0 ? Math.min(requestedDays, scan.lookbackDays) : scan.lookbackDays;
    const query = String(filters.query || '').toLowerCase().trim();
    const hits = scan.hits.filter(hit => completed - Date.parse(hit.publishedAt) <= days * day
      && (!filters.section || hit.section === filters.section)
      && (!filters.tier || hit.tier === filters.tier)
      && (!query || [hit.title, hit.source, hit.evidence].join(' ').toLowerCase().includes(query)))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const health = scan.sourceHealth || {};
    return { valid: true, hits, counts, total: scan.hits.length, days,
      stale: Number(now) - completed > day,
      newTitles: new Set(scan.newSinceLastScan || []),
      unavailable: (health.refused || 0) + (health.transient || 0) + (health.cooling || 0) };
  }
  return { sections, tiers, safeLink, formatDate, formatCollectedAt, formatAmount, buildView };
});
