import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { computeGeneratorInputHash, computeSiteHash } from './generate-doc-assets.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fullCommitPattern = /^[0-9a-f]{40}$/;
const producerWorkflows = Object.freeze({
  quality: '.github/workflows/ci.yml',
  'release-candidate': '.github/workflows/release-candidate-assets.yml'
});
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

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodePng(contents) {
  const data = Buffer.from(contents);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let header;
  const imageData = [];
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    assert.ok(end <= data.length, 'PNG chunk exceeds file bounds.');
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      assert.equal(length, 13);
      header = {
        bitDepth: chunk[8],
        colorType: chunk[9],
        compression: chunk[10],
        filter: chunk[11],
        height: chunk.readUInt32BE(4),
        interlace: chunk[12],
        width: chunk.readUInt32BE(0)
      };
    }
    if (type === 'IDAT') imageData.push(chunk);
    offset = end;
    if (type === 'IEND') break;
  }
  assert.ok(header && imageData.length, 'PNG requires IHDR and IDAT chunks.');
  assert.equal(header.bitDepth, 8, 'PNG comparison requires 8-bit channels.');
  assert.ok([2, 6].includes(header.colorType), 'PNG comparison requires RGB or RGBA pixels.');
  assert.deepEqual([header.compression, header.filter, header.interlace], [0, 0, 0]);
  const channels = header.colorType === 2 ? 3 : 4;
  const rowLength = header.width * channels;
  const expectedLength = header.height * (rowLength + 1);
  assert.ok(header.width > 0 && header.height > 0 && header.width * header.height <= 10_000_000);
  const inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedLength });
  assert.equal(inflated.length, expectedLength, 'PNG scanline length does not match IHDR.');
  const pixels = Buffer.alloc(header.height * rowLength);
  let inputOffset = 0;
  for (let row = 0; row < header.height; row += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    assert.ok(filter <= 4, 'PNG uses an unsupported scanline filter.');
    const outputOffset = row * rowLength;
    for (let column = 0; column < rowLength; column += 1) {
      const raw = inflated[inputOffset];
      inputOffset += 1;
      const left = column >= channels ? pixels[outputOffset + column - channels] : 0;
      const up = row ? pixels[outputOffset - rowLength + column] : 0;
      const upperLeft = row && column >= channels ? pixels[outputOffset - rowLength + column - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      pixels[outputOffset + column] = (raw + predictor) & 0xff;
    }
  }
  return { ...header, channels, pixels };
}

export function comparePngVisuals(generatedContents, committedContents) {
  const generated = decodePng(generatedContents);
  const committed = decodePng(committedContents);
  assert.deepEqual(
    [committed.width, committed.height, committed.channels],
    [generated.width, generated.height, generated.channels],
    'PNG dimensions or color channels differ.'
  );
  let changedPixels = 0;
  let maximumChannelDelta = 0;
  for (let offset = 0; offset < generated.pixels.length; offset += generated.channels) {
    let changed = false;
    for (let channel = 0; channel < generated.channels; channel += 1) {
      const delta = Math.abs(generated.pixels[offset + channel] - committed.pixels[offset + channel]);
      if (delta) changed = true;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    }
    if (changed) changedPixels += 1;
  }
  const pixelCount = generated.width * generated.height;
  const allowedChangedPixels = Math.max(16, Math.ceil(pixelCount * 0.0001));
  assert.ok(
    changedPixels <= allowedChangedPixels && maximumChannelDelta <= 32,
    `PNG visual difference exceeds tolerance: changedPixels=${changedPixels}/${pixelCount}, maximumChannelDelta=${maximumChannelDelta}.`
  );
  return { changedPixels, maximumChannelDelta, pixelCount };
}

async function pdfSemanticSnapshot(contents) {
  const loadingTask = getDocument({
    data: new Uint8Array(contents),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        height: viewport.height,
        text: content.items.map((item) => item.str).join(' ').replace(/\s+/g, ''),
        width: viewport.width
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function comparePdfSemantics(generatedContents, committedContents) {
  const [generated, committed] = await Promise.all([
    pdfSemanticSnapshot(generatedContents),
    pdfSemanticSnapshot(committedContents)
  ]);
  assert.equal(committed.length, generated.length, 'PDF page count differs.');
  for (let index = 0; index < generated.length; index += 1) {
    assert.ok(Math.abs(committed[index].width - generated[index].width) < 0.01, `PDF page ${index + 1} width differs.`);
    assert.ok(Math.abs(committed[index].height - generated[index].height) < 0.01, `PDF page ${index + 1} height differs.`);
    assert.equal(committed[index].text, generated[index].text, `PDF page ${index + 1} text differs.`);
  }
  return { pages: generated.length };
}

export async function compareDocumentationAssetContent({ committedFile, generatedFile, kind }) {
  const [generated, committed] = await Promise.all([readFile(generatedFile), readFile(committedFile)]);
  if (kind === 'screenshot') return comparePngVisuals(generated, committed);
  if (kind === 'pdf') return comparePdfSemantics(generated, committed);
  throw new Error(`Unsupported documentation asset kind: ${kind}`);
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
  const pages = await pdfSemanticSnapshot(await readFile(file));
  const size = output.paper === 'A4'
    ? { height: 841.89, width: 595.28 }
    : { height: 792, width: 612 };
  assert.ok(pages.length >= 1);
  for (const page of pages) {
    assert.ok(Math.abs(page.width - size.width) < 1);
    assert.ok(Math.abs(page.height - size.height) < 1);
  }
  assert.ok(pages[0].text.includes(output.firstText.replace(/\s+/g, '')));
  assert.ok(pages.at(-1).text.includes(output.lastText.replace(/\s+/g, '')));
}

export async function verifyDocumentationAssets({
  assetRoot,
  requireExactSource = true,
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
  const packageVersion = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8')).version;
  const siteHash = await computeSiteHash(path.join(sourceRoot, 'site'));
  const generatorInputHash = await computeGeneratorInputHash(sourceRoot);
  if (manifest.schemaVersion !== 4) throw new Error('Documentation asset manifest schema is not current.');
  if (requireExactSource && manifest.source?.checkoutCommit !== sourceSha) {
    throw new Error('Documentation asset source SHA does not match the manifest.');
  }
  const producer = manifest.source?.producer;
  if (!Object.hasOwn(producerWorkflows, producer?.kind)
    || producer?.workflow !== producerWorkflows[producer.kind]
    || !/^[1-9][0-9]*$/.test(producer?.runId || '')
    || !/^[1-9][0-9]*$/.test(producer?.runAttempt || '')
    || !fullCommitPattern.test(producer?.controlSha || '')) {
    throw new Error('Documentation asset producer provenance is invalid.');
  }
  if (manifest.source?.appVersion !== packageVersion) {
    throw new Error('Documentation asset app version does not match the source checkout.');
  }
  if (manifest.source?.siteHash !== siteHash) throw new Error('Documentation asset site hash does not match the source checkout.');
  if (manifest.generator?.inputHash !== generatorInputHash) {
    throw new Error('Documentation asset generator input hash does not match the source checkout.');
  }
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
  return { generatorInputHash, siteHash, sourceSha };
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
