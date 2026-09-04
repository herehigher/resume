import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSiteHash } from './generate-doc-assets.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function checkReleaseAssets({ assetRoot = root, sourceRoot = root } = {}) {
  const manifestPath = path.join(assetRoot, 'docs/assets-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const currentSiteHash = await computeSiteHash(path.join(sourceRoot, 'site'));

  if (manifest.source?.siteHash !== currentSiteHash) {
    throw new Error(
      'Release screenshots and PDFs are stale. Run npm run release:assets after the final release candidate is frozen.'
    );
  }
  return currentSiteHash;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const currentSiteHash = await checkReleaseAssets();
  console.log(`Release assets match site ${currentSiteHash}.`);
}
