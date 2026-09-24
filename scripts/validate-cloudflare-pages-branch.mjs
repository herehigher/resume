import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`Cloudflare Pages branch validation failed: ${message}`);
}

export function validateCloudflarePagesBranch(branch) {
  if (typeof branch !== 'string' || branch.length > 255
    || !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/.test(branch)
    || branch.includes('..') || branch.includes('//')) {
    fail('branch name is invalid');
  }

  const segments = branch.split('/');
  if (segments.some((segment) => !segment || segment.startsWith('.') || segment.endsWith('.') || segment.endsWith('.lock'))) {
    fail('branch name is invalid');
  }

  return branch;
}

function parseArguments(args) {
  if (args.length !== 2 || args[0] !== '--branch' || !args[1]) {
    fail('usage: validate-cloudflare-pages-branch.mjs --branch NAME');
  }
  return args[1];
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(`${validateCloudflarePagesBranch(parseArguments(process.argv.slice(2)))}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
