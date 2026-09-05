import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(`Set release version failed: ${message}`);
}

function replaceOnce(contents, pattern, replacement, label) {
  if ((contents.match(pattern) || []).length !== 1) fail(`${label} must appear exactly once`);
  return contents.replace(pattern, replacement);
}

export async function setReleaseVersion({ date, rootDirectory, version }) {
  if (!versionPattern.test(version || '')) fail('version must be a stable SemVer value');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('date must use YYYY-MM-DD');
  const packagePath = path.join(rootDirectory, 'package.json');
  const lockPath = path.join(rootDirectory, 'package-lock.json');
  const configPath = path.join(rootDirectory, 'site/assets/js/config.js');
  const changelogPath = path.join(rootDirectory, 'CHANGELOG.md');
  const [packageText, lockText, configText, changelogText] = await Promise.all([
    readFile(packagePath, 'utf8'), readFile(lockPath, 'utf8'), readFile(configPath, 'utf8'), readFile(changelogPath, 'utf8')
  ]);
  const packageJson = JSON.parse(packageText);
  const lockJson = JSON.parse(lockText);
  if (packageJson.name !== lockJson.name || !packageJson.name) fail('package and lock names do not match');
  packageJson.version = version;
  lockJson.version = version;
  if (lockJson.packages?.['']) lockJson.packages[''].version = version;
  const nextConfig = replaceOnce(configText, /APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`, 'APP_VERSION');
  const unreleased = '## [Unreleased]\n';
  if (!changelogText.includes(unreleased)) fail('CHANGELOG must contain an Unreleased section');
  const nextChangelog = changelogText.replace(unreleased, `${unreleased}\n## [${version}] - ${date}\n`);
  await Promise.all([
    writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`),
    writeFile(configPath, nextConfig),
    writeFile(changelogPath, nextChangelog)
  ]);
}

async function main() {
  const [version, date] = process.argv.slice(2);
  if (process.argv.length !== 4) fail('usage: set-release-version.mjs VERSION YYYY-MM-DD');
  await setReleaseVersion({ date, rootDirectory: process.cwd(), version });
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
