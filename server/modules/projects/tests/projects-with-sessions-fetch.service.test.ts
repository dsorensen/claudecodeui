import assert from 'node:assert/strict';
import test from 'node:test';

import { bucketSessionRowsByProvider } from '@/modules/projects/services/projects-with-sessions-fetch.service.js';

test('bucketSessionRowsByProvider keeps claude:* rows in the claude bucket with their instance id', () => {
  const rows = [
    { provider: 'claude', session_id: 's1', updated_at: '2026-01-01T00:00:00Z' },
    { provider: 'claude:work', session_id: 's2', updated_at: '2026-01-02T00:00:00Z' },
    { provider: 'cursor', session_id: 's3', updated_at: '2026-01-03T00:00:00Z' },
    { provider: 'totally-unknown', session_id: 's4', updated_at: '2026-01-04T00:00:00Z' },
  ];

  const result = bucketSessionRowsByProvider(rows);

  assert.equal(result.claude.length, 2, 'claude and claude:work both land in the claude bucket');
  assert.deepEqual(result.claude.map((s) => s.id).sort(), ['s1', 's2']);
  assert.equal(result.claude.find((s) => s.id === 's2')?.providerInstanceId, 'claude:work');
  assert.equal(result.claude.find((s) => s.id === 's1')?.providerInstanceId, 'claude');
  assert.equal(result.cursor.length, 1);
  assert.equal(result.cursor[0]?.providerInstanceId, 'cursor');

  const total =
    result.claude.length + result.cursor.length + result.codex.length + result.gemini.length + result.opencode.length;
  assert.equal(total, 3, 'the unknown-base row is dropped');
});
