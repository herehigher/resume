import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAllowedCloudflareAnalyticsRequest } from './cloudflare-analytics.mjs';
import { documentUrlPaths } from './deployment-path-contract.mjs';

const siteRoot = fileURLToPath(new URL('../site/', import.meta.url));
const documentPaths = documentUrlPaths();
const locales = new Set(['ja', 'zh-CN', 'en']);

function collectStaticPaths(directory = siteRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectStaticPaths(absolute);
    return [`/${path.relative(siteRoot, absolute).split(path.sep).join('/')}`];
  });
}

const staticPaths = new Set(collectStaticPaths());

function mountedPath(url, base) {
  const mount = base.pathname === '/' ? '' : base.pathname.replace(/\/$/, '');
  if (!url.pathname.startsWith(`${mount}/`) && url.pathname !== mount) return null;
  return url.pathname.slice(mount.length) || '/';
}

function isAllowedDocument(pathname, searchParams) {
  const query = [...searchParams.entries()];
  return documentPaths.has(pathname) && (query.length === 0 || (
    query.length === 1 && query[0][0] === 'lang' && locales.has(query[0][1])
  ));
}

export function requestDetails(request) {
  return {
    headers: request.headers(),
    method: request.method(),
    postData: request.postData(),
    resourceType: request.resourceType(),
    url: request.url()
  };
}

export function isAllowedNetworkRequest(request, { baseUrl, expectedToken = '' }) {
  const base = new URL(baseUrl);
  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return true;
  if (url.username || url.password || url.hash) return false;
  if (url.origin !== base.origin) {
    return isAllowedCloudflareAnalyticsRequest({ ...request, expectedOrigin: base.origin, expectedToken });
  }
  const pathname = mountedPath(url, base);
  if (request.method !== 'GET' || request.postData !== null || !pathname) return false;
  if (isAllowedDocument(pathname, url.searchParams)) return true;
  return staticPaths.has(pathname) && !url.search;
}

function requestSummary(request, baseUrl) {
  const url = new URL(request.url);
  const base = new URL(baseUrl);
  return `${request.method} ${url.origin === base.origin ? 'same-origin' : 'external'}`;
}

function decoded(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function includesCanary(request, canaries) {
  const values = [request.url, decoded(request.url), request.postData || '', decoded(request.postData || ''), ...Object.values(request.headers)];
  return canaries.some((canary) => values.some((value) => value.includes(canary)));
}

export function observeNetwork(context, { baseUrl, expectedToken = '' }) {
  const requests = [];
  const webSockets = [];
  const observeRequest = (request) => requests.push(requestDetails(request));
  const observedPages = new Set();
  const observePage = (page) => {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    page.on('websocket', observeWebSocket);
  };
  const observeWebSocket = (socket) => webSockets.push(socket.url());
  context.pages().forEach(observePage);
  context.on('request', observeRequest);
  context.on('page', observePage);

  return {
    requests,
    webSockets,
    assertClean({ canaries = [] } = {}) {
      const unexpected = requests.filter((request) => !isAllowedNetworkRequest(request, { baseUrl, expectedToken }));
      const leaked = requests.filter((request) => includesCanary(request, canaries));
      const failures = [];
      if (unexpected.length) failures.push(`unexpected request (${requestSummary(unexpected[0], baseUrl)})`);
      if (leaked.length) failures.push('resume canary appeared in a request URL or body');
      if (webSockets.length) failures.push('WebSocket connection');
      if (failures.length) throw new Error(`Network contract violation: ${failures.join('; ')}`);
    },
    dispose() {
      context.off('request', observeRequest);
      context.off('page', observePage);
      observedPages.forEach((page) => {
        page.off('websocket', observeWebSocket);
      });
    }
  };
}
