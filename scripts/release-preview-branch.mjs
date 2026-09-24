import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stableTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(`Release preview branch failed: ${message}`);
}

export function releasePreviewBranchForTag(tag) {
  if (typeof tag !== 'string' || !stableTagPattern.test(tag)) fail('release tag must be a stable SemVer tag');
  const branch = `release-preflight-${tag}`;
  if (branch.length > 63) fail('release tag is too long for a Pages preview branch');
  return branch;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const [option, tag, ...extra] = process.argv.slice(2);
    if (option !== '--tag' || !tag || extra.length) fail('usage: release-preview-branch.mjs --tag STABLE_TAG');
    process.stdout.write(`${releasePreviewBranchForTag(tag)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
