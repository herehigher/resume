import test from 'node:test';
import assert from 'node:assert/strict';

import { GENDER_LABELS, genderLabel } from '../site/assets/js/utils/personal-details.js';
import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { validateState } from '../site/assets/js/state/schema.js';

test('gender values are locale-independent and labels are localized', () => {
  assert.deepEqual(GENDER_LABELS.ja, { male: '男性', female: '女性', other: 'その他' });
  assert.deepEqual(GENDER_LABELS['zh-CN'], { male: '男', female: '女', other: '其他' });
  assert.deepEqual(GENDER_LABELS.en, { male: 'Male', female: 'Female', other: 'Other' });
  assert.equal(genderLabel('female', 'ja'), '女性');
  assert.equal(genderLabel('female', 'zh-CN'), '女');
  assert.equal(genderLabel('female', 'en'), 'Female');
  assert.equal(genderLabel('unsupported', 'en'), '');
});

test('new English resumes default optional personal details to off and retain shared nationality', () => {
  const state = createDefaultState('en');
  state.profile.fields.nationality = 'Fictionland';

  assert.equal(state.documents.en.resume.showOptionalPersonalDetails, false);
  assert.equal(validateState(state).valid, true);
});
