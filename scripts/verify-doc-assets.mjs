import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { computeSiteHash } from './generate-doc-assets.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fullCommitPattern = /^[0-9a-f]{40}$/;
const expectedOutputs = Object.freeze({
  en: { paper: 'LETTER', pdfPath: 'output/pdf/en-letter.pdf', screenshotPath: 'docs/screenshots/en.png' },
  ja: { paper: 'A4', pdfPath: 'output/pdf/ja-a4.pdf', screenshotPath: 'docs/screenshots/ja.png' },
  'zh-CN': { paper: 'A4', pdfPath: 'output/pdf/zh-CN-a4.pdf', screenshotPath: 'docs/screenshots/zh-CN.png' }
});
const outputPaths = new Set(Object.values(expectedOutputs).flatMap(({ pdfPath, screenshotPath }) => [pdfPath, screenshotPath]));

function assetPath(assetRoot, relativePath) {
  if (!outputPaths.has(relativePath)) throw new Error(`Unexpected documentation asset path: ${relativePath}`);
  const absolute = path.resolve(assetRoot, relativePath);
  if (!absolute.startsWith(`${assetRoot}${path.sep}`)) throw new Error(`Documentation asset escapes its root: ${relativePath}`);
  return absolute;
}

async function assertRegularFile(file) {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Documentation asset is not a regular file: ${file}`);
  }
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function validatePng(file, output) {
  const screenshot = output.screenshot;
  const data = await readFile(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(data.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(data.readUInt32BE(16), screenshot.width);
  assert.equal(data.readUInt32BE(20), screenshot.height);
}

async function validatePdf(file, output) {
  const loadingTask = getDocument({
    data: new Uint8Array(await readFile(file)),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  const size = output.paper === 'A4'
    ? { height: 841.89, width: 595.28 }
    : { height: 792, width: 612 };
  try {
    assert.ok(document.numPages >= 1);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      assert.ok(Math.abs(viewport.width - size.width) < 1);
      assert.ok(Math.abs(viewport.height - size.height) < 1);
      pages.push(content.items.map((item) => item.str).join(' ').replace(/\s+/g, ''));
    }
    assert.ok(pages[0].includes(output.firstText.replace(/\s+/g, '')));
    assert.ok(pages.at(-1).includes(output.lastText.replace(/\s+/g, '')));
  } finally {
    await loadingTask.destroy();
  }
}

export async function verifyDocumentationAssets({
  assetRoot,
  sourceRoot = root,
  sourceSha
} = {}) {
  if (!assetRoot || !sourceSha || !fullCommitPattern.test(sourceSha)) {
    throw new Error('Documentation asset verification requires --asset-root, --source-root, and a full lowercase --source-sha.');
  }
  const resolvedAssetRoot = path.resolve(assetRoot);
  const manifestFile = path.join(resolvedAssetRoot, 'docs/assets-manifest.json');
  await assertRegularFile(manifestFile);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const siteHash = await computeSiteHash(path.join(sourceRoot, 'site'));
  if (manifest.source?.commit !== sourceSha) throw new Error('Documentation asset source SHA does not match the manifest.');
  if (manifest.source?.siteHash !== siteHash) throw new Error('Documentation asset site hash does not match the source checkout.');
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length !== 3) {
    throw new Error('Documentation asset manifest must describe three locales.');
  }

  const expectedLocales = new Set(Object.keys(expectedOutputs));
  for (const output of manifest.outputs) {
    const expected = expectedOutputs[output.locale];
    if (!expected || !expectedLocales.delete(output.locale)) {
      throw new Error(`Unexpected documentation asset locale: ${output.locale}`);
    }
    if (output.paper !== expected.paper) throw new Error(`Documentation asset paper does not match locale: ${output.locale}`);
    if (output.screenshot?.path !== expected.screenshotPath || output.pdf?.path !== expected.pdfPath) {
      throw new Error(`Documentation asset paths do not match locale: ${output.locale}`);
    }
    for (const [kind, validator] of [['screenshot', validatePng], ['pdf', validatePdf]]) {
      const record = output[kind];
      const file = assetPath(resolvedAssetRoot, record?.path);
      await assertRegularFile(file);
      if (record.sha256 !== await sha256(file)) throw new Error(`Documentation asset ${kind} hash does not match the manifest.`);
      await validator(file, output);
    }
  }
  if (expectedLocales.size) throw new Error('Documentation asset manifest is missing a locale.');
  return { siteHash, sourceSha };
}

export function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Invalid documentation asset verification arguments.');
    if (argument === '--asset-root' && !values.assetRoot) values.assetRoot = path.resolve(value);
    else if (argument === '--source-root' && !values.sourceRoot) values.sourceRoot = path.resolve(value);
    else if (argument === '--source-sha' && !values.sourceSha) values.sourceSha = value;
    else throw new Error('Invalid documentation asset verification arguments.');
    index += 1;
  }
  if (!values.assetRoot || !values.sourceRoot || !values.sourceSha) {
    throw new Error('Provide --asset-root, --source-root, and --source-sha.');
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyDocumentationAssets(parseArguments(process.argv.slice(2)));
}
