import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fullCommitPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const expectedOutputs = Object.freeze({
  en: Object.freeze({ paper: 'LETTER', pdfPath: 'output/pdf/en-letter.pdf', screenshotPath: 'docs/screenshots/en.png' }),
  ja: Object.freeze({ paper: 'A4', pdfPath: 'output/pdf/ja-a4.pdf', screenshotPath: 'docs/screenshots/ja.png' }),
  'zh-CN': Object.freeze({ paper: 'A4', pdfPath: 'output/pdf/zh-CN-a4.pdf', screenshotPath: 'docs/screenshots/zh-CN.png' })
});
const assetPaths = Object.freeze([
  ...Object.values(expectedOutputs).flatMap(({ pdfPath, screenshotPath }) => [pdfPath, screenshotPath]),
  'docs/assets-manifest.json'
]);

function fail(message) {
  throw new Error(`Release documentation assets failed: ${message}`);
}

function safePath(rootDirectory, relativePath) {
  if (!assetPaths.includes(relativePath)) fail(`unexpected asset path: ${relativePath}`);
  const absolute = path.resolve(rootDirectory, relativePath);
  if (!absolute.startsWith(`${path.resolve(rootDirectory)}${path.sep}`)) fail(`asset escapes its root: ${relativePath}`);
  return absolute;
}

async function readJson(file, label) {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`${label} is not a regular file`);
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.message?.startsWith('Release documentation assets failed:')) throw error;
    fail(`${label} is unavailable or invalid JSON`);
  }
}

function packageVersion(contents, label) {
  let version;
  try {
    version = JSON.parse(contents).version;
  } catch {
    fail(`${label} package metadata is invalid JSON`);
  }
  if (!versionPattern.test(version || '')) fail(`${label} package version is invalid`);
  return version;
}

function versionAt(cwd, commit) {
  if (!fullCommitPattern.test(commit || '')) fail('release asset classification requires full commit SHAs');
  try {
    return packageVersion(execFileSync('git', ['show', `${commit}:package.json`], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }), commit);
  } catch (error) {
    if (error.message?.startsWith('Release documentation assets failed:')) throw error;
    fail(`package version is unavailable at ${commit}`);
  }
}

export function releaseAssetsRequiredBetween(base, head, cwd = process.cwd()) {
  return versionAt(cwd, base) !== versionAt(cwd, head);
}

function outputRecords(manifest, label) {
  if (manifest.schemaVersion !== 2) fail(`${label} manifest schema is not current`);
  if (!versionPattern.test(manifest.source?.appVersion || '')) fail(`${label} app version is invalid`);
  if (!fullCommitPattern.test(manifest.source?.commit || '')) fail(`${label} source commit is invalid`);
  if (!/^[0-9a-f]{64}$/.test(manifest.source?.siteHash || '')) fail(`${label} site hash is invalid`);
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length !== 3) fail(`${label} must describe three locales`);
  const records = new Map();
  for (const output of manifest.outputs) {
    const expected = expectedOutputs[output.locale];
    if (!expected || records.has(output.locale)) fail(`${label} has an unexpected or duplicate locale`);
    if (output.paper !== expected.paper
      || output.pdf?.path !== expected.pdfPath
      || output.screenshot?.path !== expected.screenshotPath) {
      fail(`${label} output contract does not match ${output.locale}`);
    }
    records.set(output.locale, output);
  }
  return records;
}

async function recordedFileDigest(rootDirectory, relativePath) {
  const file = safePath(rootDirectory, relativePath);
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`asset is not a regular file: ${relativePath}`);
  const contents = await readFile(file);
  const pointer = contents.toString('utf8');
  if (pointer.startsWith('version https://git-lfs.github.com/spec/v1')) {
    const match = pointer.match(/^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize [1-9][0-9]*\n?$/);
    if (!match) fail(`Git LFS pointer is invalid: ${relativePath}`);
    return match[1];
  }
  return createHash('sha256').update(contents).digest('hex');
}

