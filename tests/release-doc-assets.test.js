import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { computeGeneratorInputHash, computeSiteHash } from '../scripts/generate-doc-assets.mjs';
import {
  compareCurrentReleaseAssets,
  compareReleaseAssets,
  promoteReleaseAssets,
  readReleaseAssetProvenance,
  releaseAssetPathsChangedBetween,
  releaseAssetsRequiredBetween
} from '../scripts/release-doc-assets.mjs';

const outputs = Object.freeze({
  en: { paper: 'LETTER', pdfPath: 'output/pdf/en-letter.pdf', screenshotPath: 'docs/screenshots/en.png' },
  ja: { paper: 'A4', pdfPath: 'output/pdf/ja-a4.pdf', screenshotPath: 'docs/screenshots/ja.png' },
  'zh-CN': { paper: 'A4', pdfPath: 'output/pdf/zh-CN-a4.pdf', screenshotPath: 'docs/screenshots/zh-CN.png' }
});

function digest(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function crc32(contents) {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, contents) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(contents.length + 12);
  chunk.writeUInt32BE(contents.length, 0);
  name.copy(chunk, 4);
  contents.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, contents])), contents.length + 8);
  return chunk;
}

function createPng({ contentVariant, semanticVariant }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const pixel = semanticVariant === 'changed' ? [220, 20, 30] : [10, 20, 30];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('tEXt', Buffer.from(`variant\0${contentVariant}`)),
    pngChunk('IDAT', deflateSync(Buffer.from([0, ...pixel]))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function createPdf({ contentVariant, height, text, width }) {
  const escapedText = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = `BT\n/F1 12 Tf\n72 ${height - 72} Td\n(${escapedText}) Tj\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let body = `%PDF-1.4\n% fixture-${contentVariant}\n`;
  const offsets = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function writeAssetFixture(root, {
  browserVersion = '123.0.0.0',
  commit,
  contentVariant = 'default',
  qualityRunId = '12345',
  semanticVariant = 'same',
  version = '0.3.0'
}) {
  await mkdir(path.join(root, 'docs/screenshots'), { recursive: true });
  await mkdir(path.join(root, 'output/pdf'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'site'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ version })}\n`);
  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(path.join(root, 'scripts/generate-doc-assets.mjs'), '// generator fixture\n');
  await writeFile(path.join(root, 'scripts/verify-doc-assets.mjs'), '// verifier fixture\n');
  await writeFile(path.join(root, 'site/index.html'), '<title>fixture site</title>\n');
  const generatorInputHash = await computeGeneratorInputHash(root);
  const siteHash = await computeSiteHash(path.join(root, 'site'));
  const manifestOutputs = [];
  for (const [locale, expected] of Object.entries(outputs)) {
    const firstText = `first-${locale}`;
    const lastText = `last-${locale}`;
    const records = {};
    for (const [kind, relativePath] of [['screenshot', expected.screenshotPath], ['pdf', expected.pdfPath]]) {
      const size = expected.paper === 'A4' ? { height: 841.89, width: 595.28 } : { height: 792, width: 612 };
      const contents = kind === 'screenshot'
        ? createPng({ contentVariant, semanticVariant })
        : createPdf({
          contentVariant,
          ...size,
          text: `${firstText} ${semanticVariant === 'changed' ? 'unexpected-private-content ' : ''}${lastText}`
        });
      const sha256 = digest(contents);
      await writeFile(path.join(root, relativePath), contents);
      records[kind] = kind === 'screenshot'
        ? { fixture: 'fictional-documentation-example', height: 1, path: relativePath, sha256, width: 1 }
        : { fixture: 'deterministic-print-example', path: relativePath, sha256 };
    }
    manifestOutputs.push({
      browserLocale: locale, firstText, lastText, locale,
      marker: `marker-${locale}`, paper: expected.paper, ...records
    });
  }
  const manifest = {
    schemaVersion: 4,
    generator: {
      command: 'node scripts/generate-doc-assets.mjs --output-dir <temporary-directory> --source-sha <full-SHA> --quality-run-id <run-ID> --producer-kind <quality|release-candidate> --producer-workflow <workflow-path> --producer-run-attempt <attempt> --producer-control-sha <full-SHA>',
      inputHash: generatorInputHash,
      inputHashAlgorithm: 'sha256(relative-path + NUL + content + NUL)',
      inputs: ['package-lock.json', 'scripts/generate-doc-assets.mjs', 'scripts/verify-doc-assets.mjs'],
      path: 'scripts/generate-doc-assets.mjs',
      version: '1.4.0'
    },
    source: {
      appVersion: version,
      checkoutCommit: commit,
      fixedDate: '2026-09-01',
      markerHashLength: 12,
      markerPrefix: 'RESUME-STUDIO-SAMPLE',
      producer: {
        controlSha: commit,
        kind: 'quality',
        runAttempt: '1',
        runId: qualityRunId,
        workflow: '.github/workflows/ci.yml'
      },
      siteHash,
      siteHashAlgorithm: 'sha256(relative-path + NUL + content + NUL)'
    },
    browser: { engine: 'Chromium', version: browserVersion, viewport: { height: 1000, width: 1440 } },
    outputs: manifestOutputs
  };
  await writeFile(path.join(root, 'docs/assets-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function writePromotedFixture(committedRoot, promotedRoot, options) {
  const committed = await writeAssetFixture(committedRoot, options);
  await writeAssetFixture(promotedRoot, options);
  return committed;
}

test('release asset classification separates version changes from managed asset changes', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-version-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Release Assets Test');
  git('config', 'user.email', 'release-assets@example.invalid');
  git('config', 'commit.gpgSign', 'false');
  await mkdir(path.join(directory, 'docs'), { recursive: true });
  await writeFile(path.join(directory, 'package.json'), '{"version":"0.2.5"}\n');
  await writeFile(path.join(directory, 'docs/assets-manifest.json'), '{}\n');
  git('add', 'package.json', 'docs/assets-manifest.json');
  git('commit', '-m', 'initial version');
  const base = git('rev-parse', 'HEAD');
  assert.equal(releaseAssetsRequiredBetween(base, base, directory), false);
  assert.equal(releaseAssetPathsChangedBetween(base, base, directory), false);

  await writeFile(path.join(directory, 'README.md'), 'unrelated\n');
  git('add', 'README.md');
  git('commit', '-m', 'unrelated change');
  const unrelated = git('rev-parse', 'HEAD');
  assert.equal(releaseAssetsRequiredBetween(base, unrelated, directory), false);
  assert.equal(releaseAssetPathsChangedBetween(base, unrelated, directory), false);

  await writeFile(path.join(directory, 'docs/assets-manifest.json'), '{"changed":true}\n');
  git('commit', '-am', 'asset change');
  const assetHead = git('rev-parse', 'HEAD');
  assert.equal(releaseAssetsRequiredBetween(base, assetHead, directory), false);
  assert.equal(releaseAssetPathsChangedBetween(base, assetHead, directory), true);

  await writeFile(path.join(directory, 'package.json'), '{"version":"0.2.6"}\n');
  git('commit', '-am', 'next version');
  const head = git('rev-parse', 'HEAD');
  assert.equal(releaseAssetsRequiredBetween(base, head, directory), true);
  assert.equal(releaseAssetPathsChangedBetween(base, head, directory), true);
  assert.throws(() => releaseAssetsRequiredBetween('main', head, directory), /full commit SHAs/);
  assert.throws(() => releaseAssetPathsChangedBetween('main', head, directory), /full commit SHAs/);
});

test('committed assets may differ in bytes across runs when rendered content stays equivalent', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-compare-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generatedRoot = path.join(directory, 'generated');
  const committedRoot = path.join(directory, 'committed');
  const promotedRoot = path.join(directory, 'promoted');
  await writeAssetFixture(generatedRoot, { commit: 'a'.repeat(40), contentVariant: 'generated' });
  const committedManifest = await writePromotedFixture(committedRoot, promotedRoot, {
    commit: 'b'.repeat(40), contentVariant: 'committed'
  });
  assert.deepEqual(await compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'a'.repeat(40) }), {
    siteHash: committedManifest.source.siteHash, version: '0.3.0'
  });
  assert.deepEqual(await compareCurrentReleaseAssets({ committedRoot, generatedRoot, sourceSha: 'a'.repeat(40) }), {
    siteHash: committedManifest.source.siteHash, version: '0.3.0'
  });
  await assert.rejects(
    compareReleaseAssets({ committedRoot, generatedRoot, sourceSha: 'a'.repeat(40) }),
    /promoted asset root is required/
  );
  assert.deepEqual(await readReleaseAssetProvenance(committedRoot), {
    artifactName: `documentation-assets-${'b'.repeat(40)}`,
    checkoutCommit: 'b'.repeat(40),
    producer: {
      controlSha: 'b'.repeat(40), kind: 'quality', runAttempt: '1', runId: '12345', workflow: '.github/workflows/ci.yml'
    },
    qualityRunId: '12345'
  });
});

