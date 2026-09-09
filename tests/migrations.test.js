import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createMigrationRunner,
  isBootstrapState,
  mapValidArray,
  migrateState,
  preferValidValue
} from '../site/assets/js/state/migrations.js';
import { validateCurrentState, validateState } from '../site/assets/js/state/schema.js';

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/schema-migrations/${name}.json`, import.meta.url), 'utf8'));
}

function fakeValidator(value) {
  return {
    valid: value?.version === 1
      && Number.isSafeInteger(value.schemaRevision)
      && value.schemaRevision >= 1
      && typeof value?.profile?.name === 'string'
      && typeof value?.profile?.location === 'string'
      && Array.isArray(value?.projects)
      && value.projects.every((project) => typeof project.name === 'string'
        && typeof project.url === 'string'
        && typeof project.rank === 'string')
      && Array.isArray(value?.tags)
  };
}

const testRegistry = [
  {
    from: 1,
    to: 2,
    summary: 'Rename legacyName, move legacyAddress, and explicitly normalize project ranks.',
    migrate(source) {
      const profile = source.profile || {};
      return {
        salvaged: true,
        state: {
          version: 1,
          schemaRevision: 2,
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
    from: 2,
    to: 3,
    summary: 'Add fixed migration defaults and remove retired legacy fields.',
    migrate(source) {
      return {
        state: {
          version: 1,
          schemaRevision: 3,
          profile: source.profile,
          projects: source.projects,
          tags: []
        }
      };
    }
  },
  {
    from: 3,
    to: 4,
    summary: 'Keep the normalized fields in their R4 shape.',
    migrate(source) {
      return { state: { ...source, schemaRevision: 4 } };
    }
  }
];

test('B0 is a fixed, strict bootstrap shape and migrates to the fixed R1 fixture', () => {
  const b0 = fixture('bootstrap-b0');
  const expected = fixture('bootstrap-r1');
  const inputBefore = structuredClone(b0);

  assert.equal(isBootstrapState(b0), true);
  assert.equal(validateState(b0).valid, true, 'legacy reader remains usable before #156 wiring');
  assert.equal(validateCurrentState(b0).valid, false);
  assert.deepEqual(migrateState(b0), { status: 'migrated', reason: 'bootstrap', state: expected });
  assert.deepEqual(b0, inputBefore, 'migration never mutates the input');
  assert.equal(validateCurrentState(expected).valid, true);

  const unknownKey = structuredClone(b0);
  unknownKey.documents.en.resume.unrecognized = 'Bootstrap must not infer unknown fields.';
  assert.equal(isBootstrapState(unknownKey), false);

  const priorJapaneseCareer = structuredClone(b0);
  priorJapaneseCareer.documents.ja.careers[0].responsibilities = 'Do not infer an older career shape.';
  assert.equal(isBootstrapState(priorJapaneseCareer), false);
  assert.deepEqual(migrateState(priorJapaneseCareer), { status: 'unsupported', reason: 'unknown-revision' });
});

test('revision classification is exclusive for malformed, future, old, and unknown payloads', () => {
  const r1 = fixture('bootstrap-r1');
  for (const schemaRevision of [undefined, null, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = structuredClone(r1);
    candidate.schemaRevision = schemaRevision;
    assert.equal(migrateState(candidate).status, 'unsupported', `revision ${String(schemaRevision)}`);
  }
  const future = structuredClone(r1);
  future.schemaRevision = 2;
  assert.deepEqual(migrateState(future), { status: 'future', reason: 'future-revision' });
  assert.deepEqual(migrateState({ ...r1, version: 2 }), { status: 'unsupported', reason: 'unknown-version' });

  const runnerAtFive = createMigrationRunner({ currentRevision: 5, registry: testRegistry, validateCurrent: fakeValidator });
  assert.deepEqual(runnerAtFive({ version: 1, schemaRevision: 1 }), { status: 'too-old', reason: 'revision-window-expired' });
  const runnerAtFour = createMigrationRunner({ currentRevision: 4, registry: testRegistry, validateCurrent: fakeValidator });
  assert.equal(runnerAtFour({ version: 1, schemaRevision: 1, profile: {}, legacyProjects: [] }).status, 'salvaged');
});

test('the test-only three-step registry preserves valid new paths, arrays, and deterministic salvage', () => {
  const runner = createMigrationRunner({ currentRevision: 4, registry: testRegistry, validateCurrent: fakeValidator });
  const r1 = {
    version: 1,
    schemaRevision: 1,
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
  const before = structuredClone(r1);
  const first = runner(r1);
  const second = runner(r1);

  assert.equal(first.status, 'salvaged');
  assert.deepEqual(first, second, 'the same source always has the same migration result');
  assert.deepEqual(r1, before, 'test steps receive an isolated copy');
  assert.deepEqual(first.state, {
    version: 1,
    schemaRevision: 4,
    profile: { name: '', location: '' },
    projects: [
      { name: '', url: 'https://example.test/empty-name', rank: '0' },
      { name: 'Fictional project', url: '', rank: '3' }
    ],
    tags: []
  });
  assert.equal(runner(first.state).status, 'current', 'rerunning a migrated state is a no-op');
});

test('current no-op and migration failures are never reclassified as too old or recovery', () => {
  const current = { version: 1, schemaRevision: 4, profile: { name: '', location: '' }, projects: [], tags: [] };
  const runner = createMigrationRunner({ currentRevision: 4, registry: testRegistry, validateCurrent: fakeValidator });
  const currentResult = runner(current);
  assert.equal(currentResult.status, 'current');
  assert.equal(currentResult.state, current);
  assert.deepEqual(runner({ ...current, projects: {} }), { status: 'unsupported', reason: 'current-validation-failed' });

  const malformedCurrent = fixture('bootstrap-r1');
  malformedCurrent.documents.ja.careers = {};
  assert.doesNotThrow(() => validateCurrentState(malformedCurrent));
  assert.equal(validateCurrentState(malformedCurrent).valid, false);

  const throwingRunner = createMigrationRunner({
    currentRevision: 2,
    registry: [{ from: 1, to: 2, summary: 'Throws for a fixture-only failure.', migrate() { throw new Error('fixture failure'); } }],
    validateCurrent: fakeValidator
  });
  assert.deepEqual(throwingRunner({ version: 1, schemaRevision: 1 }), { status: 'unsupported', reason: 'migration-failed' });
});

test('B0 support ends at R4 without treating revision-less data as too old', () => {
  const b0 = fixture('bootstrap-b0');
  const runner = createMigrationRunner({ currentRevision: 4, registry: testRegistry, validateCurrent: fakeValidator });
  assert.deepEqual(runner(b0), { status: 'unsupported', reason: 'unknown-revision' });
});
