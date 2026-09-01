import { createHash } from 'node:crypto';
import { appendFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OFFICIAL_REPOSITORY = 'herehigher/resume';
export const CLOUDFLARE_PROVIDER = 'cloudflare-web-analytics';
export const CLOUDFLARE_BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';
export const CLOUDFLARE_RUM_URL = 'https://cloudflareinsights.com/cdn-cgi/rum';

const adapterPath = fileURLToPath(import.meta.url);
const digestPattern = /^[0-9a-f]{64}$/;
const cloudflareTokenPattern = /^[0-9a-f]{32}$/;
const htmlPaths = Object.freeze([
  'en/index.html',
  'index.html',
  'ja/index.html',
  'zh-cn/index.html'
]);
const disclosureCopy = Object.freeze({
  'en/index.html': Object.freeze({
    disabled: 'Analytics is disabled in this source build. It makes no analytics requests.',
    enabled: 'This official release uses cookie-free Cloudflare Web Analytics for aggregate page views and performance.'
  }),
  'index.html': Object.freeze({
    disabled: 'この source build では Analytics は無効で、解析用の外部 request は発生しません。',
    enabled: 'この公式 release は、集計 page view と performance のため Cookie を使わない Cloudflare Web Analytics を利用します。'
  }),
  'ja/index.html': Object.freeze({
    disabled: 'この source build では Analytics は無効で、解析用の外部 request は発生しません。',
    enabled: 'この公式 release は、集計 page view と performance のため Cookie を使わない Cloudflare Web Analytics を利用します。'
  }),
  'zh-cn/index.html': Object.freeze({
    disabled: '此 source build 未启用 Analytics，不会发出统计用外部请求。',
    enabled: '此官方 release 使用不设 Cookie 的 Cloudflare Web Analytics 汇总页面访问量与性能。'
  })
});

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalRelativePath(value) {
  if (!value || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  return path.posix.normalize(value) === value
    && !value.split('/').some((part) => !part || part === '.' || part === '..');
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) fail(`Symbolic links are not allowed: ${entry.name}`);
    if (metadata.isDirectory()) {
      files.push(...await collectFiles(root, absolutePath));
      continue;
    }
    if (!metadata.isFile()) fail(`Unsupported file type: ${entry.name}`);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    if (!canonicalRelativePath(relativePath)) fail(`Non-canonical artifact path: ${relativePath}`);
    files.push({ absolutePath, relativePath });
  }
  return files.sort((left, right) => compareUtf8(left.relativePath, right.relativePath));
}

