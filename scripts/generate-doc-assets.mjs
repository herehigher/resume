import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const siteRoot = path.join(root, 'site');
const viewport = Object.freeze({ width: 1440, height: 1000 });
const fixedDate = '2026-09-01';
const generatorVersion = '1.2.0';
const fullCommitPattern = /^[0-9a-f]{40}$/;
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png']
]);

const variants = Object.freeze([
  {
    browserLocale: 'ja-JP',
    firstText: 'RESUME-STUDIO-FIRST-JA',
    locale: 'ja',
    paper: 'A4',
    pdfPath: 'output/pdf/ja-a4.pdf',
    previewSelector: '#documentPreview',
    sampleSelector: '#loadSampleButton',
    sampleIdentity: '山田 太郎',
    screenshotPath: 'docs/screenshots/ja.png'
  },
  {
    browserLocale: 'zh-CN',
    firstText: 'RESUME-STUDIO-FIRST-ZH-CN',
    locale: 'zh-CN',
    paper: 'A4',
    pdfPath: 'output/pdf/zh-CN-a4.pdf',
    previewSelector: '[data-zh-preview]',
    sampleSelector: '[data-zh-action="sample"]',
    sampleIdentity: '简立',
    screenshotPath: 'docs/screenshots/zh-CN.png'
  },
  {
    browserLocale: 'en-US',
    firstText: 'RESUME-STUDIO-FIRST-EN',
    locale: 'en',
    paper: 'LETTER',
    pdfPath: 'output/pdf/en-letter.pdf',
    previewSelector: '[data-en-preview]',
    sampleSelector: '[data-en-load-sample]',
    sampleIdentity: 'Alex Morgan',
    screenshotPath: 'docs/screenshots/en.png'
  }
]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

export async function computeSiteHash(rootDirectory = siteRoot) {
  const hash = createHash('sha256');
  for (const file of await collectFiles(rootDirectory)) {
    hash.update(path.relative(rootDirectory, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function isWithin(directory, candidate) {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
}

export function resolveSourceCommit(sourceRoot, sourceCommit) {
  if (!fullCommitPattern.test(sourceCommit || '')) {
    throw new Error('Documentation assets require a full lowercase source SHA.');
  }
  let currentCommit;
  try {
    currentCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Documentation asset source directory must be a Git checkout.');
  }
  if (currentCommit !== sourceCommit) {
    throw new Error('Documentation asset source SHA does not match the source checkout.');
  }
  let siteStatus;
  try {
    siteStatus = execFileSync(
      'git',
      ['-C', sourceRoot, 'status', '--porcelain=v1', '--untracked-files=all', '--', 'site'],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    throw new Error('Documentation asset source checkout could not be checked for site changes.');
  }
  if (siteStatus) {
    throw new Error('Documentation asset source checkout has uncommitted site changes.');
  }
  return currentCommit;
}

export async function prepareDocumentationOutputDirectory({ outputRoot, sourceRoot }) {
  if (!outputRoot) throw new Error('Documentation asset generation requires an output directory.');
  const resolvedOutput = path.resolve(outputRoot);
  const resolvedSource = await realpath(sourceRoot);

  if (isWithin(resolvedSource, resolvedOutput) || isWithin(resolvedOutput, resolvedSource)) {
    throw new Error('Documentation asset output directory must be independent from the source checkout.');
  }

  let metadata;
  try {
    metadata = await lstat(resolvedOutput);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(resolvedOutput, { recursive: true });
    metadata = await lstat(resolvedOutput);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('Documentation asset output directory must be a real directory.');
  }

  const canonicalOutput = await realpath(resolvedOutput);
  if (isWithin(resolvedSource, canonicalOutput) || isWithin(canonicalOutput, resolvedSource)) {
    throw new Error('Documentation asset output directory must be independent from the source checkout.');
  }
  if ((await readdir(canonicalOutput)).length) {
    throw new Error('Documentation asset output directory must be empty.');
  }
  return canonicalOutput;
}

function createServerForSite(sourceSiteRoot) {
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/'
      ? 'index.html'
      : `${pathname.slice(1)}${pathname.endsWith('/') ? 'index.html' : ''}`;
    const target = path.resolve(sourceSiteRoot, relativePath);
    if (target !== sourceSiteRoot && !target.startsWith(`${sourceSiteRoot}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const metadata = await stat(target);
      if (!metadata.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes.get(path.extname(target)) || 'application/octet-stream'
      });
      createReadStream(target).pipe(response);
    } catch {
      response.writeHead(404).end('Not Found');
    }
  });
}

async function loadSampleFactories(sourceRoot) {
  const sourceUrl = (relativePath) => pathToFileURL(path.join(sourceRoot, relativePath)).href;
  const [{ createEnglishSampleState }, defaults, { createChineseSampleState }] = await Promise.all([
    import(sourceUrl('site/assets/js/data/en-sample.js')),
    import(sourceUrl('site/assets/js/state/defaults.js')),
    import(sourceUrl('site/assets/js/state/zh-CN.js'))
  ]);
  return { createChineseSampleState, createEnglishSampleState, ...defaults };
}

function createPdfState(locale, marker, firstText, factories) {
  const { createChineseSampleState, createDefaultState, createEnglishSampleState, createJapaneseSampleState } = factories;
  const source = createDefaultState(locale);
  let state;
  if (locale === 'ja') state = createJapaneseSampleState(source);
  if (locale === 'zh-CN') state = createChineseSampleState(source);
  if (locale === 'en') state = createEnglishSampleState(source);
  state.settings.locale = locale;
  state.documents.ja.fields.createdDate = fixedDate;
  state.profile.fields.email = `${firstText}@example.invalid`;

  if (locale === 'ja') {
    state.documents.ja.fields.requests = `貴社規定に従います。\n${marker}`;
  }
  if (locale === 'zh-CN') {
    state.documents['zh-CN'].resume.projects = state.documents['zh-CN'].resume.projects.slice(0, 1);
    state.documents['zh-CN'].resume.skills = `${state.documents['zh-CN'].resume.skills}\n${marker}`;
    state.documents['zh-CN'].resume.certifications = [];
  }
  if (locale === 'en') {
    state.documents.en.resume.certifications.push({ date: '', name: marker, url: '' });
  }
  return state;
}

function documentationState(locale, marker, firstText, factories) {
  const state = createPdfState(locale, marker, firstText, factories);
  const labels = {
    ja: ['架空 履歴書例', '架空企業（検証用）', '架空大学（検証用）'],
    'zh-CN': ['虚构 简历示例', '虚构企业（测试用）', '虚构大学（测试用）'],
    en: ['Fictional Resume Example', 'Fictional Example Company', 'Fictional Example University']
  }[locale];
  state.profile.fields.fullName = labels[0];
  state.profile.fields.address = '';
  state.profile.fields.postalCode = '';
  state.profile.fields.phone = '';
  state.profile.fields.links = ['https://example.invalid/profile'];
  const resume = state.documents[locale].resume;
  if (resume) {
    for (const item of resume.experience) item.company = labels[1];
    for (const item of resume.education) item.school = labels[2];
    for (const item of [...resume.projects, ...resume.certifications]) {
      if (item.url) item.url = 'https://example.invalid/reference';
    }
  }
  return state;
}

async function generateVariant(browser, baseURL, siteHash, variant, { outputRoot, factories }) {
  const marker = `RESUME-STUDIO-SAMPLE-${variant.locale.toUpperCase()}-${siteHash.slice(0, 12).toUpperCase()}`;
  const context = await browser.newContext({
    colorScheme: 'light',
    locale: variant.browserLocale,
    timezoneId: 'Asia/Tokyo',
    viewport
  });
  try {
    const fixedTimestamp = Date.parse(`${fixedDate}T00:00:00+09:00`);
    await context.addInitScript(({ timestamp }) => {
      const NativeDate = Date;
      class FixedDate extends NativeDate {
        constructor(...values) {
          super(...(values.length ? values : [timestamp]));
        }

        static now() {
          return timestamp;
        }
      }
      window.Date = FixedDate;
    }, { timestamp: fixedTimestamp });

    const page = await context.newPage();
    await page.goto(`${baseURL}/editor/?lang=${encodeURIComponent(variant.locale)}`, { waitUntil: 'networkidle' });
    await page.locator('#localeSelect').waitFor({ state: 'visible' });
    if (await page.locator('#localeSelect').inputValue() !== variant.locale) {
      throw new Error(`Locale did not resolve to ${variant.locale}`);
    }
    const pdfState = documentationState(variant.locale, marker, variant.firstText, factories);
    await page.locator('#importDataInput').setInputFiles({
      buffer: Buffer.from(JSON.stringify(pdfState)),
      mimeType: 'application/json',
      name: `fictional-${variant.locale}.json`
    });
    await page.waitForFunction(
      ({ previewSelector, markerText }) => document.querySelector(previewSelector)?.textContent.includes(markerText),
      { markerText: marker, previewSelector: variant.previewSelector }
    );
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      for (const element of document.querySelectorAll('.workspace, .editor-panel, .preview-scroll')) {
        element.scrollLeft = 0;
      }
    });

    const screenshotAbsolute = path.join(outputRoot, variant.screenshotPath);
    await page.screenshot({ animations: 'disabled', fullPage: false, path: screenshotAbsolute });

    await page.emulateMedia({ media: 'print' });
    const pdfAbsolute = path.join(outputRoot, variant.pdfPath);
    await page.pdf({
      displayHeaderFooter: false,
      path: pdfAbsolute,
      preferCSSPageSize: true,
      printBackground: true
    });

    return {
      browserLocale: variant.browserLocale,
      firstText: variant.firstText,
      lastText: marker,
      locale: variant.locale,
      marker,
      paper: variant.paper,
      pdf: {
        fixture: 'deterministic-print-example',
        path: variant.pdfPath,
        sha256: await fileHash(pdfAbsolute)
      },
      screenshot: {
        fixture: 'fictional-documentation-example',
        height: viewport.height,
        path: variant.screenshotPath,
        sha256: await fileHash(screenshotAbsolute),
        width: viewport.width
      }
    };
  } finally {
    await context.close();
  }
}

export async function generateDocumentationAssets({
  outputRoot,
  sourceCommit,
  sourceRoot = root
} = {}) {
  const verifiedSourceCommit = resolveSourceCommit(sourceRoot, sourceCommit);
  const verifiedOutputRoot = await prepareDocumentationOutputDirectory({ outputRoot, sourceRoot });
  await mkdir(path.join(verifiedOutputRoot, 'docs/screenshots'), { recursive: true });
  await mkdir(path.join(verifiedOutputRoot, 'output/pdf'), { recursive: true });

  const sourceSiteRoot = path.join(sourceRoot, 'site');
  const manifestPath = path.join(verifiedOutputRoot, 'docs/assets-manifest.json');
  const siteHash = await computeSiteHash(sourceSiteRoot);
  const factories = await loadSampleFactories(sourceRoot);
  const server = createServerForSite(sourceSiteRoot);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseURL = `http://127.0.0.1:${address.port}`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const outputs = [];
    for (const variant of variants) {
      outputs.push(await generateVariant(browser, baseURL, siteHash, variant, { factories, outputRoot: verifiedOutputRoot }));
    }
    const manifest = {
      schemaVersion: 1,
      generator: {
        command: 'node scripts/generate-doc-assets.mjs --output-dir <temporary-directory> --source-sha <full-SHA>',
        path: 'scripts/generate-doc-assets.mjs',
        version: generatorVersion
      },
      source: {
        commit: verifiedSourceCommit,
        fixedDate,
        markerHashLength: 12,
        markerPrefix: 'RESUME-STUDIO-SAMPLE',
        siteHash,
        siteHashAlgorithm: 'sha256(relative-path + NUL + content + NUL)'
      },
      browser: {
        engine: 'Chromium',
        version: browser.version(),
        viewport
      },
      outputs
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Generated ${outputs.length} screenshots and ${outputs.length} PDFs for site ${siteHash}.`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

export function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--output-dir' && !values.outputRoot && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.outputRoot = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    if (argument === '--source-sha' && !values.sourceCommit && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.sourceCommit = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error('Invalid documentation asset arguments.');
  }
  if (!values.outputRoot || !values.sourceCommit) {
    throw new Error('Provide --output-dir and --source-sha for temporary documentation assets.');
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateDocumentationAssets(parseArguments(process.argv.slice(2)));
}
