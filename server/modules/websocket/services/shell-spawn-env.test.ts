import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShellSpawnEnv } from '@/modules/websocket/services/shell-websocket.service.js';

test('strips ANTHROPIC_API_KEY for a claude shell when OAuth is present', () => {
  const env = buildShellSpawnEnv({ ANTHROPIC_API_KEY: 'sk-x', PATH: '/usr/bin' }, 'claude', true);
  assert.equal(env.ANTHROPIC_API_KEY, undefined, 'API key dropped so the CLI uses OAuth');
  assert.equal(env.PATH, '/usr/bin', 'other env preserved');
  assert.equal(env.TERM, 'xterm-256color');
  assert.equal(env.COLORTERM, 'truecolor');
  assert.equal(env.FORCE_COLOR, '3');
});

test('keeps ANTHROPIC_API_KEY for a claude shell when there is no OAuth', () => {
  const env = buildShellSpawnEnv({ ANTHROPIC_API_KEY: 'sk-x' }, 'claude', false);
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-x');
});

test('keeps ANTHROPIC_API_KEY for a non-claude provider even with OAuth', () => {
  const env = buildShellSpawnEnv({ ANTHROPIC_API_KEY: 'sk-x' }, 'cursor', true);
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-x');
});

test('does not mutate the provided base env', () => {
  const base: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-x' };
  buildShellSpawnEnv(base, 'claude', true);
  assert.equal(base.ANTHROPIC_API_KEY, 'sk-x', 'base env left untouched');
});
