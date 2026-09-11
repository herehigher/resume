import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMigrationRunner,
  mapValidArray,
  MIGRATION_REGISTRY,
  migrateState,
  preferValidValue
} from '../site/assets/js/state/migrations.js';
import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { COMPATIBLE_DRAFT_STORAGE_KEYS } from '../site/assets/js/config.js';

function fakeValidator(currentVersion) {
  return (value) => ({
    valid: value?.version === currentVersion
      && typeof value?.profile?.name === 'string'
      && typeof value?.profile?.location === 'string'
      && Array.isArray(value?.projects)
      && value.projects.every((project) => typeof project.name === 'string'
        && typeof project.url === 'string'
        && typeof project.rank === 'string')
      && Array.isArray(value?.tags)
  });
}

const testRegistry = [
  {
    from: 2,
    to: 3,
    summary: 'Rename legacyName, move legacyAddress, and normalize project ranks.',
    migrate(source) {
      const profile = source.profile || {};
      return {
        salvaged: true,
        state: {
          version: 3,
          profile: {
            name: preferValidValue(profile.name, source.legacyName, (value) => typeof value === 'string', ''),
            location: preferValidValue(profile.location, source.legacyAddress, (value) => typeof value === 'string', '')
          },
          projects: mapValidArray(source.legacyProjects, (project) => {
            if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
            return {
              name: typeof project.name === 'string' ? project.name : '',
              url: typeof project.url === 'string' ? project.url : '',
              rank: Number.isSafeInteger(project.rank) ? String(project.rank) : ''
            };
          })
        }
      };
    }
  },
  {
    from: 3,
    to: 4,
    summary: 'Add fixed migration defaults and remove retired legacy fields.',
    migrate(source) {
      return {
        state: {
          version: 4,
          profile: source.profile,
          projects: source.projects,
          tags: []
        }
      };
    }
  },
  {
    from: 4,
    to: 5,
    summary: 'Keep the normalized fields in their v5 shape.',
    migrate(source) {
      return { state: { ...source, version: 5 } };
    }
  }
];

function createV2State(gender) {
  const state = createDefaultState('en');
  state.version = 2;
  delete state.profile.fields.nationality;
  delete state.documents.en.resume.showOptionalPersonalDetails;
  state.profile.fields.gender = gender;
  return state;
}

test('the production v3 format is current, migrates the explicit v2 namespace, and keeps v1 unsupported', () => {
  const current = createDefaultState('en');

  assert.equal(current.version, 3);
  assert.equal(Object.hasOwn(current, 'schemaRevision'), false);
  assert.equal(migrateState(current).status, 'current');
  assert.deepEqual(migrateState({ ...current, schemaRevision: 1 }), { status: 'unsupported', reason: 'current-validation-failed' });
  assert.deepEqual(migrateState({ ...current, version: 1 }), { status: 'unsupported', reason: 'migration-step-missing' });
  assert.deepEqual(COMPATIBLE_DRAFT_STORAGE_KEYS, ['resume-studio-web-v2']);
  assert.deepEqual(MIGRATION_REGISTRY.map(({ from, to }) => ({ from, to })), [{ from: 2, to: 3 }]);
});

test('the v2 to v3 migration normalizes all recognized gender values and adds fixed defaults', () => {
  for (const [legacyGender, gender] of [
    ['男性', 'male'], ['男', 'male'], ['Male', 'male'],
    ['女性', 'female'], ['女', 'female'], ['Female', 'female'],
    ['その他', 'other'], ['其他', 'other'], ['Other', 'other'], ['', '']
  ]) {
    const source = createV2State(legacyGender);
    const before = structuredClone(source);
    const result = migrateState(source);
    assert.equal(result.status, 'migrated', legacyGender || 'empty gender');
    assert.equal(result.state.version, 3);
    assert.equal(result.state.profile.fields.gender, gender);
    assert.equal(result.state.profile.fields.nationality, '');
    assert.equal(result.state.documents.en.resume.showOptionalPersonalDetails, false);
    assert.deepEqual(source, before, 'migration never mutates the v2 input');
  }
});

test('the v2 to v3 migration salvages unknown non-empty gender without discarding recognized data', () => {
  const source = createV2State('Unrecognized fictional gender');
  source.profile.fields.fullName = 'Fictional migration canary';
  source.documents.ja.fields.motivation = 'Recognized document content remains intact.';

  const result = migrateState(source);
  assert.equal(result.status, 'salvaged');
  assert.equal(result.state.profile.fields.gender, '');
  assert.equal(result.state.profile.fields.fullName, 'Fictional migration canary');
  assert.equal(result.state.documents.ja.fields.motivation, 'Recognized document content remains intact.');
});

test('version classification rejects malformed, future, old, and incomplete paths distinctly', () => {
  const current = createDefaultState();
  for (const version of [undefined, null, '2', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = structuredClone(current);
    candidate.version = version;
    assert.deepEqual(migrateState(candidate), { status: 'unsupported', reason: 'invalid-version' });
  }
  assert.deepEqual(migrateState({ ...current, version: 4 }), { status: 'future', reason: 'future-version' });

  const runnerAtSix = createMigrationRunner({ currentVersion: 6, registry: testRegistry, validateCurrent: fakeValidator(6) });
  assert.deepEqual(runnerAtSix({ version: 2 }), { status: 'too-old', reason: 'version-window-expired' });
  const runnerAtFive = createMigrationRunner({ currentVersion: 5, registry: testRegistry, validateCurrent: fakeValidator(5) });
  assert.deepEqual(runnerAtFive({ version: 3, profile: {}, projects: [] }), { status: 'unsupported', reason: 'final-validation-failed' });
});

test('the injected three-step registry preserves valid values and deterministic salvage', () => {
  const runner = createMigrationRunner({ currentVersion: 5, registry: testRegistry, validateCurrent: fakeValidator(5) });
  const v2 = {
    version: 2,
    legacyName: 'Old name must lose to a valid new value.',
    legacyAddress: 'Old address must lose to a valid new value.',
    profile: { name: '', location: '' },
    legacyProjects: [
      { name: '', url: 'https://example.test/empty-name', rank: 0 },
      { name: 'Fictional project', url: 7, rank: 3 },
      null,
      'not-an-object'
    ]
  };
  const before = structuredClone(v2);
  const first = runner(v2);
  const second = runner(v2);

  assert.equal(first.status, 'salvaged');
  assert.deepEqual(first, second);
  assert.deepEqual(v2, before, 'migration never mutates its input');
  assert.deepEqual(first.state, {
    version: 5,
    profile: { name: '', location: '' },
    projects: [
      { name: '', url: 'https://example.test/empty-name', rank: '0' },
      { name: 'Fictional project', url: '', rank: '3' }
    ],
    tags: []
  });
  assert.equal(runner(first.state).status, 'current');
});

test('migration failures and invalid results are not reclassified as old versions', () => {
  const throwingRunner = createMigrationRunner({
    currentVersion: 3,
    registry: [{ from: 2, to: 3, summary: 'Throws.', migrate() { throw new Error('fixture failure'); } }],
    validateCurrent: fakeValidator(3)
  });
  assert.deepEqual(throwingRunner({ version: 2 }), { status: 'unsupported', reason: 'migration-failed' });

  const invalidRunner = createMigrationRunner({
    currentVersion: 3,
    registry: [{ from: 2, to: 3, summary: 'Returns the wrong version.', migrate(source) { return source; } }],
    validateCurrent: fakeValidator(3)
  });
  assert.deepEqual(invalidRunner({ version: 2 }), { status: 'unsupported', reason: 'migration-step-invalid' });
});
