import assert from 'node:assert/strict';
import test from 'node:test';

import { getClaudeProfileConfigDir } from '@/modules/providers/list/claude/claude-profiles.js';

const withEnv = (value: string | undefined, fn: () => void) => {
  const original = process.env.CLAUDE_PROFILES;
  if (value === undefined) delete process.env.CLAUDE_PROFILES;
  else process.env.CLAUDE_PROFILES = value;
  try { fn(); } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
};

test('getClaudeProfileConfigDir returns the configured dir for an instance id', () => {
  withEnv(
    JSON.stringify([
      { id: 'claude', label: 'P', configDir: '/home/u/.claude' },
      { id: 'claude:work', label: 'W', configDir: '/home/u/.claude-work' },
    ]),
    () => {
      assert.equal(getClaudeProfileConfigDir('claude:work'), '/home/u/.claude-work');
      assert.equal(getClaudeProfileConfigDir('claude'), '/home/u/.claude');
    },
  );
});

test('getClaudeProfileConfigDir returns undefined for an unknown id', () => {
  withEnv(undefined, () => {
    assert.equal(getClaudeProfileConfigDir('claude:nope'), undefined);
  });
});
