import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getClaudeJsonPathForDir } from '@/shared/claude-config-dir.js';

test('getClaudeJsonPathForDir keeps the legacy home-root path for the default dir', () => {
  const defaultDir = path.join(os.homedir(), '.claude');
  assert.equal(getClaudeJsonPathForDir(defaultDir), path.join(os.homedir(), '.claude.json'));
});

test('getClaudeJsonPathForDir nests .claude.json inside a custom dir', () => {
  const customDir = path.join(os.homedir(), '.claude-13layers');
  assert.equal(getClaudeJsonPathForDir(customDir), path.join(customDir, '.claude.json'));
});