export async function compareReleaseAssets({ committedRoot = root, generatedRoot }) {
  if (!generatedRoot) fail('generated asset root is required');
  const generatedManifest = await readJson(path.join(generatedRoot, 'docs/assets-manifest.json'), 'generated manifest');
  const committedManifest = await readJson(path.join(committedRoot, 'docs/assets-manifest.json'), 'committed manifest');
  const version = packageVersion(await readFile(path.join(committedRoot, 'package.json'), 'utf8'), 'committed');
  const generated = outputRecords(generatedManifest, 'generated');
  const committed = outputRecords(committedManifest, 'committed');

  if (generatedManifest.source.appVersion !== version || committedManifest.source.appVersion !== version) {
    fail(`asset version does not match package version ${version}`);
  }
  if (generatedManifest.source.siteHash !== committedManifest.source.siteHash) {
    fail('committed assets were generated from different site bytes');
  }

  for (const locale of Object.keys(expectedOutputs)) {
    const generatedOutput = generated.get(locale);
    const committedOutput = committed.get(locale);
    for (const field of ['browserLocale', 'paper', 'firstText', 'lastText', 'marker']) {
      if (generatedOutput[field] !== committedOutput[field]) fail(`${locale} ${field} does not match`);
    }
    for (const kind of ['screenshot', 'pdf']) {
      const generatedRecord = generatedOutput[kind];
      const committedRecord = committedOutput[kind];
      if (JSON.stringify(generatedRecord) !== JSON.stringify(committedRecord)) {
        fail(`${locale} ${kind} metadata does not match`);
      }
      const expectedDigest = generatedRecord.sha256;
      if (!/^[0-9a-f]{64}$/.test(expectedDigest || '')) fail(`${locale} ${kind} digest is invalid`);
      if (await recordedFileDigest(generatedRoot, generatedRecord.path) !== expectedDigest) {
        fail(`generated ${locale} ${kind} bytes do not match the manifest`);
      }
      if (await recordedFileDigest(committedRoot, committedRecord.path) !== expectedDigest) {
        fail(`committed ${locale} ${kind} bytes do not match current Quality output`);
      }
    }
  }
  return { siteHash: generatedManifest.source.siteHash, version };
}

export async function promoteReleaseAssets({ assetRoot, sourceRoot = root, sourceSha }) {
  if (!assetRoot || !fullCommitPattern.test(sourceSha || '')) fail('promotion requires an asset root and full source SHA');
  const [canonicalAssets, canonicalSource] = await Promise.all([realpath(assetRoot), realpath(sourceRoot)]);
  if (canonicalAssets === canonicalSource
    || canonicalAssets.startsWith(`${canonicalSource}${path.sep}`)
    || canonicalSource.startsWith(`${canonicalAssets}${path.sep}`)) {
    fail('promotion asset and source roots must be independent');
  }
  const [{ resolveSourceCommit }, { verifyDocumentationAssets }] = await Promise.all([
    import('./generate-doc-assets.mjs'), import('./verify-doc-assets.mjs')
  ]);
  resolveSourceCommit(canonicalSource, sourceSha);
  await verifyDocumentationAssets({
    assetRoot: canonicalAssets, requireExactSource: false, sourceRoot: canonicalSource, sourceSha
  });
  for (const relativePath of assetPaths) {
    const source = safePath(canonicalAssets, relativePath);
    const target = safePath(canonicalSource, relativePath);
    const metadata = await lstat(source);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`promotion source is not a regular file: ${relativePath}`);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      if ((await lstat(target)).isSymbolicLink()) fail(`promotion target is a symbolic link: ${relativePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await copyFile(source, target);
  }
  return { files: [...assetPaths] };
}

function parseOptions(args, allowed) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!allowed.includes(key) || key in values) fail('unknown or duplicate command argument');
    values[key] = value;
  }
  return values;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'required') {
    const values = parseOptions(args, ['base', 'head']);
    if (Object.keys(values).length !== 2) fail('required expects base and head');
    const required = releaseAssetsRequiredBetween(values.base, values.head);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
    console.log(required ? 'Release documentation assets must be refreshed.' : 'Release documentation assets are unchanged.');
    return;
  }
  if (command === 'compare') {
    const values = parseOptions(args, ['committed-root', 'generated-root']);
    if (!values['committed-root'] || !values['generated-root']) fail('compare expects committed and generated roots');
    const result = await compareReleaseAssets({
      committedRoot: path.resolve(values['committed-root']), generatedRoot: path.resolve(values['generated-root'])
    });
    console.log(`Verified committed documentation assets for v${result.version} and site ${result.siteHash}.`);
    return;
  }
  if (command === 'promote') {
    const values = parseOptions(args, ['asset-root', 'source-root', 'source-sha']);
    if (!values['asset-root'] || !values['source-sha']) fail('promote expects asset root and source SHA');
    const result = await promoteReleaseAssets({
      assetRoot: path.resolve(values['asset-root']),
      sourceRoot: values['source-root'] ? path.resolve(values['source-root']) : root,
      sourceSha: values['source-sha']
    });
    console.log(`Promoted ${result.files.length} verified documentation asset files.`);
    return;
  }
  fail('expected required, compare, or promote command');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
