import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDocumentationOnly(paths) {
  return paths.length > 0 && paths.every((file) => (
    /^[^/]+\.md$/.test(file)
    || /^docs\/(?:[^/]+\/)*[^/]+\.md$/.test(file)
    || file === '.github/pull_request_template.md'
  ));
}

export function documentationOnlyBetween(base, head, cwd = process.cwd()) {
  if (![base, head].every((sha) => /^[0-9a-f]{40}$/.test(sha || ''))) return false;
  try {
    const changed = execFileSync('git', [
      'diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--'
    ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return isDocumentationOnly(changed.split('\0').filter(Boolean));
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const docsOnly = process.argv.length === 4
    && documentationOnlyBetween(process.argv[2], process.argv[3]);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
  console.log(docsOnly ? 'Documentation checks required.' : 'Full quality checks required.');
}
