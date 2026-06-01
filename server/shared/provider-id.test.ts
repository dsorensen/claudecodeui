import assert from 'node:assert/strict';
import test from 'node:test';

import { baseProviderOf, isClaudeFamily } from '@/shared/provider-id.js';

test('baseProviderOf returns the bare id for a base provider', () => {
  assert.equal(baseProviderOf('claude'), 'claude');
  assert.equal(baseProviderOf('gemini'), 'gemini');
});

test('baseProviderOf strips the instance suffix', () => {
  assert.equal(baseProviderOf('claude:13layers'), 'claude');
  assert.equal(baseProviderOf('claude:work'), 'claude');
});

test('baseProviderOf throws on an unknown base', () => {
  assert.throws(() => baseProviderOf('bogus'));
  assert.throws(() => baseProviderOf('bogus:x'));
});

test('isClaudeFamily recognizes claude instance ids', () => {
  assert.equal(isClaudeFamily('claude'), true);
  assert.equal(isClaudeFamily('claude:13layers'), true);
  assert.equal(isClaudeFamily('gemini'), false);
});
