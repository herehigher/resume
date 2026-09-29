import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerProductionDispatch } from '../scripts/production-dispatch-auth.mjs';

const ownerDispatch = {
  repository: 'herehigher/resume',
  ref: 'refs/heads/main',
  actor: 'herehigher',
  triggeringActor: 'herehigher'
};

test('baseline and rollback dispatch require owner, owner rerunner, official repository, and main', () => {
  assert.equal(validateOwnerProductionDispatch(ownerDispatch), true);
  assert.throws(() => validateOwnerProductionDispatch({ ...ownerDispatch, triggeringActor: 'another-user' }), /owner-triggered/);
  assert.throws(() => validateOwnerProductionDispatch({ ...ownerDispatch, actor: 'another-user' }), /owner-triggered/);
  assert.throws(() => validateOwnerProductionDispatch({ ...ownerDispatch, ref: 'refs/heads/feature' }), /owner-triggered/);
  assert.throws(() => validateOwnerProductionDispatch({ ...ownerDispatch, repository: 'fork/resume' }), /owner-triggered/);
});
