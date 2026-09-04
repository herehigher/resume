export const DEPLOYMENT_ORIGIN = 'https://herehigher.github.io/resume/';

export const DEPLOYMENT_PATH_CONTRACTS = Object.freeze([
  Object.freeze({
    artifactPath: 'index.html', canonical: DEPLOYMENT_ORIGIN, kind: 'html', lang: 'ja', marker: '<title>', semantic: 'public-document', urlPath: ''
  }),
  Object.freeze({
    artifactPath: 'ja/index.html', canonical: DEPLOYMENT_ORIGIN, kind: 'html', lang: 'ja', marker: '<title>', semantic: 'compatibility-document', urlPath: 'ja/'
  }),
  Object.freeze({
    artifactPath: 'zh-cn/index.html', canonical: `${DEPLOYMENT_ORIGIN}zh-cn/`, kind: 'html', lang: 'zh-CN', marker: '<title>', semantic: 'public-document', urlPath: 'zh-cn/'
  }),
  Object.freeze({
    artifactPath: 'en/index.html', canonical: `${DEPLOYMENT_ORIGIN}en/`, kind: 'html', lang: 'en', marker: '<title>', semantic: 'public-document', urlPath: 'en/'
  }),
  Object.freeze({
    artifactPath: 'editor/index.html', canonical: `${DEPLOYMENT_ORIGIN}editor/`, kind: 'html', lang: 'ja', marker: '<title>', semantic: 'editor-document', urlPath: 'editor/'
  }),
  Object.freeze({
    artifactPath: 'sitemap.xml', kind: 'xml', marker: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', semantic: 'sitemap', urlPath: 'sitemap.xml'
  }),
  Object.freeze({
    artifactPath: 'schema/resume-studio-web-v1.schema.json', kind: 'json', marker: '"title": "Resume Studio web v1 export"', semantic: 'json-schema', urlPath: 'schema/resume-studio-web-v1.schema.json'
  }),
  Object.freeze({
    artifactPath: 'schema/resume-studio-web-v1.example.json', kind: 'json', marker: '"documents":', semantic: 'import-example', urlPath: 'schema/resume-studio-web-v1.example.json'
  }),
  Object.freeze({
    artifactPath: 'assets/js/config.js', kind: 'javascript', marker: 'export const APP_VERSION = ', semantic: 'version-config', urlPath: 'assets/js/config.js'
  })
]);

function isContract(value) {
  return value
    && typeof value.artifactPath === 'string'
    && typeof value.kind === 'string'
    && typeof value.marker === 'string'
    && typeof value.semantic === 'string'
    && typeof value.urlPath === 'string';
}

const seenArtifactPaths = new Set();
const seenUrlPaths = new Set();
for (const contract of DEPLOYMENT_PATH_CONTRACTS) {
  if (!isContract(contract)
    || contract.artifactPath.startsWith('/')
    || contract.artifactPath.includes('..')
    || contract.urlPath.startsWith('/')) {
    throw new Error('Deployment path contract contains an invalid path');
  }
  if (seenArtifactPaths.has(contract.artifactPath) || seenUrlPaths.has(contract.urlPath)) {
    throw new Error('Deployment path contract contains duplicate paths');
  }
  seenArtifactPaths.add(contract.artifactPath);
  seenUrlPaths.add(contract.urlPath);
}

export function deploymentPathsFor(semantic) {
  return DEPLOYMENT_PATH_CONTRACTS.filter((contract) => contract.semantic === semantic);
}

export function publicDocumentContracts() {
  return deploymentPathsFor('public-document');
}

export function htmlDocumentContracts() {
  return DEPLOYMENT_PATH_CONTRACTS.filter((contract) => contract.kind === 'html');
}

export function documentUrlPaths(basePath = '/') {
  const prefix = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  return new Set(htmlDocumentContracts().flatMap((contract) => {
    const directoryPath = `/${contract.urlPath}`;
    if (!contract.urlPath) return [`${prefix}/`, `${prefix}/index.html`];
    return [`${prefix}${directoryPath}`, `${prefix}${directoryPath}index.html`];
  }));
}
