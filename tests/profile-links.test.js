import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnglishSampleState } from '../site/assets/js/data/en-sample.js';
import { createDefaultState, createJapaneseSampleState } from '../site/assets/js/state/defaults.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { createChineseSampleState } from '../site/assets/js/state/zh-CN.js';
import {
  MAX_PROFILE_LINKS,
  addProfileLink,
  getProfileLinks,
  profileLinkDisplayUrl,
  profileLinkIcon,
  profileLinkMeta,
  removeProfileLink
} from '../site/assets/js/utils/profile-links.js';

test('all localized samples use the same fictional profile links in the same order', () => {
  const expectedLinks = [
    'https://github.com/fictional-resume-profile',
    'https://www.linkedin.com/in/fictional-resume-profile',
    'https://fictional-resume-profile.example'
  ];
  const sampleLinks = [
    createJapaneseSampleState(createDefaultState('ja')).profile.fields.links,
    createChineseSampleState(createDefaultState('zh-CN')).profile.fields.links,
    createEnglishSampleState(createDefaultState('en')).profile.fields.links
  ];

  for (const links of sampleLinks) assert.deepEqual(links, expectedLinks);
});

test('profile links recognize known hostnames only through complete domains or their subdomains', () => {
  const summary = ({ name, icon }) => ({ name, icon });
  assert.deepEqual(summary(profileLinkMeta('https://www.linkedin.com/in/example')), { name: 'LinkedIn', icon: 'linkedin' });
  assert.deepEqual(summary(profileLinkMeta('https://github.com/example')), { name: 'GitHub', icon: 'github' });
  assert.deepEqual(summary(profileLinkMeta('https://mobile.x.com/example')), { name: 'X', icon: 'x' });
  assert.deepEqual(profileLinkMeta('https://github.com.example.test/example'), { name: 'Website', icon: 'external' });
  assert.deepEqual(profileLinkMeta('https://x.com.example.test/example'), { name: 'Website', icon: 'external' });
  assert.deepEqual(profileLinkMeta('javascript:alert(1)'), { name: 'Website', icon: 'external' });
  assert.equal(profileLinkDisplayUrl('https://example.test/path/'), 'example.test/path');
});

test('professional profile sites recognize their complete hostnames and subdomains', () => {
  const summary = ({ name, icon }) => ({ name, icon });
  const sites = [
    { host: 'credly.com', name: 'Credly', icon: 'credly' },
    { host: 'stackoverflow.com', name: 'Stack Overflow', icon: 'stackoverflow' },
    { host: 'kaggle.com', name: 'Kaggle', icon: 'kaggle' },
    { host: 'behance.net', name: 'Behance', icon: 'behance' },
    { host: 'dribbble.com', name: 'Dribbble', icon: 'dribbble' },
    { host: 'orcid.org', name: 'ORCID', icon: 'orcid' },
    { host: 'scholar.google.com', name: 'Google Scholar', icon: 'google-scholar' },
    { host: 'huggingface.co', name: 'Hugging Face', icon: 'hugging-face' }
  ];

  for (const site of sites) {
    for (const hostname of [site.host, `www.${site.host}`, `profiles.${site.host}`]) {
      const url = `https://${hostname}/fictional-profile`;
      assert.deepEqual(summary(profileLinkMeta(url)), { name: site.name, icon: site.icon }, url);
    }
  }

  assert.deepEqual(summary(profileLinkMeta('http://credly.com/fictional-profile')), { name: 'Credly', icon: 'credly' });
});

test('professional profile detection rejects spoofed hosts, unrelated Google pages, invalid URLs, and unsafe schemes', () => {
  const sites = [
    'credly.com', 'stackoverflow.com', 'kaggle.com', 'behance.net',
    'dribbble.com', 'orcid.org', 'scholar.google.com', 'huggingface.co'
  ];
  const spoofedUrls = sites.flatMap((host) => [
    `https://${host}.attacker.example/fictional-profile`,
    `https://fake-${host}/fictional-profile`
  ]);
  const unsupportedUrls = [
    'https://google.com/scholar',
    'https://www.google.com/scholar',
    'https://unknown-profile-site.example/fictional-profile',
    'https://[invalid/fictional-profile',
    'ftp://credly.com/fictional-profile',
    'javascript:alert(1)',
    'data:text/html,profile'
  ];

  for (const url of [...spoofedUrls, ...unsupportedUrls]) {
    assert.deepEqual(profileLinkMeta(url), { name: 'Website', icon: 'external' }, url);
  }
});

test('new profile-site icons render as self-contained inline SVG paths', () => {
  for (const icon of ['credly', 'stackoverflow', 'kaggle', 'behance', 'dribbble', 'orcid', 'google-scholar', 'hugging-face']) {
    const markup = profileLinkIcon(icon);
    assert.match(markup, new RegExp(`class="profile-link-icon profile-link-icon--${icon}"`));
    assert.match(markup, /<path\b|<circle\b/);
    assert.doesNotMatch(markup, /<image\b|\b(?:href|xlink:href)=/i);
  }
});

test('profile links preserve their order in the shared profile array and stop at three', () => {
  const fields = createDefaultState('ja').profile.fields;
  fields.links = [
    'https://github.com/example',
    'https://www.linkedin.com/in/example',
    'https://example.test/portfolio'
  ];

  assert.equal(getProfileLinks(fields).length, MAX_PROFILE_LINKS);
  assert.equal(addProfileLink(fields), false);
  assert.equal(removeProfileLink(fields, 1), true);
  assert.deepEqual(fields.links, [
    'https://github.com/example',
    'https://example.test/portfolio'
  ]);
  assert.equal(addProfileLink(fields), true);
  assert.equal(fields.links.length, MAX_PROFILE_LINKS);
});

test('profile link arrays with more than three items are rejected by the current state validator', () => {
  const state = createDefaultState('en');
  state.profile.fields.links = ['https://one.example.test', 'https://two.example.test', 'https://three.example.test', 'https://four.example.test'];
  assert.equal(validateState(state).valid, false);
  assert.match(validateState(state).errors.join('\n'), /profile\.fields\.links/);
});

test('profile link arrays reject non-string entries to match the public JSON Schema', () => {
  for (const invalidLink of [1, {}, null]) {
    const state = createDefaultState('en');
    state.profile.fields.links = [invalidLink];
    const result = validateState(state);
    assert.equal(result.valid, false, `expected ${JSON.stringify(invalidLink)} to be rejected`);
    assert.match(result.errors.join('\n'), /profile\.fields\.links/);
  }
});
