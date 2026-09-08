import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const defaultOutputDirectory = path.join(repositoryRoot, 'site/assets/social');
const manifestName = 'resume-studio-og.manifest.json';

export const MASCOT_RELATIVE_PATH = 'site/assets/brand/resume-studio-marmot-logo.png';
export const CARD_PRESENTATIONS = Object.freeze({
  en: Object.freeze({
    eyebrow: 'FREE · OPEN SOURCE · LOCAL-FIRST',
    headline: 'Build your resume.<br>Keep your data local.',
    description: 'Create an English resume in your browser.',
    privacy: 'No uploads',
    output: 'resume-studio-og-en.png'
  }),
  ja: Object.freeze({
    eyebrow: '無料 · オープンソース · ローカル処理',
    headline: '履歴書をつくる。<br>データは端末の中に。',
    description: '日本語の履歴書・職務経歴書を、ブラウザで。',
    privacy: 'アップロード不要',
    output: 'resume-studio-og-ja.png'
  }),
  'zh-CN': Object.freeze({
    eyebrow: '免费 · 开源 · 本地处理',
    headline: '创建简历，<br>数据留在本地。',
    description: '在浏览器中制作简体中文简历。',
    privacy: '无需上传',
    output: 'resume-studio-og-zh-cn.png'
  })
});

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!['--locale', '--output-dir'].includes(name) || !value || value.startsWith('--') || name in options) {
      throw new Error('Usage: node scripts/render-open-graph-cards.mjs --locale ja|zh-CN|en|all [--output-dir DIRECTORY]');
    }
    options[name] = value;
  }
  const requestedLocale = options['--locale'];
  if (!requestedLocale || (requestedLocale !== 'all' && !CARD_PRESENTATIONS[requestedLocale])) {
    throw new Error('Usage: node scripts/render-open-graph-cards.mjs --locale ja|zh-CN|en|all [--output-dir DIRECTORY]');
  }
  return {
    locales: requestedLocale === 'all' ? Object.keys(CARD_PRESENTATIONS) : [requestedLocale],
    outputDirectory: options['--output-dir'] ? path.resolve(options['--output-dir']) : defaultOutputDirectory
  };
}

