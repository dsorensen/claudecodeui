import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listClaudeProfileSummaries,
  loadClaudeProfiles,
} from '@/modules/providers/list/claude/claude-profiles.js';

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

test('listClaudeProfileSummaries returns the default claude profile, marked default, with no configDir', () => {
  const original = process.env.CLAUDE_PROFILES;
  delete process.env.CLAUDE_PROFILES;
  try {
    const summaries = listClaudeProfileSummaries();
    const def = summaries.find((p) => p.id === 'claude');
    assert.ok(def, 'default claude profile present');
    assert.equal(def?.isDefault, true);
    for (const s of summaries) {
      assert.deepEqual(Object.keys(s).sort(), ['id', 'isDefault', 'label']);
    }
  } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
});

test('listClaudeProfileSummaries maps configured profiles; only id "claude" is default', () => {
  const original = process.env.CLAUDE_PROFILES;
  process.env.CLAUDE_PROFILES = JSON.stringify([
    { id: 'claude', label: 'Personal', configDir: '/tmp/a' },
    { id: 'claude:work', label: 'Work', configDir: '/tmp/b' },
  ]);
  try {
    const summaries = listClaudeProfileSummaries();
    const work = summaries.find((p) => p.id === 'claude:work');
    assert.ok(work);
    assert.equal(work?.isDefault, false);
    assert.equal(work?.label, 'Work');
    assert.equal(summaries.find((p) => p.id === 'claude')?.isDefault, true);
    assert.equal('configDir' in (work as Record<string, unknown>), false);
  } finally {
    if (original === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = original;
  }
});
