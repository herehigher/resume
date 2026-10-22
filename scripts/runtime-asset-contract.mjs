import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const RUNTIME_CACHE_HEADERS = '/assets/css/*\n  Cache-Control: public, max-age=0, must-revalidate\n/assets/js/*\n  Cache-Control: public, max-age=0, must-revalidate';

async function runtimeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? runtimeFiles(file) : [file];
  }));
  return files.flat().filter((file) => /\.(?:html|js)$/.test(file));
}

function referencePattern(file) {
  return file.endsWith('.html')
    ? /((?:href|src)=["'])((?:\.{0,2}\/)?assets\/[^"']+\.(?:css|js))(?:\?[^"']*)?(["'])/g
    : /(\b(?:from\s*|import\s*|import\s*\(\s*)["'])(\.{1,2}\/[^"']+\.js)(?:\?[^"']*)?(["'])/g;
}

export async function runtimeAssetUpdates(siteDirectory, version) {
  const files = await runtimeFiles(siteDirectory);
  return Promise.all(files.map(async (file) => {
    const source = await readFile(file, 'utf8');
    const contents = source.replace(referencePattern(file), (_match, prefix, resource, quote) => `${prefix}${resource}?v=${version}${quote}`);
    return { file, contents };
  }));
}

export async function assertRuntimeAssetVersions(siteDirectory, version) {
  for (const { file, contents } of await runtimeAssetUpdates(siteDirectory, version)) {
    if (contents !== await readFile(file, 'utf8')) {
      throw new Error(`Runtime asset version differs from package version: ${path.relative(siteDirectory, file)}`);
    }
  }
}

export function hasRuntimeAssetQuery(url) {
  const query = [...url.searchParams.entries()];
  return !url.search || (/\.(?:css|js)$/.test(url.pathname)
    && query.length === 1 && query[0][0] === 'v'
    && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(query[0][1]));
}
