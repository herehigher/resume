import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`Write GitHub body file failed: ${message}`);
}

function outputPathFrom(argumentsList) {
  if (argumentsList.length !== 2 || argumentsList[0] !== '--output') {
    fail('usage: write-github-body-file.mjs --output ABSOLUTE_TEMPORARY_FILE');
  }
  if (!path.isAbsolute(argumentsList[1])) fail('output must be an absolute temporary-file path');
  return argumentsList[1];
}

export function writeGithubBodyFile({ body, outputPath }) {
  if (!Buffer.isBuffer(body)) fail('body must be a buffer');
  if (!path.isAbsolute(outputPath || '')) fail('output must be an absolute temporary-file path');
  writeFileSync(outputPath, body, { mode: 0o600 });
}

function main() {
  const outputPath = outputPathFrom(process.argv.slice(2));
  writeGithubBodyFile({ body: readFileSync(0), outputPath });
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
