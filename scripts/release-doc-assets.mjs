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

export function releaseAssetPathsChangedBetween(base, head, cwd = process.cwd()) {
  if (!fullCommitPattern.test(base || '') || !fullCommitPattern.test(head || '')) {
    fail('release asset classification requires full commit SHAs');
  }
  try {
    const changedPaths = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...${head}`], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).split('\n').filter(Boolean);
    return changedPaths.some((relativePath) => assetPaths.includes(relativePath));
  } catch {
    fail(`release asset paths are unavailable between ${base} and ${head}`);
  }
}

function outputRecords(manifest, label) {
  if (manifest.schemaVersion !== 3) fail(`${label} manifest schema is not current`);
  if (!versionPattern.test(manifest.source?.appVersion || '')) fail(`${label} app version is invalid`);
  if (!fullCommitPattern.test(manifest.source?.checkoutCommit || '')) fail(`${label} source commit is invalid`);
  if (!/^[1-9][0-9]*$/.test(manifest.source?.qualityRunId || '')) fail(`${label} Quality run ID is invalid`);
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

function withoutKeys(value, omittedKeys) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !omittedKeys.includes(key)));
}

function recordMismatch(mismatches, label, generatedValue, committedValue) {
  if (JSON.stringify(generatedValue) === JSON.stringify(committedValue)) return;
  mismatches.push(`${label}: generated=${JSON.stringify(generatedValue)}, committed=${JSON.stringify(committedValue)}`);
}

export async function readReleaseAssetProvenance(committedRoot = root) {
  const manifest = await readJson(path.join(committedRoot, 'docs/assets-manifest.json'), 'committed manifest');
  outputRecords(manifest, 'committed');
  return {
    artifactName: `documentation-assets-${manifest.source.checkoutCommit}`,
    checkoutCommit: manifest.source.checkoutCommit,
    qualityRunId: manifest.source.qualityRunId
  };
}

async function compareReleaseAssetEvidence({ committedRoot = root, generatedRoot, promotedRoot, sourceSha }) {
  if (!generatedRoot || !fullCommitPattern.test(sourceSha || '')) {
    fail('a generated asset root and full source SHA are required');
  }
  const generatedManifest = await readJson(path.join(generatedRoot, 'docs/assets-manifest.json'), 'generated manifest');
  const committedManifest = await readJson(path.join(committedRoot, 'docs/assets-manifest.json'), 'committed manifest');
  const promotedManifest = promotedRoot
    ? await readJson(path.join(promotedRoot, 'docs/assets-manifest.json'), 'promoted manifest')
    : null;
  const version = packageVersion(await readFile(path.join(committedRoot, 'package.json'), 'utf8'), 'committed');
  const { compareDocumentationAssetContent, verifyDocumentationAssets } = await import('./verify-doc-assets.mjs');
  const validationTargets = [
    ['generated', generatedRoot, true],
    ['committed', committedRoot, false]
  ];
  if (promotedRoot) validationTargets.push(['promoted', promotedRoot, false]);
  for (const [label, assetRoot, requireExactSource] of validationTargets) {
    try {
      await verifyDocumentationAssets({ assetRoot, requireExactSource, sourceRoot: committedRoot, sourceSha });
    } catch (error) {
      fail(`${label} asset validation failed: ${error.message}`);
    }
  }
  const generated = outputRecords(generatedManifest, 'generated');
  const committed = outputRecords(committedManifest, 'committed');
  if (promotedManifest) outputRecords(promotedManifest, 'promoted');
  const mismatches = [];

  if (promotedRoot) {
    for (const relativePath of assetPaths) {
      const committedDigest = await recordedFileDigest(committedRoot, relativePath);
      const promotedDigest = await recordedFileDigest(promotedRoot, relativePath);
      if (committedDigest !== promotedDigest) {
        mismatches.push(`${relativePath} does not match the Quality artifact selected by committed provenance`);
      }
    }
  }

  if (generatedManifest.source.appVersion !== version) {
    mismatches.push(`generated asset version ${generatedManifest.source.appVersion} does not match package version ${version}`);
  }
  if (committedManifest.source.appVersion !== version) {
    mismatches.push(`committed asset version ${committedManifest.source.appVersion} does not match package version ${version}`);
  }
  if (generatedManifest.source.checkoutCommit !== sourceSha) {
    mismatches.push(`generated source commit ${generatedManifest.source.checkoutCommit} does not match Quality source ${sourceSha}`);
  }
  if (generatedManifest.source.siteHash !== committedManifest.source.siteHash) {
    mismatches.push(`site bytes differ: generated=${generatedManifest.source.siteHash}, committed=${committedManifest.source.siteHash}`);
  }
  recordMismatch(mismatches, 'generator contract', generatedManifest.generator, committedManifest.generator);
  recordMismatch(mismatches, 'browser contract', generatedManifest.browser, committedManifest.browser);
  recordMismatch(
    mismatches,
    'source generation contract',
    withoutKeys(generatedManifest.source, ['appVersion', 'checkoutCommit', 'qualityRunId', 'siteHash']),
    withoutKeys(committedManifest.source, ['appVersion', 'checkoutCommit', 'qualityRunId', 'siteHash'])
  );

  for (const locale of Object.keys(expectedOutputs)) {
    const generatedOutput = generated.get(locale);
    const committedOutput = committed.get(locale);
    for (const field of ['browserLocale', 'paper', 'firstText', 'lastText', 'marker']) {
      recordMismatch(mismatches, `${locale} ${field}`, generatedOutput[field], committedOutput[field]);
    }
    for (const kind of ['screenshot', 'pdf']) {
      const generatedRecord = generatedOutput[kind];
      const committedRecord = committedOutput[kind];
      recordMismatch(
        mismatches,
        `${locale} ${kind} semantic metadata`,
        withoutKeys(generatedRecord, ['sha256']),
        withoutKeys(committedRecord, ['sha256'])
      );
      for (const [label, rootDirectory, record] of [
        ['generated', generatedRoot, generatedRecord],
        ['committed', committedRoot, committedRecord]
      ]) {
        if (!/^[0-9a-f]{64}$/.test(record.sha256 || '')) {
          mismatches.push(`${label} ${locale} ${kind} manifest digest is invalid: ${JSON.stringify(record.sha256)}`);
          continue;
        }
        const actualDigest = await recordedFileDigest(rootDirectory, record.path);
        if (actualDigest !== record.sha256) {
          mismatches.push(`${label} ${locale} ${kind} bytes do not match its manifest: expected=${record.sha256}, actual=${actualDigest}`);
        }
      }
      try {
        await compareDocumentationAssetContent({
          committedFile: safePath(committedRoot, committedRecord.path),
          generatedFile: safePath(generatedRoot, generatedRecord.path),
          kind
        });
      } catch (error) {
        mismatches.push(`${locale} ${kind} content differs from Quality evidence: ${error.message}`);
      }
    }
  }
  if (mismatches.length) fail(`currentness check found ${mismatches.length} mismatch(es):\n- ${mismatches.join('\n- ')}`);
  return { siteHash: generatedManifest.source.siteHash, version };
}

export async function compareReleaseAssets(options) {
  if (!options?.promotedRoot) fail('a promoted asset root is required for pull request verification');
  return compareReleaseAssetEvidence(options);
}

export async function compareCurrentReleaseAssets(options) {
  return compareReleaseAssetEvidence(options);
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
    const changed = releaseAssetPathsChangedBetween(values.base, values.head);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\nchanged=${changed}\n`);
    console.log(required ? 'Release documentation assets must be refreshed.' : 'Release documentation assets are unchanged.');
    return;
  }
  if (command === 'compare') {
    const values = parseOptions(args, ['committed-root', 'generated-root', 'promoted-root', 'source-sha']);
    if (!values['committed-root'] || !values['generated-root'] || !values['promoted-root'] || !values['source-sha']) {
      fail('compare expects committed, generated, and promoted roots and a source SHA');
    }
    const result = await compareReleaseAssets({
      committedRoot: path.resolve(values['committed-root']),
      generatedRoot: path.resolve(values['generated-root']),
      promotedRoot: path.resolve(values['promoted-root']),
      sourceSha: values['source-sha']
    });
    console.log(`Verified committed documentation assets for v${result.version} and site ${result.siteHash}.`);
    return;
  }
  if (command === 'compare-current') {
    const values = parseOptions(args, ['committed-root', 'generated-root', 'source-sha']);
    if (!values['committed-root'] || !values['generated-root'] || !values['source-sha']) {
      fail('compare-current expects committed and generated roots and a source SHA');
    }
    const result = await compareCurrentReleaseAssets({
      committedRoot: path.resolve(values['committed-root']),
      generatedRoot: path.resolve(values['generated-root']),
      sourceSha: values['source-sha']
    });
    console.log(`Verified current documentation assets for v${result.version} and site ${result.siteHash}.`);
    return;
  }
  if (command === 'provenance') {
    const values = parseOptions(args, ['committed-root']);
    if (!values['committed-root']) fail('provenance expects a committed root');
    const provenance = await readReleaseAssetProvenance(path.resolve(values['committed-root']));
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `artifact_name=${provenance.artifactName}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `checkout_commit=${provenance.checkoutCommit}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `quality_run_id=${provenance.qualityRunId}\n`);
    }
    console.log(`Resolved documentation asset provenance for ${provenance.checkoutCommit}.`);
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
  fail('expected required, compare, compare-current, provenance, or promote command');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
