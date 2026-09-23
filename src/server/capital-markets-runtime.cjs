'use strict';

/**
 * Node adapter for the browser-neutral Capital Markets factory.
 *
 * The classifier itself remains in docs/js/capital-markets.js so the website
 * preview and server-side shadow/canary path execute the exact same rules. The
 * few shared helper tables still live in docs/index.html; this adapter extracts
 * that explicitly delimited helper block and fails closed if either anchor
 * moves. Geography is loaded from local repository JSON, never over the
 * network. Nothing in this file sends email or reads recipient configuration.
 */

const fs = require('fs');
const path = require('path');

function loadSharedHelpers(docsDir) {
  const htmlPath = path.join(docsDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.indexOf('    const HTML_ESCAPE_MAP');
  const end = html.indexOf('    const NewsletterPreview = (');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Capital Markets shared-helper anchors not found in docs/index.html');
  }
  const src = html.slice(start, end);
  const names = ['escapeHtml', 'escapeAttr', 'safeUrl', 'firstSentences', 'splitSentences',
    'getPublisherName', 'US_STATE_NAMES', 'REGION_TARGETS', 'REGION_CITIES', 'REGION_AREAS',
    'REGION_NON_TARGET_CITIES', 'REGION_AMBIGUOUS_CITIES', 'regionPad', 'regionHas',
    'regionScan', 'regionMaskOrigins', 'resolveRegion'];
  // This evaluates repository-owned source only. No feed, CSV, secret or other
  // runtime input is concatenated into the function body.
  const fn = new Function(src + '\nreturn {' + names.join(',') + '};');
  return fn();
}

async function loadCapitalMarketsRuntime(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..');
  const docsDir = options.docsDir || path.join(repoRoot, 'docs');
  const shared = loadSharedHelpers(docsDir);
  const geography = JSON.parse(fs.readFileSync(path.join(docsDir, 'capital-markets-geography.json'), 'utf8'));
  const places = JSON.parse(fs.readFileSync(path.join(docsDir, 'capital-markets-places.json'), 'utf8'));
  const modulePath = path.join(docsDir, 'js', 'capital-markets.js');
  const { createCapitalMarkets } = require(modulePath);
  if (typeof createCapitalMarkets !== 'function') {
    throw new Error('Capital Markets factory did not load');
  }

  const priorFetch = globalThis.fetch;
  globalThis.fetch = async resource => {
    const name = String(resource || '');
    if (name.endsWith('capital-markets-geography.json')) {
      return { ok: true, status: 200, json: async () => geography };
    }
    if (name.endsWith('capital-markets-places.json')) {
      return { ok: true, status: 200, json: async () => places };
    }
    throw new Error('Capital Markets runtime blocked unexpected fetch: ' + name);
  };

  try {
    const CM = createCapitalMarkets(shared);
    await CM.cmLoadGeography();
    if (!CM.cmGeo || CM.cmGeo.status !== 'ready') {
      throw new Error('Capital Markets geography failed to load');
    }
    return { CM, shared, docsDir, repoRoot };
  } finally {
    globalThis.fetch = priorFetch;
  }
}

module.exports = { loadCapitalMarketsRuntime, loadSharedHelpers };