test('release asset comparison rejects stale versions, site bytes, and modified files', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-stale-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generatedRoot = path.join(directory, 'generated');
  const committedRoot = path.join(directory, 'committed');
  const promotedRoot = path.join(directory, 'promoted');
  await writeAssetFixture(generatedRoot, { commit: 'a'.repeat(40) });
  await writePromotedFixture(committedRoot, promotedRoot, { commit: 'b'.repeat(40), version: '0.2.5' });
  const compare = () => compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'a'.repeat(40) });
  await assert.rejects(compare(), /generated asset validation failed: Documentation asset app version/);

  const committedManifest = await writePromotedFixture(committedRoot, promotedRoot, { commit: 'b'.repeat(40) });
  committedManifest.source.siteHash = 'd'.repeat(64);
  await writeFile(path.join(committedRoot, 'docs/assets-manifest.json'), `${JSON.stringify(committedManifest, null, 2)}\n`);
  await assert.rejects(compare(), /committed asset validation failed: Documentation asset site hash/);

  await writePromotedFixture(committedRoot, promotedRoot, { commit: 'b'.repeat(40) });
  await writeFile(path.join(committedRoot, 'docs/screenshots/ja.png'), createPng({
    contentVariant: 'tampered', semanticVariant: 'changed'
  }));
  await assert.rejects(compare(), /committed asset validation failed: Documentation asset screenshot hash/);

  await writePromotedFixture(committedRoot, promotedRoot, { commit: 'b'.repeat(40) });
  await assert.rejects(
    compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'd'.repeat(40) }),
    /generated asset validation failed: Documentation asset source SHA/
  );
});

