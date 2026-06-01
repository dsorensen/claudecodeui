import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadClaudeProfiles } from '@/modules/providers/list/claude/claude-profiles.js';

const withEnv = (value: string | undefined, fn: () => void) => {
  const original = process.env.CLAUDE_PROFILES;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  if (value === undefined) delete process.env.CLAUDE_PROFILES;
  else process.env.CLAUDE_PROFILES = value;
  delete process.env.CLAUDE_CONFIG_DIR;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
  }
};

test('loadClaudeProfiles returns a single default claude profile when unset', () => {
  withEnv(undefined, () => {
    const profiles = loadClaudeProfiles();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'claude');
    assert.equal(profiles[0].configDir, path.join(os.homedir(), '.claude'));
  });
});

test('loadClaudeProfiles parses configured profiles', () => {
  withEnv(
    JSON.stringify([
      { id: 'claude', label: 'Personal', configDir: '/home/u/.claude' },
      { id: 'claude:work', label: 'Work', configDir: '/home/u/.claude-work' },
    ]),
    () => {
      const profiles = loadClaudeProfiles();
      assert.deepEqual(profiles.map((p) => p.id), ['claude', 'claude:work']);
      assert.equal(profiles[1].configDir, '/home/u/.claude-work');
    },
  );
});

test('loadClaudeProfiles prepends a default claude profile when omitted', () => {
  withEnv(
    JSON.stringify([{ id: 'claude:work', label: 'Work', configDir: '/home/u/.claude-work' }]),
    () => {
      const profiles = loadClaudeProfiles();
      assert.equal(profiles[0].id, 'claude');
      assert.deepEqual(profiles.map((p) => p.id), ['claude', 'claude:work']);
    },
  );
});

test('loadClaudeProfiles falls back to the default on malformed JSON', () => {
  withEnv('not json', () => {
    const profiles = loadClaudeProfiles();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'claude');
  });
});
