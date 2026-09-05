import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const acceptedTags = new Set(['v0.2.2']);
const cloudflareProvider = 'cloudflare-web-analytics';

function fail(message) {
  throw new Error(`Legacy release preparation failed: ${message}`);
}

export async function prepareLegacyReleaseConfig({ outputPath, sourceDirectory, tag }) {
  if (!acceptedTags.has(tag)) fail('tag is not supported by the legacy adapter');
  let legacy;
  try {
    legacy = JSON.parse(await readFile(path.join(sourceDirectory, '.github/pages-release-manifest.json'), 'utf8'));
  } catch {
    fail('legacy Pages manifest is unavailable or invalid');
  }
  const enabled = legacy.analyticsMode === 'enabled' && legacy.analyticsProvider === cloudflareProvider;
  const disabled = legacy.analyticsMode === 'disabled' && legacy.analyticsProvider === 'none';
  if (!enabled && !disabled) fail('legacy analytics mode and provider are unsupported');
  const config = Object.freeze({
    analyticsMode: legacy.analyticsMode,
    analyticsProvider: legacy.analyticsProvider,
    schemaVersion: 2
  });
  await writeFile(outputPath, `${JSON.stringify(config)}\n`, { flag: 'wx' });
  return config;
}

async function main() {
  const [tag, sourceDirectory, outputPath] = process.argv.slice(2);
  if (process.argv.length !== 5) fail('usage: prepare-legacy-release-config.mjs TAG SOURCE_DIRECTORY OUTPUT_PATH');
  await prepareLegacyReleaseConfig({ outputPath, sourceDirectory, tag });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
