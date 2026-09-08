import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const root = process.cwd();
const outputDirectory = path.join(root, 'site/assets/social');
const mascotPath = path.join(root, 'site/assets/brand/resume-studio-marmot-logo.png');
const mascot = await readFile(mascotPath);
const mascotDataUrl = `data:image/png;base64,${mascot.toString('base64')}`;

const cards = Object.freeze({
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

const localeIndex = process.argv.indexOf('--locale');
const locale = localeIndex === -1 ? '' : process.argv[localeIndex + 1];
const card = cards[locale];
if (!card || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/render-open-graph-cards.mjs --locale ja|zh-CN|en');
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

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

await page.locator('.mascot').evaluate((image) => image.complete || new Promise((resolve) => image.addEventListener('load', resolve, { once: true })));
await page.screenshot({ path: path.join(outputDirectory, card.output), type: 'png' });
await browser.close();
