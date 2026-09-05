import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyArtifactEvidence } from './release-artifact-evidence.mjs';

const stableTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const rollbackTags = new Set(['v0.2.0', 'v0.2.2']);

function fail(message) {
  throw new Error(`Release publication failed: ${message}`);
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tagExists(cwd, tag) {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], { cwd, stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    fail(`unable to inspect existing release tag: ${error.message}`);
  }
}

export function validateRollbackTag(tag) {
  if (tag === 'v0.2.1') fail('v0.2.1 is not an accepted rollback target');
  if (!rollbackTags.has(tag)) fail('rollback tag is not an accepted historical release');
  return tag;
}

export async function ensureImmutableReleaseTag({ artifactDirectory, cwd, evidencePath, sourceDirectory, sourceSha, tag }) {
  if (!stableTagPattern.test(tag || '')) fail('release tag must be a stable SemVer tag');
  const evidence = await verifyArtifactEvidence({ artifactDirectory, evidencePath, sourceDirectory, sourceSha });
  if (tag !== `v${evidence.packageVersion}`) fail('release tag does not match prepared package version');
  if (tagExists(cwd, tag)) {
    let existing;
    try {
      existing = git(cwd, 'rev-parse', '--verify', '--end-of-options', `${tag}^{commit}`);
    } catch (error) {
      fail(`unable to resolve existing release tag: ${error.message}`);
    }
    if (existing !== sourceSha) fail('existing release tag points to a different commit');
    return Object.freeze({ evidence, resumed: true, tag });
  }
  git(cwd, '-c', 'tag.gpgSign=false', 'tag', '-a', tag, sourceSha, '-m', `Release ${tag}`);
  return Object.freeze({ evidence, resumed: false, tag });
}

function parseArguments(args) {
  const [command, ...values] = args;
  if (!['publish', 'rollback'].includes(command)) fail('expected publish or rollback command');
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!['artifact-dir', 'cwd', 'evidence', 'source-dir', 'source-sha', 'tag'].includes(key) || key in options) fail('unknown or duplicate argument');
    options[key] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'rollback') {
    console.log(`Accepted rollback target ${validateRollbackTag(options.tag)}.`);
    return;
  }
  for (const required of ['artifact-dir', 'cwd', 'evidence', 'source-dir', 'source-sha', 'tag']) {
    if (!options[required]) fail(`${required} is required`);
  }
  const result = await ensureImmutableReleaseTag({
    artifactDirectory: options['artifact-dir'], cwd: options.cwd, evidencePath: options.evidence,
    sourceDirectory: options['source-dir'], sourceSha: options['source-sha'], tag: options.tag
  });
  console.log(`${result.resumed ? 'Resumed' : 'Created'} immutable ${result.tag}.`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
