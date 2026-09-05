import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeTreeDigest } from './prepare-pages-artifact.mjs';

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`Release artifact evidence failed: ${message}`);
}

function stableTag(version) {
  return `v${version}`;
}

function validateEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('evidence must be an object');
  const expected = ['artifactDigest', 'packageVersion', 'sourceDigest', 'sourceSha'];
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('evidence contains unknown or missing fields');
  }
  if (!shaPattern.test(value.sourceSha)) fail('source SHA must be a full lowercase commit SHA');
  if (!/^\d+\.\d+\.\d+$/.test(value.packageVersion)) fail('package version is invalid');
  if (!digestPattern.test(value.sourceDigest) || !digestPattern.test(value.artifactDigest)) {
    fail('artifact and source digests must be lowercase SHA-256 values');
  }
  return Object.freeze({ ...value });
}

async function packageVersion(sourceDirectory) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.join(sourceDirectory, 'package.json'), 'utf8'));
  } catch {
    fail('package.json is unavailable or invalid');
  }
  if (!/^\d+\.\d+\.\d+$/.test(parsed.version || '')) fail('package version is invalid');
  return parsed.version;
}

function sourceSiteDirectory(sourceDirectory) {
  return path.join(sourceDirectory, 'site');
}

export async function createArtifactEvidence({ artifactDirectory, sourceDirectory, sourceSha }) {
  if (!shaPattern.test(sourceSha || '')) fail('source SHA must be a full lowercase commit SHA');
  return validateEvidence({
    artifactDigest: await computeTreeDigest(artifactDirectory),
    packageVersion: await packageVersion(sourceDirectory),
    sourceDigest: await computeTreeDigest(sourceSiteDirectory(sourceDirectory)),
    sourceSha
  });
}

export async function writeArtifactEvidence({ outputPath, ...options }) {
  const evidence = await createArtifactEvidence(options);
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

export async function verifyArtifactEvidence({ artifactDirectory, evidencePath, sourceDirectory, sourceSha }) {
  let evidence;
  try {
    evidence = validateEvidence(JSON.parse(await readFile(evidencePath, 'utf8')));
  } catch (error) {
    if (error.message?.startsWith('Release artifact evidence failed:')) throw error;
    fail('evidence is unavailable or invalid JSON');
  }
  if (sourceSha && evidence.sourceSha !== sourceSha) fail('artifact was prepared for a different source SHA');
  if (evidence.packageVersion !== await packageVersion(sourceDirectory)) fail('package version does not match the evidence');
  if (evidence.sourceDigest !== await computeTreeDigest(sourceSiteDirectory(sourceDirectory))) fail('source bytes do not match the evidence');
  if (evidence.artifactDigest !== await computeTreeDigest(artifactDirectory)) fail('artifact bytes do not match the evidence');
  return evidence;
}

function parseArguments(args) {
  const [command, ...values] = args;
  if (!['create', 'verify'].includes(command)) fail('expected create or verify command');
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!['artifact-dir', 'evidence', 'source-dir', 'source-sha'].includes(key) || key in options) fail('unknown or duplicate argument');
    options[key] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!options['artifact-dir'] || !options['source-dir'] || !options['source-sha']) fail('artifact, source, and source SHA are required');
  if (command === 'create') {
    if (!options.evidence) fail('create requires --evidence');
    const evidence = await writeArtifactEvidence({
      artifactDirectory: options['artifact-dir'], evidencePath: options.evidence,
      outputPath: options.evidence, sourceDirectory: options['source-dir'], sourceSha: options['source-sha']
    });
    console.log(`Prepared ${stableTag(evidence.packageVersion)} artifact ${evidence.artifactDigest}.`);
    return;
  }
  if (Object.keys(options).length !== 4 || !options.evidence) fail('verify requires the complete evidence contract');
  const evidence = await verifyArtifactEvidence({
    artifactDirectory: options['artifact-dir'], evidencePath: options.evidence,
    sourceDirectory: options['source-dir'], sourceSha: options['source-sha']
  });
  console.log(`Verified ${stableTag(evidence.packageVersion)} artifact ${evidence.artifactDigest}.`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
