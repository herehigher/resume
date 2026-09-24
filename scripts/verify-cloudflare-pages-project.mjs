import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCloudflarePagesBranch } from './validate-cloudflare-pages-branch.mjs';

function fail(message) {
  throw new Error(`Cloudflare Pages project verification failed: ${message}`);
}

function validateProjectName(projectName) {
  if (typeof projectName !== 'string' || projectName.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(projectName)) {
    fail('project name is invalid');
  }
  return projectName;
}

export function verifyCloudflarePagesProject({ projectResponse, expectedProjectName, expectedProductionBranch, previewBranch }) {
  const projectName = validateProjectName(expectedProjectName);
  const expectedBranch = validateCloudflarePagesBranch(expectedProductionBranch);
  const preview = validateCloudflarePagesBranch(previewBranch);

  if (projectResponse?.success !== true
    || !projectResponse.result || typeof projectResponse.result !== 'object') {
    fail('Cloudflare did not confirm the configured Pages project');
  }

  const result = projectResponse.result;
  if (result.name !== projectName) fail('Cloudflare returned a different Pages project');
  const actualBranch = validateCloudflarePagesBranch(result.production_branch);
  if (actualBranch !== expectedBranch) fail('configured production branch does not match the Cloudflare project');
  if (actualBranch === preview) fail('preview branch collides with the Cloudflare production branch');

  return actualBranch;
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--response', '--project-name', '--production-branch', '--preview-branch'].includes(option)
      || !value || values.has(option)) {
      fail('provide response file, project name, production branch, and preview branch');
    }
    values.set(option, value);
  }
  if (args.length !== 8 || values.size !== 4) {
    fail('provide response file, project name, production branch, and preview branch');
  }

  let projectResponse;
  try {
    projectResponse = JSON.parse(readFileSync(values.get('--response'), 'utf8'));
  } catch {
    fail('Cloudflare project response is invalid');
  }

  return {
    projectResponse,
    expectedProjectName: values.get('--project-name'),
    expectedProductionBranch: values.get('--production-branch'),
    previewBranch: values.get('--preview-branch')
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(`${verifyCloudflarePagesProject(parseArguments(process.argv.slice(2)))}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
