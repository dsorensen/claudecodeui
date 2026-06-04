import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';

const writeSessionFile = async (configDir: string, sessionId: string, cwd: string) => {
  const projectDir = path.join(configDir, 'projects', cwd.replace(/[^a-zA-Z0-9-]/g, '-'));
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, `${sessionId}.jsonl`),
    JSON.stringify({ sessionId, cwd }) + '\n',
    'utf8',
  );
};

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'multiprofile-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('two Claude profiles index their sessions under distinct instance ids', { concurrency: false }, async () => {
  const dirA = await mkdtemp(path.join(os.tmpdir(), 'claude-a-'));
  const dirB = await mkdtemp(path.join(os.tmpdir(), 'claude-b-'));
  await writeSessionFile(dirA, 'sess-a', '/work/a');
  await writeSessionFile(dirB, 'sess-b', '/work/b');

  const originalProfiles = process.env.CLAUDE_PROFILES;
  process.env.CLAUDE_PROFILES = JSON.stringify([
    { id: 'claude', label: 'A', configDir: dirA },
    { id: 'claude:b', label: 'B', configDir: dirB },
  ]);

  try {
    await withIsolatedDatabase(async () => {
      const { buildProviderRegistry } = await import('@/modules/providers/provider.registry.js');
      const registry = buildProviderRegistry();

      const a = await registry.resolveProvider('claude').sessionSynchronizer.synchronize();
      const b = await registry.resolveProvider('claude:b').sessionSynchronizer.synchronize();

      assert.equal(a, 1, 'profile claude indexed its one session');
      assert.equal(b, 1, 'profile claude:b indexed its one session');

      assert.equal(sessionsDb.getSessionById('sess-a')?.provider, 'claude');
      assert.equal(sessionsDb.getSessionById('sess-b')?.provider, 'claude:b');
    });
  } finally {
    if (originalProfiles === undefined) delete process.env.CLAUDE_PROFILES;
    else process.env.CLAUDE_PROFILES = originalProfiles;
    await rm(dirA, { recursive: true, force: true });
    await rm(dirB, { recursive: true, force: true });
  }
});
