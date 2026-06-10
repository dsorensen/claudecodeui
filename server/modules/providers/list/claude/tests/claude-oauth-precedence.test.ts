import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ClaudeProviderAuth,
  resolveClaudeAuthStatus,
} from '@/modules/providers/list/claude/claude-auth.provider.js';

const validOAuth = { kind: 'valid', email: 'pro@example.com' } as const;
const noOAuth = { kind: 'invalid', error: 'not authenticated' } as const;

test('OAuth credentials take precedence over an environment API key', () => {
  const status = resolveClaudeAuthStatus(validOAuth, 'sk-ant-xxx', undefined, undefined);
  assert.equal(status.authenticated, true);
  assert.equal(status.method, 'credentials_file');
  assert.equal(status.email, 'pro@example.com');
});

test('falls back to the env API key when OAuth is absent', () => {
  const status = resolveClaudeAuthStatus(noOAuth, 'sk-ant-xxx', undefined, undefined);
  assert.equal(status.authenticated, true);
  assert.equal(status.method, 'api_key');
});

test('falls back to settings.json API key, then auth token', () => {
  assert.equal(resolveClaudeAuthStatus(noOAuth, undefined, 'sk-settings', undefined).method, 'api_key');
  const tok = resolveClaudeAuthStatus(noOAuth, undefined, undefined, 'tok-xxx');
  assert.equal(tok.method, 'api_key');
  assert.equal(tok.email, 'Configured via settings.json');
});

test('reports the OAuth error when nothing authenticates', () => {
  const status = resolveClaudeAuthStatus(
    { kind: 'invalid', error: 'Claude login has expired. Run claude /login again.' },
    undefined,
    undefined,
    undefined
  );
  assert.equal(status.authenticated, false);
  assert.equal(status.method, null);
  assert.match(status.error ?? '', /expired/);
});

function tempConfigDir(creds?: unknown): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ccui-oauth-'));
  if (creds !== undefined) {
    writeFileSync(
      path.join(dir, '.credentials.json'),
      typeof creds === 'string' ? creds : JSON.stringify(creds)
    );
  }
  return dir;
}

test('hasClaudeOAuth is true for a valid, unexpired token', async () => {
  const dir = tempConfigDir({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 60_000 } });
  try {
    assert.equal(await new ClaudeProviderAuth(dir).hasClaudeOAuth(), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hasClaudeOAuth is false for expired, missing, or malformed credentials', async () => {
  const expired = tempConfigDir({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() - 1000 } });
  const missing = tempConfigDir();
  const malformed = tempConfigDir('{ not valid json');
  try {
    assert.equal(await new ClaudeProviderAuth(expired).hasClaudeOAuth(), false);
    assert.equal(await new ClaudeProviderAuth(missing).hasClaudeOAuth(), false);
    assert.equal(await new ClaudeProviderAuth(malformed).hasClaudeOAuth(), false);
  } finally {
    [expired, missing, malformed].forEach((d) => rmSync(d, { recursive: true, force: true }));
  }
});