async function renderCard(browser, locale, card, mascotDataUrl, outputDirectory) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<!doctype html>

  <html lang="${locale}">
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        html, body { height: 630px; margin: 0; overflow: hidden; width: 1200px; }
        body {
          background:
            radial-gradient(circle at 93% 8%, rgba(230, 155, 45, .17), transparent 25%),
            linear-gradient(135deg, #f8fafc 0%, #eef5fc 100%);
          color: #111c2b;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .frame {
          background: rgba(255, 255, 255, .97);
          border: 1px solid #dce3ec;
          border-radius: 30px;
          box-shadow: 0 24px 60px rgba(31, 95, 159, .12);
          inset: 40px 42px;
          overflow: hidden;
          position: absolute;
        }
        .copy { left: 58px; position: absolute; top: 45px; width: 640px; z-index: 3; }
        .brand { font-size: 28px; font-weight: 780; letter-spacing: -.035em; line-height: 1.2; }
        .eyebrow { color: #1763a9; font-size: 18px; font-weight: 760; letter-spacing: .015em; margin-top: 43px; }
        h1 { font-size: 52px; letter-spacing: -.045em; line-height: 1.18; margin: 14px 0 0; }
        .description { color: #526171; font-size: 21px; line-height: 1.5; margin: 17px 0 0; }
        .pills { display: flex; gap: 11px; margin-top: 27px; }
        .pill {
          background: #f8fbff;
          border: 1px solid #9dcaef;
          border-radius: 999px;
          color: #1763a9;
          font-size: 17px;
          font-weight: 720;
          line-height: 1;
          padding: 11px 16px;
        }
        .languages { color: #6c89a7; font-size: 17px; font-weight: 600; letter-spacing: .01em; margin-top: 27px; }
        .visual { height: 100%; position: absolute; right: 46px; top: 0; width: 430px; z-index: 2; }
        .orb { background: #eaf3fc; border-radius: 50%; height: 385px; position: absolute; right: 30px; top: 52px; width: 385px; }
        .paper {
          background: rgba(255, 255, 255, .98);
          border: 1px solid #dce3ec;
          border-radius: 18px;
          box-shadow: 0 18px 38px rgba(24, 32, 43, .09);
          height: 322px;
          position: absolute;
          right: 98px;
          top: 67px;
          transform: rotate(4deg);
          width: 242px;
          z-index: 1;
        }
        .paper::before { background: #eef5fc; border-radius: 50%; content: ""; height: 68px; left: 26px; position: absolute; top: 29px; width: 68px; }
        .line { background: #dbe8f4; border-radius: 99px; height: 9px; left: 26px; position: absolute; }
        .line.one { background: #78aeda; right: 26px; top: 124px; }
        .line.two { right: 61px; top: 151px; }
        .line.three { right: 39px; top: 194px; }
        .line.four { right: 76px; top: 221px; }
        .mascot {
          bottom: -64px;
          filter: drop-shadow(0 14px 15px rgba(37, 28, 20, .12));
          height: auto;
          position: absolute;
          right: 0;
          width: 405px;
          z-index: 2;
        }
      </style>
    </head>
    <body>
      <main class="frame">
        <section class="copy">
          <div class="brand">Resume Studio</div>
          <div class="eyebrow">${card.eyebrow}</div>
          <h1>${card.headline}</h1>
          <p class="description">${card.description}</p>
          <div class="pills"><span class="pill">PDF</span><span class="pill">JSON</span><span class="pill">${card.privacy}</span></div>
          <div class="languages">日本語 · 简体中文 · English</div>
        </section>
        <section class="visual" aria-hidden="true">
          <div class="orb"></div>
          <div class="paper"><i class="line one"></i><i class="line two"></i><i class="line three"></i><i class="line four"></i></div>
          <img class="mascot" src="${mascotDataUrl}" alt="">
        </section>
      </main>
    </body>
  </html>`);
    await page.evaluate(() => document.fonts.ready);
    const mascotLoaded = await page.locator('.mascot').evaluate((image) => (
      image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    ));
    if (!mascotLoaded) throw new Error(`Brand mascot failed to load for ${locale}`);
    const outputPath = path.join(outputDirectory, card.output);
    await page.screenshot({ path: outputPath, type: 'png' });
    return { output: card.output, sha256: sha256(await readFile(outputPath)) };
  } finally {
    await page.close();
  }
}

export async function renderOpenGraphCards({
  locales = Object.keys(CARD_PRESENTATIONS),
  outputDirectory = defaultOutputDirectory
} = {}) {
  if (!Array.isArray(locales) || locales.length === 0
    || new Set(locales).size !== locales.length
    || locales.some((locale) => !CARD_PRESENTATIONS[locale])) {
    throw new TypeError('Open Graph locales must be a non-empty unique supported locale list');
  }
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  if (resolvedOutputDirectory === defaultOutputDirectory
    && locales.length !== Object.keys(CARD_PRESENTATIONS).length) {
    throw new Error('Committed Open Graph cards must be rendered together with --locale all; use --output-dir for a single-locale preview');
  }
  const mascotPath = path.join(repositoryRoot, MASCOT_RELATIVE_PATH);
  const [mascot, generatorSource] = await Promise.all([readFile(mascotPath), readFile(scriptPath)]);
  const mascotDataUrl = `data:image/png;base64,${mascot.toString('base64')}`;
  await mkdir(resolvedOutputDirectory, { recursive: true });
  let browser;
  const renderedCards = {};
  try {
    browser = await chromium.launch({ headless: true });
    for (const locale of locales) {
      renderedCards[locale] = await renderCard(
        browser,
        locale,
        CARD_PRESENTATIONS[locale],
        mascotDataUrl,
        resolvedOutputDirectory
      );
    }
  } finally {
    await browser?.close();
  }
  const manifest = {
    schemaVersion: 1,
    generator: { path: 'scripts/render-open-graph-cards.mjs', sha256: sha256(generatorSource) },
    mascot: { path: MASCOT_RELATIVE_PATH, sha256: sha256(mascot) },
    cards: renderedCards
  };
  await writeFile(path.join(resolvedOutputDirectory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await renderOpenGraphCards(parseArguments(process.argv.slice(2)));
}