test('release asset comparison reports semantic drift separately from byte variation', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generatedRoot = path.join(directory, 'generated');
  const committedRoot = path.join(directory, 'committed');
  const promotedRoot = path.join(directory, 'promoted');
  await writeAssetFixture(generatedRoot, { browserVersion: '123.0.0.0', commit: 'a'.repeat(40) });
  await writePromotedFixture(committedRoot, promotedRoot, {
    browserVersion: '122.0.0.0', commit: 'b'.repeat(40)
  });

  await assert.rejects(
    compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'a'.repeat(40) }),
    /browser contract: generated=.*123\.0\.0\.0.*committed=.*122\.0\.0\.0/
  );
});

test('release asset comparison rejects self-consistent but different committed content', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-content-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generatedRoot = path.join(directory, 'generated');
  const committedRoot = path.join(directory, 'committed');
  const promotedRoot = path.join(directory, 'promoted');
  await writeAssetFixture(generatedRoot, { commit: 'a'.repeat(40), contentVariant: 'generated' });
  await writePromotedFixture(committedRoot, promotedRoot, {
    commit: 'b'.repeat(40), contentVariant: 'committed', semanticVariant: 'changed'
  });

  await assert.rejects(
    compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'a'.repeat(40) }),
    /content differs from Quality evidence/
  );
  await assert.rejects(
    compareCurrentReleaseAssets({ committedRoot, generatedRoot, sourceSha: 'a'.repeat(40) }),
    /content differs from Quality evidence/
  );
});

test('release asset comparison rejects committed bytes that differ from promoted Quality provenance', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-provenance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generatedRoot = path.join(directory, 'generated');
  const committedRoot = path.join(directory, 'committed');
  const promotedRoot = path.join(directory, 'promoted');
  await writeAssetFixture(generatedRoot, { commit: 'a'.repeat(40), contentVariant: 'generated' });
  await writeAssetFixture(committedRoot, { commit: 'b'.repeat(40), contentVariant: 'committed' });
  await writeAssetFixture(promotedRoot, { commit: 'b'.repeat(40), contentVariant: 'original-quality' });

  await assert.rejects(
    compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'a'.repeat(40) }),
    /does not match the Quality artifact selected by committed provenance/
  );
});

test('release asset comparison rejects an unmaterialized LFS pointer before verification', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-lfs-pointer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generatedRoot = path.join(directory, 'generated');
  const committedRoot = path.join(directory, 'committed');
  const promotedRoot = path.join(directory, 'promoted');
  await writeAssetFixture(generatedRoot, { commit: 'a'.repeat(40) });
  const committedManifest = await writePromotedFixture(committedRoot, promotedRoot, { commit: 'b'.repeat(40) });
  const expectedDigest = committedManifest.outputs.find(({ locale }) => locale === 'en').screenshot.sha256;
  await writeFile(path.join(committedRoot, 'docs/screenshots/en.png'),
    `version https://git-lfs.github.com/spec/v1\noid sha256:${expectedDigest}\nsize 1\n`);
  await assert.rejects(
    compareReleaseAssets({ committedRoot, generatedRoot, promotedRoot, sourceSha: 'a'.repeat(40) }),
    /committed asset validation failed: Release documentation assets failed: Git LFS pointer is not materialized/
  );
});

test('promotion refuses overlapping generated and source roots', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resume-release-assets-promote-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(promoteReleaseAssets({
    assetRoot: directory, sourceRoot: directory, sourceSha: 'a'.repeat(40)
  }), /must be independent/);
});
