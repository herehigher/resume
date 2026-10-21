import { DEPLOYMENT_PATH_CONTRACTS, publicDocumentContracts } from './deployment-path-contract.mjs';

const schemaPath = '/schema/resume-studio-web-v4.schema.json';

export function discoveryLinks(contract) {
  if (!['public-document', 'static-markdown'].includes(contract.semantic)) return [];
  const markdown = contract.semantic === 'static-markdown';
  const counterpart = DEPLOYMENT_PATH_CONTRACTS.find((candidate) => candidate.lang === contract.lang
    && candidate.semantic === (markdown ? 'public-document' : 'static-markdown'));
  return [
    { href: `/${counterpart.urlPath}`, rel: 'alternate', type: markdown ? 'text/html' : 'text/markdown', hreflang: contract.lang },
    { href: schemaPath, rel: 'describedby', type: 'application/json' },
    { href: '/sitemap.xml', rel: 'sitemap', type: 'application/xml' }
  ];
}

export function discoveryLinkHeader(contract) {
  return discoveryLinks(contract).map(({ href, rel, type, hreflang }) => `<${href}>; rel="${rel}"; type="${type}"${hreflang ? `; hreflang="${hreflang}"` : ''}`).join(', ');
}

export function pagesDiscoveryHeaders() {
  const rules = [];
  for (const contract of publicDocumentContracts()) {
    for (const route of [`/${contract.urlPath}`, `/${contract.artifactPath}`]) {
      rules.push(`${route}\n  Link: ${discoveryLinkHeader(contract)}`);
    }
  }
  for (const contract of DEPLOYMENT_PATH_CONTRACTS.filter((candidate) => candidate.semantic === 'static-markdown')) {
    rules.push(`/${contract.urlPath}\n  Content-Type: text/markdown; charset=utf-8\n  Content-Language: ${contract.lang}\n  Link: ${discoveryLinkHeader(contract)}`);
  }
  return rules.join('\n');
}

export function assertDiscoveryLinkHeader(value, contract) {
  const actual = value.split(/,\s*(?=<)/).map((item) => item.trim()).sort();
  const expected = discoveryLinkHeader(contract).split(/,\s*(?=<)/).sort();
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error('discovery Link header must match the resource language and relations');
  }
}

export function assertHtmlDiscovery(content, contract) {
  const links = [...content.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => Object.fromEntries(
    [...tag.matchAll(/([^\s=/>]+)="([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), value])
  ));
  for (const expected of discoveryLinks(contract)) {
    const matches = links.filter((link) => link.rel === expected.rel && link.type === expected.type);
    if (matches.length !== 1 || Object.entries(expected).some(([key, value]) => matches[0][key] !== value)) {
      throw new Error('HTML discovery links must match the resource language and relations');
    }
  }
}

export function assertStaticMarkdown(content, contract) {
  const home = publicDocumentContracts().find((candidate) => candidate.lang === contract.lang);
  const requiredLinks = [`/${home.urlPath}`, `/editor/?lang=${contract.lang}`, schemaPath,
    '/schema/resume-studio-web-v4.example.json', '/sitemap.xml'];
  const targets = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target);
  if (!content.startsWith(`${contract.marker}\n`) || /<html\b/i.test(content)
    || requiredLinks.some((target) => !targets.includes(target))
    || !content.includes('x-resume-studio-uniqueBy: "id"') || !content.includes('`version: 4`')) {
    throw new Error('static Markdown must contain the localized guide, editor, v4 Schema, and ID constraint');
  }
}
