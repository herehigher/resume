import { createHash } from 'node:crypto';
import { appendFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { htmlDocumentContracts } from './deployment-path-contract.mjs';

export const ANALYTICS_DELIVERY_CONTRACT = 'hosting-managed';

const adapterPath = fileURLToPath(import.meta.url);
const htmlPaths = Object.freeze(htmlDocumentContracts().map(({ artifactPath }) => artifactPath).sort(compareUtf8));

function fail(message) {
  throw new Error(message);
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
  exactKeys(value, ['analyticsDelivery', 'schemaVersion'], 'Pages release manifest');
  if (value.schemaVersion !== 3) fail('Unsupported Pages release manifest schemaVersion');
  if (value.analyticsDelivery !== ANALYTICS_DELIVERY_CONTRACT) fail('Unsupported analytics delivery contract');
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

async function validateSourceSite(sourceDirectory) {
  const files = await collectFiles(sourceDirectory);
  const actualHtml = files
    .map(({ relativePath }) => relativePath)
    .filter((relativePath) => relativePath.endsWith('.html'));
  if (actualHtml.length !== htmlPaths.length || actualHtml.some((value, index) => value !== htmlPaths[index])) {
    fail('Source site must contain exactly the public and editor HTML paths');
  }
  for (const relativePath of htmlPaths) {
    const html = await readFile(path.join(sourceDirectory, relativePath), 'utf8');
    const openingTags = html.match(/<html\b[^>]*>/gi) || [];
    if (openingTags.length !== 1) fail(`Source page must contain one html element: ${relativePath}`);
    if (/\bdata-analytics-(?:mode|provider|disclosure)\s*=/i.test(html)) {
      fail(`Source page contains legacy analytics state: ${relativePath}`);
    }
    if (/\bdata-cf-beacon\s*=|cloudflareinsights\.com/i.test(html)) {
      fail(`Source page contains an application analytics beacon: ${relativePath}`);
    }
    if ((html.match(/\bdata-privacy-notice\b/g) || []).length !== 1) {
      fail(`Source privacy notice is missing or duplicated: ${relativePath}`);
    }
    if ((html.match(/<\/body>/gi) || []).length !== 1) fail(`Source page has no unique closing body: ${relativePath}`);
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

async function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  await appendFile(process.env.GITHUB_OUTPUT, lines);
}

export async function validateReleaseSource({ manifestPath, sourceDirectory }) {
  const manifest = await readManifest(manifestPath);
  await validateSourceSite(sourceDirectory);
  const sourceDigest = await computeTreeDigest(sourceDirectory);
  const outputs = {
    analytics_delivery: manifest.analyticsDelivery,
    source_digest: sourceDigest
  };
  await writeOutputs(outputs);
  return { manifest, ...outputs };
}

export async function prepareArtifact({
  manifestPath,
  outputDirectory,
  sourceDirectory
}) {
  const { manifest, source_digest: sourceDigest } = await validateReleaseSource({ manifestPath, sourceDirectory });

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
    const finalDigest = await computeTreeDigest(temporaryOutput);
    if (finalDigest !== sourceDigest) fail('Prepared artifact differs from the validated source bytes');
    await assertOutputMissing(outputAbsolute);
    await rename(temporaryOutput, outputAbsolute);
    const outputs = { final_digest: finalDigest, source_digest: sourceDigest };
    await writeOutputs(outputs);
    return { finalDigest, manifest, sourceDigest };
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
}

function parseArguments(values) {
  const [command, ...args] = values;
  if (!['prepare', 'validate'].includes(command)) {
    fail('Expected validate or prepare command');
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('Invalid command arguments');
    const key = name.slice(2);
    if (!['manifest', 'output', 'source'].includes(key) || key in options) {
      fail('Unknown or duplicate command argument');
    }
    options[key] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'validate') {
    if (!options.source || !options.manifest || Object.keys(options).length !== 2) fail('validate requires --source and --manifest');
    await validateReleaseSource({ manifestPath: options.manifest, sourceDirectory: options.source });
    return;
  }
  if (!options.source || !options.output || !options.manifest || Object.keys(options).length !== 3) {
    fail('prepare requires --source, --output, and --manifest');
  }
  await prepareArtifact({
    manifestPath: options.manifest,
    outputDirectory: options.output,
    sourceDirectory: options.source
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
