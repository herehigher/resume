import { DEPLOYMENT_ORIGIN } from './deployment-path-contract.mjs';

export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

export function hasApprovedContentSignal(value) {
  const signals = value.split(',').map((item) => item.trim().toLowerCase()).sort();
  return signals.length === 3 && signals.join(',') === 'ai-input=yes,ai-train=yes,search=yes';
}

export function assertRobotsPolicy(content) {
  const directives = content.split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean);
  const expected = `User-agent: *\nContent-Signal: ${CONTENT_SIGNAL}\nAllow: /\nSitemap: ${DEPLOYMENT_ORIGIN}sitemap.xml`;
  if (directives.join('\n') !== expected) {
    throw new Error('robots rules must allow crawling, declare the approved content signals, and reference the canonical sitemap');
  }
}

export function assertPagesContentHeaders(content) {
  const directives = content.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    .map((line) => line.trimEnd());
  const expected = `/*\n  Content-Signal: ${CONTENT_SIGNAL}\n/editor/*\n  X-Robots-Tag: noindex,follow`;
  if (directives.join('\n') !== expected) {
    throw new Error('Pages headers must declare the approved content signals globally and preserve editor noindex');
  }
}