export async function computeTreeDigest(directory) {
  const hash = createHash('sha256');
  for (const { absolutePath, relativePath } of await collectFiles(directory)) {
    const contents = await readFile(absolutePath);
    hash.update(Buffer.from(relativePath, 'utf8'));
    hash.update('\0');
    hash.update(String(contents.byteLength));
    hash.update('\0');
    hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} contains unknown or missing fields`);
  }
}

export function validateManifest(value) {
  exactKeys(value, [
    'analyticsMode',
    'analyticsProvider',
    'artifactTreeSha256',
    'providerTokenSha256',
    'schemaVersion',
    'sourceTreeSha256'
  ], 'Pages release manifest');
  if (value.schemaVersion !== 1) fail('Unsupported Pages release manifest schemaVersion');
  if (!digestPattern.test(value.sourceTreeSha256) || !digestPattern.test(value.artifactTreeSha256)) {
    fail('Pages release manifest tree digests must be lowercase SHA-256 values');
  }
  const disabled = value.analyticsMode === 'disabled'
    && value.analyticsProvider === 'none'
    && value.providerTokenSha256 === null;
  const cloudflare = value.analyticsMode === 'enabled'
    && value.analyticsProvider === CLOUDFLARE_PROVIDER
    && typeof value.providerTokenSha256 === 'string'
    && digestPattern.test(value.providerTokenSha256);
  if (!disabled && !cloudflare) fail('Unsupported analytics mode/provider/fingerprint tuple');
  return Object.freeze({ ...value });
}

async function readManifest(manifestPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    fail('Pages release manifest is missing or invalid JSON');
  }
  return validateManifest(parsed);
}

function analyticsAttributes(mode, provider) {
  return `data-analytics-mode="${mode}" data-analytics-provider="${provider}"`;
}

function disclosureElement(copy) {
  return `<span data-analytics-disclosure="status">${copy}</span>`;
}

function cloudflareScript(token) {
  const configuration = JSON.stringify({ token })
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return `<script type="module" src="${CLOUDFLARE_BEACON_URL}" data-cf-beacon="${configuration}"></script>`;
}

async function validateSourceSite(sourceDirectory) {
  const files = await collectFiles(sourceDirectory);
  const actualHtml = files
    .map(({ relativePath }) => relativePath)
    .filter((relativePath) => relativePath.endsWith('.html'));
  if (actualHtml.length !== htmlPaths.length || actualHtml.some((value, index) => value !== htmlPaths[index])) {
    fail('Source site must contain exactly the four canonical HTML paths');
  }
  for (const relativePath of htmlPaths) {
    const html = await readFile(path.join(sourceDirectory, relativePath), 'utf8');
    const openingTags = html.match(/<html\b[^>]*>/gi) || [];
    const sourceAttributes = analyticsAttributes('disabled', 'none');
    if (openingTags.length !== 1
      || !openingTags[0].includes(sourceAttributes)
      || html.split(sourceAttributes).length !== 2) {
      fail(`Source analytics attributes are missing or invalid: ${relativePath}`);
    }
    if (html.includes(CLOUDFLARE_BEACON_URL) || html.includes('data-cf-beacon')) {
      fail(`Source site already contains an analytics beacon: ${relativePath}`);
    }
    if ((html.match(/<\/body>/gi) || []).length !== 1) fail(`Source page has no unique closing body: ${relativePath}`);
    const disclosure = disclosureElement(disclosureCopy[relativePath].disabled);
    if (html.split(disclosure).length !== 2) fail(`Source analytics disclosure is missing or duplicated: ${relativePath}`);
  }
  return files;
}

async function assertOutputMissing(outputDirectory) {
  try {
    await lstat(outputDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  fail('Artifact output already exists; refusing to overwrite it');
}

async function transformCloudflareArtifact(directory, token) {
  if (!cloudflareTokenPattern.test(token || '')) fail('Cloudflare Web Analytics token is missing or invalid');
  for (const relativePath of htmlPaths) {
    const absolutePath = path.join(directory, relativePath);
    const source = await readFile(absolutePath, 'utf8');
    const disabledAttributes = analyticsAttributes('disabled', 'none');
    const enabledAttributes = analyticsAttributes('enabled', CLOUDFLARE_PROVIDER);
    const disabledDisclosure = disclosureElement(disclosureCopy[relativePath].disabled);
    const enabledDisclosure = disclosureElement(disclosureCopy[relativePath].enabled);
    if (source.split(disabledAttributes).length !== 2 || source.split(disabledDisclosure).length !== 2) {
      fail(`Artifact source markers are missing or duplicated: ${relativePath}`);
    }
    const withStatus = source
      .replace(disabledAttributes, enabledAttributes)
      .replace(disabledDisclosure, enabledDisclosure);
    const closingBody = withStatus.lastIndexOf('</body>');
    if (closingBody < 0) fail(`Artifact page has no closing body: ${relativePath}`);
    const transformed = `${withStatus.slice(0, closingBody)}  ${cloudflareScript(token)}\n${withStatus.slice(closingBody)}`;
    await writeFile(absolutePath, transformed);
  }
}

export async function deriveCloudflareArtifact({ sourceDirectory, token }) {
  if (!cloudflareTokenPattern.test(token || '')) fail('Cloudflare Web Analytics token is missing or invalid');
  await validateSourceSite(sourceDirectory);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'resume-pages-artifact-'));
  const temporarySite = path.join(temporaryRoot, 'site');
  try {
    await cp(path.resolve(sourceDirectory), temporarySite, { errorOnExist: true, force: false, recursive: true });
    await transformCloudflareArtifact(temporarySite, token);
    const outputs = {
      adapter_digest: await adapterDigest(),
      final_digest: await computeTreeDigest(temporarySite),
      provider_fingerprint: sha256(token),
      source_digest: await computeTreeDigest(sourceDirectory)
    };
    await writeOutputs(outputs);
    return outputs;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function adapterDigest() {
  return sha256(await readFile(adapterPath));
}

async function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  await appendFile(process.env.GITHUB_OUTPUT, lines);
}

export async function validateReleaseSource({ manifestPath, sourceDirectory }) {
  const manifest = await readManifest(manifestPath);
  await validateSourceSite(sourceDirectory);
  const sourceDigest = await computeTreeDigest(sourceDirectory);
  if (sourceDigest !== manifest.sourceTreeSha256) fail('Source tree digest does not match the tagged manifest');
  const outputs = {
    adapter_digest: await adapterDigest(),
    analytics_mode: manifest.analyticsMode,
    analytics_provider: manifest.analyticsProvider,
    provider_fingerprint: manifest.providerTokenSha256 ?? 'none',
    source_digest: sourceDigest
  };
  await writeOutputs(outputs);
  return { manifest, ...outputs };
}

export async function prepareArtifact({
  manifestPath,
  outputDirectory,
  repository,
  sourceDirectory,
  token = ''
}) {
  const { manifest, source_digest: sourceDigest } = await validateReleaseSource({ manifestPath, sourceDirectory });
  if (repository !== OFFICIAL_REPOSITORY && manifest.analyticsMode === 'enabled') {
    fail('Enabled analytics artifacts are restricted to the official repository');
  }
  if (repository === OFFICIAL_REPOSITORY && manifest.analyticsMode === 'enabled') {
    if (!cloudflareTokenPattern.test(token)) fail('Cloudflare Web Analytics token is missing or invalid');
    if (sha256(token) !== manifest.providerTokenSha256) fail('Cloudflare Web Analytics token fingerprint mismatch');
  } else if (token) {
    fail('Analytics token must not be provided for this artifact mode');
  }

  const sourceAbsolute = path.resolve(sourceDirectory);
  const outputAbsolute = path.resolve(outputDirectory);
  if (sourceAbsolute === outputAbsolute
    || outputAbsolute.startsWith(`${sourceAbsolute}${path.sep}`)
    || sourceAbsolute.startsWith(`${outputAbsolute}${path.sep}`)) {
    fail('Artifact output must be outside the source tree');
  }
  const outputParent = path.dirname(outputAbsolute);
  await mkdir(outputParent, { recursive: true });
  await assertOutputMissing(outputAbsolute);
  const stagingRoot = await mkdtemp(path.join(outputParent, `.${path.basename(outputAbsolute)}.tmp-`));
  const temporaryOutput = path.join(stagingRoot, 'artifact');
  try {
    await cp(sourceAbsolute, temporaryOutput, { errorOnExist: true, force: false, recursive: true });
    await validateSourceSite(temporaryOutput);
    if (manifest.analyticsMode === 'enabled') await transformCloudflareArtifact(temporaryOutput, token);
    const finalDigest = await computeTreeDigest(temporaryOutput);
    if (finalDigest !== manifest.artifactTreeSha256) fail('Prepared artifact digest does not match the tagged manifest');
    await assertOutputMissing(outputAbsolute);
    await rename(temporaryOutput, outputAbsolute);
    const outputs = { final_digest: finalDigest, source_digest: sourceDigest };
    await writeOutputs(outputs);
    return { finalDigest, manifest, sourceDigest };
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}

export async function verifyArtifact({ directory, manifestPath }) {
  const manifest = await readManifest(manifestPath);
  const finalDigest = await computeTreeDigest(directory);
  if (finalDigest !== manifest.artifactTreeSha256) fail('Final artifact digest changed after preparation');
  await writeOutputs({ final_digest: finalDigest });
  return finalDigest;
}

function parseArguments(values) {
  const [command, ...args] = values;
  if (!['derive-cloudflare', 'prepare', 'validate', 'verify'].includes(command)) {
    fail('Expected derive-cloudflare, validate, prepare, or verify command');
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('Invalid command arguments');
    const key = name.slice(2);
    if (!['directory', 'manifest', 'output', 'repository', 'source'].includes(key) || key in options) {
      fail('Unknown or duplicate command argument');
    }
    options[key] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'derive-cloudflare') {
    if (!options.source || Object.keys(options).length !== 1) fail('derive-cloudflare requires only --source');
    await deriveCloudflareArtifact({
      sourceDirectory: options.source,
      token: process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || ''
    });
    return;
  }
  if (command === 'validate') {
    if (!options.source || !options.manifest) fail('validate requires --source and --manifest');
    await validateReleaseSource({ manifestPath: options.manifest, sourceDirectory: options.source });
    return;
  }
  if (command === 'verify') {
    if (!options.directory || !options.manifest) fail('verify requires --directory and --manifest');
    await verifyArtifact({ directory: options.directory, manifestPath: options.manifest });
    return;
  }
  if (!options.source || !options.output || !options.manifest || !options.repository) {
    fail('prepare requires --source, --output, --manifest, and --repository');
  }
  await prepareArtifact({
    manifestPath: options.manifest,
    outputDirectory: options.output,
    repository: options.repository,
    sourceDirectory: options.source,
    token: process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || ''
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === adapterPath) {
  try {
    await main();
  } catch (error) {
    console.error(`Pages artifact preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
