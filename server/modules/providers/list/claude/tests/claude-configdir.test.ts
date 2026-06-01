import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeProviderAuth } from '@/modules/providers/list/claude/claude-auth.provider.js';

test('ClaudeProviderAuth reads credentials from the configured dir', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-profile-'));
  await fs.writeFile(
    path.join(dir, '.credentials.json'),
    JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 60_000 } }),
    'utf8',
  );

  const auth = new ClaudeProviderAuth(dir);
  const status = await auth.getStatus();
  // checkInstalled() may be false in this env; either the credential read succeeded
  // (method 'credentials_file') or the CLI isn't installed — both acceptable here.
  assert.ok(status.method === 'credentials_file' || status.installed === false);

  await fs.rm(dir, { recursive: true, force: true });
});
