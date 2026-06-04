import assert from 'node:assert/strict';
import test from 'node:test';

import { baseProviderOf, claudeModelStorageKey, isClaudeFamily } from './provider-id';

test('baseProviderOf returns the base provider for instance ids', () => {
  assert.equal(baseProviderOf('claude'), 'claude');
  assert.equal(baseProviderOf('claude:work'), 'claude');
  assert.equal(baseProviderOf('cursor'), 'cursor');
  assert.equal(baseProviderOf('gemini'), 'gemini');
  assert.equal(baseProviderOf('opencode'), 'opencode');
});

test('baseProviderOf falls back to claude for unknown bases', () => {
  assert.equal(baseProviderOf('mystery:thing'), 'claude');
});

test('isClaudeFamily is true only for claude and claude:*', () => {
  assert.equal(isClaudeFamily('claude'), true);
  assert.equal(isClaudeFamily('claude:work'), true);
  assert.equal(isClaudeFamily('cursor'), false);
  assert.equal(isClaudeFamily('codex'), false);
});

test('claudeModelStorageKey: default keeps the legacy key; others are namespaced', () => {
  assert.equal(claudeModelStorageKey('claude'), 'claude-model');
  assert.equal(claudeModelStorageKey('claude:work'), 'claude-model:claude:work');
});
