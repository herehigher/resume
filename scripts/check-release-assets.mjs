import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSiteHash } from './generate-doc-assets.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = path.join(root, 'docs/assets-manifest.json');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const currentSiteHash = await computeSiteHash();

if (manifest.source?.siteHash !== currentSiteHash) {
  throw new Error(
    'Release screenshots and PDFs are stale. Run npm run release:assets after the final release candidate is frozen.'
  );
}

console.log(`Release assets match site ${currentSiteHash}.`);
