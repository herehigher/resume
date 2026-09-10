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

test('the production v2 format is current and v1 is intentionally unsupported', () => {
  const current = createDefaultState('en');

  assert.equal(current.version, 2);
  assert.equal(Object.hasOwn(current, 'schemaRevision'), false);
  assert.equal(migrateState(current).status, 'current');
  assert.deepEqual(migrateState({ ...current, schemaRevision: 1 }), { status: 'unsupported', reason: 'current-validation-failed' });
  assert.deepEqual(migrateState({ ...current, version: 1 }), { status: 'unsupported', reason: 'migration-step-missing' });
  assert.deepEqual(MIGRATION_REGISTRY, []);
});

test('version classification rejects malformed, future, old, and incomplete paths distinctly', () => {
  const current = createDefaultState();
  for (const version of [undefined, null, '2', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = structuredClone(current);
    candidate.version = version;
    assert.deepEqual(migrateState(candidate), { status: 'unsupported', reason: 'invalid-version' });
  }
  assert.deepEqual(migrateState({ ...current, version: 3 }), { status: 'future', reason: 'future-version' });

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
