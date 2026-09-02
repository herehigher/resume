import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { validateState } from '../site/assets/js/state/schema.js';
import {
  MAX_PROFILE_LINKS,
  addProfileLink,
  getProfileLinks,
  profileLinkDisplayUrl,
  profileLinkMeta,
  removeProfileLink
} from '../site/assets/js/utils/profile-links.js';

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

test('profile link arrays with more than three items are rejected by the v1 state validator', () => {
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
