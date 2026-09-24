import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`Cloudflare Pages deployment validation failed: ${message}`);
}

function isDnsLabel(label) {
  return label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
}

export function validateCloudflarePagesDeployment({ deploymentUrl, pagesEnvironment, projectName }) {
  if (pagesEnvironment !== 'production') fail('deployment must target the production environment');
  if (typeof projectName !== 'string' || !isDnsLabel(projectName)) fail('configured Pages project name is invalid');
  if (typeof deploymentUrl !== 'string' || deploymentUrl !== deploymentUrl.trim()) fail('deployment URL is invalid');

  let url;
  try {
    url = new URL(deploymentUrl);
  } catch {
    fail('deployment URL is invalid');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.pathname !== '/' || url.search || url.hash) {
    fail('deployment URL must be an HTTPS root URL');
  }

  const projectDomain = `${projectName}.pages.dev`;
  if (url.hostname !== projectDomain && !url.hostname.endsWith(`.${projectDomain}`)) {
    fail('deployment URL does not belong to the configured Pages project');
  }

  if (url.hostname !== projectDomain) {
    const deploymentLabels = url.hostname.slice(0, -(projectDomain.length + 1)).split('.');
    if (deploymentLabels.some((label) => !isDnsLabel(label))) {
      fail('deployment URL is not a valid Pages deployment host');
    }
  }

  return `${url.origin}/`;
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--deployment-url', '--pages-environment', '--project-name'].includes(option)
      || !value || values.has(option)) {
      fail('provide deployment URL, Pages environment, and project name');
    }
    values.set(option, value);
  }
  if (args.length !== 6 || values.size !== 3) fail('provide deployment URL, Pages environment, and project name');
  return {
    deploymentUrl: values.get('--deployment-url'),
    pagesEnvironment: values.get('--pages-environment'),
    projectName: values.get('--project-name')
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(`${validateCloudflarePagesDeployment(parseArguments(process.argv.slice(2)))}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
